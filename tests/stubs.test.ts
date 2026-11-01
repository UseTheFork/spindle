import assert from "node:assert/strict";
import { readFile, readdir, rm, stat } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { after, before, test } from "node:test";

import matter from "gray-matter";

import { supportedStacks } from "../src/install.ts";
import { renderText } from "../src/render.ts";
import { makeJustStubDir, makeTempDir, pathWith, runCli } from "./helpers.ts";

const shippedSkills = resolve(process.cwd(), "src/blueprints/skills");
const shippedAgents = resolve(process.cwd(), "src/blueprints/agents");
const productionAgents = [
  "sdd-code-reviewer",
  "sdd-code-slop-reviewer",
  "sdd-implementer",
  "sdd-orchestrator",
  "sdd-re-review",
  "sdd-task-reviewer",
  "shared-explore",
  "shared-orchestrator",
  "shared-r",
  "shared-rw",
  "shared-rwx",
];
const productionStackSelections = supportedStacks
  .reduce<string[][]>(
    (selections, stack) => [...selections, ...selections.map((selection) => [...selection, stack])],
    [[]],
  )
  .slice(1);
let justDirectory: string;

before(async () => {
  justDirectory = await makeJustStubDir();
});

after(async () => {
  await rm(justDirectory, { recursive: true, force: true });
});

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
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return false;
  const version = match[1].match(/^version:\s*(\S+)\s*$/m)?.[1];
  if (!version) return false;
  return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.test(
    version,
  );
}

test("every shipped skill has a semver version in SKILL.md frontmatter", async () => {
  const skillFiles = (await filesUnder(shippedSkills))
    .filter((file) => basename(file) === "SKILL.md")
    .map((file) => join(shippedSkills, file));
  assert.ok(skillFiles.length > 0, "expected shipped Skill Blueprints");

  for (const file of skillFiles) {
    const content = await readFile(file, "utf8");
    assert.equal(
      hasSemverVersion(content),
      true,
      `${relative(shippedSkills, file)} needs a semver version`,
    );
  }
});

test("only author-blueprint remains a local skill", async () => {
  assert.deepEqual(await blueprintDirectories(".github/skills"), ["author-blueprint"]);
});

for (const stacks of productionStackSelections) {
  test(`init installs every production Blueprint and supporting file for ${stacks.join(", ")}`, async () => {
    const expectedDirectories = await blueprintDirectories(shippedSkills);
    const project = await makeTempDir("spindle-production-init-");
    try {
      const result = runCli(
        project,
        ["init", ...stacks.flatMap((stack) => ["--stack", stack])],
        pathWith(justDirectory),
      );
      assert.equal(result.status, 0, result.stderr);

      const installedRoot = join(project, ".github/skills");
      assert.deepEqual(await blueprintDirectories(installedRoot), expectedDirectories);

      for (const skill of expectedDirectories) {
        const sourceDirectory = join(shippedSkills, skill);
        const installedDirectory = join(installedRoot, skill);
        const sourceFiles = (await filesUnder(sourceDirectory)).sort();
        const installedFiles = (await filesUnder(installedDirectory)).sort();
        assert.deepEqual(installedFiles, sourceFiles, `${skill} installed file set differs`);

        for (const file of sourceFiles) {
          const source = await readFile(join(sourceDirectory, file), "utf8");
          const installed = await readFile(join(installedDirectory, file), "utf8");
          assert.equal(
            installed,
            renderText(source, {
              stacks,
              variables: { lint_command: "just lint", owner: "nobody" },
            }),
            `${skill}/${file} differs from rendered source`,
          );
        }
      }

      const installedAgents = join(project, ".github", "agents");
      assert.equal(
        await stat(join(project, ".github", "instructions")).catch(() => undefined),
        undefined,
        "production init must not ship Instructions",
      );
      const expectedAgents = await blueprintDirectories(shippedAgents);
      assert.deepEqual(expectedAgents, productionAgents);
      assert.deepEqual(
        (await readdir(installedAgents)).sort(),
        expectedAgents.map((name) => `${name}.agent.md`).sort(),
      );
      for (const agent of expectedAgents) {
        const installedAgent = await readFile(join(installedAgents, `${agent}.agent.md`), "utf8");
        const parsed = matter(installedAgent);
        assert.equal(parsed.data.name, agent);
        assert.equal(hasSemverVersion(installedAgent), true, agent);
        assert.equal(parsed.data.version, "1.0.0", agent);
        assert.ok(parsed.content.trim().length > 0, `${agent} has no Agent instructions`);
        if (agent === "shared-r") {
          assert.equal(
            parsed.data.description,
            "A general subagent that assists with various tasks as directed by the main agent, with read-only capabilities.",
          );
          assert.equal(parsed.data["user-invocable"], false);
          assert.deepEqual(parsed.data.tools, [
            "read",
            "search",
            "todo",
            "read_skill",
            "list_skills",
            "skill",
          ]);
          assert.deepEqual(parsed.data.agents, []);
          assert.match(parsed.content, /You are a general subagent/);
          assert.match(parsed.content, /read and follow all skill requirements/i);
        }
        assert.equal(
          installedAgent,
          await readFile(join(process.cwd(), ".github", "agents", `${agent}.agent.md`), "utf8"),
          `${agent} differs from the tracked .github/agents copy`,
        );
        for (const [, target] of installedAgent.matchAll(/\]\(([^)\s]+)\)/g)) {
          if (/^[a-z][a-z0-9+.-]*:|^#/i.test(target)) continue;
          const linkedPath = resolve(installedAgents, target.split("#")[0]);
          assert.ok(
            (await stat(linkedPath).catch(() => undefined))?.isFile(),
            `${agent} links to missing ${target}`,
          );
        }
      }
      assert.ok(result.stdout.includes(`${expectedAgents.length} agent(s)`));
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });
}
