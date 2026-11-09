import { readFile, readdir, rm, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import matter from "gray-matter";
import { expect, test } from "vitest";

import { renderText } from "@/BlueprintManagement/Rendering/RenderText";
import { Stacks } from "@/Support/Stacks";

import { makeTempDir, runCli } from "../../helpers.ts";

const shippedSkills = resolve(process.cwd(), "src/Blueprints/skills");
const shippedAgents = resolve(process.cwd(), "src/Blueprints/agents");
const productionAgents = [
  "general",
  "sdd-code-reviewer",
  "sdd-code-slop-reviewer",
  "sdd-implementer",
  "sdd-orchestrator",
  "sdd-re-review",
  "sdd-reviewer",
  "sdd-task-reviewer",
  "shared-codebase-analyzer",
  "shared-codebase-locator",
  "shared-codebase-pattern-finder",
  "shared-explore",
  "shared-r",
  "shared-rw",
  "shared-rwx",
  "shared-web-search-researcher",
];
const productionStackSelections = Stacks.supported
  .reduce<string[][]>(
    (selections, stack) => [...selections, ...selections.map((selection) => [...selection, stack])],
    [[]],
  )
  .slice(1);

async function blueprintDirectories(directory: string) {
  return (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function filesUnder(directory: string, prefix = ""): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const relativePath = join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(path, relativePath)));
    else files.push(relativePath);
  }
  return files;
}

function hasSemverVersion(content: string) {
  const version = matter(content, {}).data.metadata?.spindle?.version;
  if (typeof version !== "string") return false;
  return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.test(
    version,
  );
}

for (const stacks of productionStackSelections) {
  test(`init installs every production Blueprint and supporting file for ${stacks.join(", ")}`, async () => {
    const expectedDirectories = await blueprintDirectories(shippedSkills);
    const project = await makeTempDir("spindle-production-init-");
    try {
      const result = runCli(
        project,
        ["init", ...stacks.flatMap((stack) => ["--stack", stack])],
        process.env.PATH ?? "",
      );
      expect(result.status, result.stderr).toBe(0);

      const installedRoot = join(project, ".github/skills");
      expect(await blueprintDirectories(installedRoot)).toEqual(expectedDirectories);

      for (const skill of expectedDirectories) {
        const sourceDirectory = join(shippedSkills, skill);
        const installedDirectory = join(installedRoot, skill);
        const sourceFiles = (await filesUnder(sourceDirectory)).sort();
        const installedFiles = (await filesUnder(installedDirectory)).sort();
        expect(installedFiles, `${skill} installed file set differs`).toEqual(sourceFiles);
        if (skill === "int-subagent-driven-dev") {
          expect((await readdir(installedDirectory)).sort()).toEqual([
            "SKILL.md",
            "assets",
            "references",
          ]);
          expect((await readdir(join(installedDirectory, "assets"))).sort()).toEqual([
            "implementer-prompt.md",
            "reviewer-prompt.md",
          ]);
        }

        for (const file of sourceFiles) {
          const source = await readFile(join(sourceDirectory, file), "utf8");
          const installed = await readFile(join(installedDirectory, file), "utf8");
          expect(installed, `${skill}/${file} differs from rendered source`).toBe(
            renderText(source, {
              stacks,
              variables: { lint_command: "just lint", owner: "nobody" },
              computed: {
                internal_skill_description:
                  "This is an internal skill do not load it unless explicitly required by the user or another skill.",
              },
            }),
          );
          if (skill === "int-subagent-driven-dev") {
            expect(installed).not.toMatch(/\]\([^)]*\.agent\.md(?:#[^)]*)?\)/);
            expect(installed).not.toMatch(
              /sdd-(?:code-reviewer|code-slop-reviewer|task-reviewer|re-review)\b/,
            );
            if (file === "SKILL.md") {
              expect(installed).toMatch(
                /invocation access to `sdd-implementer` and `sdd-reviewer`/,
              );
              expect(installed).toMatch(/`Execution: in-review`/);
              expect(installed).not.toMatch(/spindle sdd/);
            }
            if (file === "references/corrective-rounds.md") {
              expect(installed).toMatch(/explicit controller continuation decision/);
              expect(installed).toMatch(/Batch compatible confirmed blockers/);
            }
            if (file === "references/full-spec.md") {
              expect(installed).toMatch(/There is no single-final-fix allowance/);
              expect(installed).toMatch(/`int-retrospective` skill/);
            }
            if (dirname(file) === "assets") {
              expect(installed).toMatch(/^## Assignment$/m);
              expect(installed).toMatch(/^## (?:Verification and hand-back|Hand-back)$/m);
              expect(installed).not.toMatch(/\*\*/);
            }
            for (const [, target] of installed.matchAll(/\]\(([^)\s]+)\)/g)) {
              if (/^[a-z][a-z0-9+.-]*:|^#/i.test(target)) continue;
              const linkedPath = resolve(
                dirname(join(installedDirectory, file)),
                target.split("#")[0],
              );
              expect(
                (await stat(linkedPath).catch(() => undefined))?.isFile(),
                `${skill}/${file} links to missing ${target}`,
              ).toBeTruthy();
            }
          }
        }
      }

      const installedAgents = join(project, ".github", "agents");
      expect(
        await stat(join(project, ".github", "instructions")).catch(() => undefined),
        "production init must not ship Instructions",
      ).toBe(undefined);
      const expectedAgents = (await filesUnder(shippedAgents))
        .filter((file) => file.endsWith(".agent.md"))
        .map((file) => basename(file, ".agent.md"))
        .sort();
      expect(expectedAgents).toEqual(productionAgents);
      expect((await readdir(installedAgents)).sort()).toEqual(
        expectedAgents.map((name) => `${name}.agent.md`).sort(),
      );
      for (const agent of expectedAgents) {
        const installedAgent = await readFile(join(installedAgents, `${agent}.agent.md`), "utf8");
        const shippedAgent = await readFile(join(shippedAgents, `${agent}.agent.md`), "utf8");
        const parsed = matter(installedAgent);
        expect(typeof parsed.data.name, `${agent} has a name`).toBe("string");
        expect(hasSemverVersion(installedAgent), agent).toBe(true);
        expect(parsed.data.metadata.spindle.version, agent).toBe(
          matter(shippedAgent).data.metadata.spindle.version,
        );
        expect(parsed.content.trim().length > 0, `${agent} has no Agent instructions`).toBeTruthy();
        if (agent.startsWith("sdd-")) {
          expect(installedAgent).not.toMatch(/\]\([^)]*SKILL\.md(?:#[^)]*)?\)/);
          expect(installedAgent).toMatch(/[Ll]oad and follow the `int-[^`]+` skill/);
        }
        if (agent === "sdd-orchestrator") {
          expect(parsed.data.agents).toEqual(["sdd-implementer", "sdd-reviewer", "shared-explore"]);
        }
        if (agent === "shared-r") {
          expect(parsed.data.description).toBe(
            "A general subagent that assists with various tasks as directed by the main agent, with read-only capabilities.",
          );
          expect(parsed.data["user-invocable"]).toBe(false);
          expect(parsed.data.tools).toEqual([
            "read",
            "search",
            "todo",
            "read_skill",
            "list_skills",
            "skill",
          ]);
          expect(parsed.data.agents).toEqual([]);
          expect(parsed.content).toMatch(/You are a general subagent/);
          expect(parsed.content).toMatch(/read and follow all skill requirements/i);
        }
        for (const [, target] of installedAgent.matchAll(/\]\(([^)\s]+)\)/g)) {
          if (/^[a-z][a-z0-9+.-]*:|^#/i.test(target)) continue;
          const linkedPath = resolve(installedAgents, target.split("#")[0]);
          expect(
            (await stat(linkedPath).catch(() => undefined))?.isFile(),
            `${agent} links to missing ${target}`,
          ).toBeTruthy();
        }
      }
      expect(result.stdout.includes(`${expectedAgents.length} agent(s)`)).toBeTruthy();
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });
}
