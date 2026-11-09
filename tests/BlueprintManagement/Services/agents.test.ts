import { symlinkSync, writeFileSync } from "node:fs";
import { lstat, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join } from "node:path";

import { expect, test } from "vitest";

import type { BlueprintCatalogDefinition } from "@/BlueprintManagement/Catalog/BlueprintCatalog";

import { writeCatalogFixture } from "../../helpers/CatalogFixtures.ts";
import {
  runCliWithFixtureCatalog as runCli,
  runCliInteractiveWithFixtureCatalog as runCliInteractive,
} from "../../helpers/Cli.ts";
import { makeTempDir, repoRoot } from "../../helpers/TemporaryDirectories.ts";

test("init installs and reports a rendered Agent alongside a same-named Skill", async () => {
  const blueprints = await makeTempDir("spindle-agent-blueprints-");
  const project = await makeTempDir("spindle-agent-project-");
  {
    await mkdir(join(blueprints, "skills", "demo"), { recursive: true });
    await writeFile(
      join(blueprints, "skills", "demo", "SKILL.md"),
      "---\nname: demo\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nSkill\n",
    );
    await mkdir(join(blueprints, "agents", "demo"), { recursive: true });
    await writeFile(
      join(blueprints, "agents", "demo.agent.md"),
      [
        "---",
        "name: demo",
        'description: "Agent for {{ variables.owner }}"',
        "metadata:",
        "  spindle:",
        "    version: 1.0.0",
        "---",
        "{% if 'python' in stacks %}Python Agent{% endif %}",
        "",
      ].join("\n"),
    );

    const result = runCli(
      project,
      ["init", "--stack", "python", "--var", "owner=team"],
      process.env.PATH ?? "",
      { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("✔ Installed 1 skill(s), 1 agent(s) for python\n");
    expect(await readdir(join(project, ".github", "agents"))).toEqual(["demo.agent.md"]);
    expect(await readFile(join(project, ".github", "agents", "demo.agent.md"), "utf8")).toBe(
      '---\nname: demo\ndescription: "Agent for team"\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nPython Agent\n',
    );
    expect(await readFile(join(project, ".github", "skills", "demo", "SKILL.md"), "utf8")).toMatch(
      /Skill/,
    );
  }
});

test("update replaces only older versioned Agents and warns about unknown versions", async () => {
  const blueprints = await makeTempDir("spindle-agent-version-blueprints-");
  const project = await makeTempDir("spindle-agent-version-project-");
  const installedAgents = join(project, ".github", "agents");
  const contents = (name: string, version: string | null, body: string) =>
    `---\nname: ${name}\n${version === null ? "" : `metadata:\n  spindle:\n    version: ${version}\n`}---\n${body}\n`;
  {
    await mkdir(installedAgents, { recursive: true });
    await writeFile(
      join(project, ".github", "spindle.json"),
      JSON.stringify({ stacks: ["python"], variables: { owner: "team" } }),
    );
    for (const [name, shipped, installed] of [
      ["outdated", "2.0.0", "1.0.0"],
      ["equal", "1.0.0", "1.0.0"],
      ["newer-installed", "1.0.0", "9.0.0"],
      ["unversioned", "1.0.0", null],
      ["invalid", "1.0.0", "v1"],
      ["new", "1.0.0", undefined],
    ] as const) {
      await mkdir(join(blueprints, "agents", name), { recursive: true });
      await writeFile(
        join(blueprints, "agents", `${name}.agent.md`),
        contents(name, shipped, "shipped {{ variables.owner }}"),
      );
      if (installed !== undefined) {
        await writeFile(
          join(installedAgents, `${name}.agent.md`),
          contents(name, installed, "preserve local content"),
        );
      }
    }

    const result = runCli(
      project,
      ["update", "--no-interactive", "--on-conflict", "overwrite"],
      process.env.PATH ?? "",
      { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(await readFile(join(installedAgents, "equal.agent.md"), "utf8")).toBe(
      contents("equal", "1.0.0", "preserve local content"),
    );
    expect(await readFile(join(installedAgents, "newer-installed.agent.md"), "utf8")).toBe(
      contents("newer-installed", "9.0.0", "preserve local content"),
    );
    expect(await readFile(join(installedAgents, "unversioned.agent.md"), "utf8")).toBe(
      contents("unversioned", null, "preserve local content"),
    );
    expect(await readFile(join(installedAgents, "invalid.agent.md"), "utf8")).toBe(
      contents("invalid", "v1", "preserve local content"),
    );
    expect(await readFile(join(installedAgents, "outdated.agent.md"), "utf8")).toBe(
      contents("outdated", "2.0.0", "shipped team"),
    );
    await expect(readFile(join(installedAgents, "new.agent.md"))).rejects.toThrow();
    expect(result.stderr).toMatch(/Agent 'unversioned\.agent\.md'.*no version/);
    expect(result.stderr).toMatch(/Agent 'invalid\.agent\.md'.*non-semver version 'v1'/);
    expect(result.stdout).toBe("✔ Added 0, updated 1, skipped 3, up to date 2 agent(s)\n");
  }
});

test("init ignores unlisted Agent sources while installing the catalog-selected file", async () => {
  const blueprints = await makeTempDir("spindle-agent-extra-blueprints-");
  const project = await makeTempDir("spindle-agent-extra-project-");
  const skillPath = join(project, ".github", "skills", "demo", "SKILL.md");
  const agentPath = join(project, ".github", "agents", "demo.agent.md");
  {
    await mkdir(join(blueprints, "skills", "demo"), { recursive: true });
    await writeFile(
      join(blueprints, "skills", "demo", "SKILL.md"),
      "---\nmetadata:\n  spindle:\n    version: 2.0.0\n---\nshipped Skill\n",
    );
    await mkdir(join(blueprints, "agents", "demo"), { recursive: true });
    await writeFile(
      join(blueprints, "agents", "demo.agent.md"),
      "---\nmetadata:\n  spindle:\n    version: 2.0.0\n---\nshipped Agent\n",
    );
    await writeFile(join(blueprints, "agents", "guide.md"), "unlisted source\n");
    await mkdir(join(project, ".github", "skills", "demo"), { recursive: true });
    await mkdir(join(project, ".github", "agents"), { recursive: true });
    await writeFile(skillPath, "existing Skill\n");
    await writeFile(agentPath, "existing Agent\n");

    const result = runCli(
      project,
      ["init", "--stack", "python", "--on-conflict", "overwrite"],
      process.env.PATH ?? "",
      { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(await readFile(skillPath, "utf8")).toMatch(/shipped Skill/);
    expect(await readFile(agentPath, "utf8")).toMatch(/shipped Agent/);
    await expect(readFile(join(project, ".github", "agents", "guide.md"))).rejects.toThrow();
    await readFile(join(project, ".github", "spindle.json"));
  }
});

test("init checks Agent conflicts before installing other Blueprint kinds", async () => {
  const blueprints = await makeTempDir("spindle-agent-conflict-blueprints-");
  const project = await makeTempDir("spindle-agent-conflict-project-");
  const agentPath = join(project, ".github", "agents", "demo.agent.md");
  {
    await mkdir(join(blueprints, "skills", "demo"), { recursive: true });
    await writeFile(
      join(blueprints, "skills", "demo", "SKILL.md"),
      "---\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nshipped Skill\n",
    );
    await mkdir(join(blueprints, "agents", "demo"), { recursive: true });
    await writeFile(
      join(blueprints, "agents", "demo.agent.md"),
      "---\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nshipped Agent\n",
    );
    await mkdir(join(project, ".github", "agents"), { recursive: true });
    await writeFile(agentPath, "existing Agent\n");

    const result = runCli(
      project,
      ["init", "--stack", "python", "--no-interactive"],
      process.env.PATH ?? "",
      { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/Agent 'demo\.agent\.md'.*--on-conflict/);
    await expect(
      readFile(join(project, ".github", "skills", "demo", "SKILL.md")),
    ).rejects.toThrow();
    expect(await readFile(agentPath, "utf8")).toBe("existing Agent\n");
    await expect(readFile(join(project, ".github", "spindle.json"))).rejects.toThrow();
  }
});

test(
  "interactive init identifies an Agent conflict by kind",
  { skip: process.platform !== "linux" },
  async () => {
    const blueprints = await makeTempDir("spindle-agent-prompt-blueprints-");
    const project = await makeTempDir("spindle-agent-prompt-project-");
    const agentPath = join(project, ".github", "agents", "demo.agent.md");
    {
      await mkdir(join(blueprints, "agents", "demo"), { recursive: true });
      await writeFile(
        join(blueprints, "agents", "demo.agent.md"),
        "---\nname: demo\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nshipped Agent\n",
      );
      await mkdir(join(project, ".github", "agents"), { recursive: true });
      await writeFile(agentPath, "existing Agent\n");

      const result = await runCliInteractive(
        project,
        ["init", "--stack", "python", "--var", "owner=team", "--var", "lint_command=just lint"],
        process.env.PATH ?? "",
        [{ trigger: "What should happen?", input: "\r" }],
        { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints },
      );

      expect(result.status, result.stdout).toBe(0);
      expect(result.stdout).toMatch(
        /Agent 'demo\.agent\.md' already exists\. What should happen\?/,
      );
      expect(await readFile(agentPath, "utf8")).toMatch(/shipped Agent/);
    }
  },
);

test(
  "interactive update identifies new and outdated Agents by kind",
  { skip: process.platform !== "linux" },
  async () => {
    const blueprints = await makeTempDir("spindle-agent-update-prompt-blueprints-");
    const project = await makeTempDir("spindle-agent-update-prompt-project-");
    {
      for (const [name, version] of [
        ["demo", "2.0.0"],
        ["newcomer", "1.0.0"],
      ]) {
        await mkdir(join(blueprints, "agents", name), { recursive: true });
        await writeFile(
          join(blueprints, "agents", `${name}.agent.md`),
          `---\nname: ${name}\nmetadata:\n  spindle:\n    version: ${version}\n---\nshipped ${name}\n`,
        );
      }
      await mkdir(join(project, ".github", "agents"), { recursive: true });
      await writeFile(
        join(project, ".github", "spindle.json"),
        JSON.stringify({ stacks: ["python"], variables: { owner: "team" } }),
      );
      await writeFile(
        join(project, ".github", "agents", "demo.agent.md"),
        "---\nname: demo\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nold demo\n",
      );

      const result = await runCliInteractive(
        project,
        ["update"],
        process.env.PATH ?? "",
        [
          { trigger: "Enter: confirm", input: "\r" },
          { trigger: "What should happen?", input: "\r" },
        ],
        { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints },
      );

      expect(result.status, result.stdout).toBe(0);
      expect(result.stdout).toMatch(/Which new Agents should be installed\?/);
      expect(result.stdout).toMatch(
        /Agent 'demo\.agent\.md' is outdated \(installed 1\.0\.0, available 2\.0\.0\)/,
      );
      expect(result.stdout).toMatch(/Added 1, updated 1, skipped 0, up to date 0 agent\(s\)/);
      expect(await readFile(join(project, ".github", "agents", "demo.agent.md"), "utf8")).toMatch(
        /shipped demo/,
      );
      expect(
        await readFile(join(project, ".github", "agents", "newcomer.agent.md"), "utf8"),
      ).toMatch(/shipped newcomer/);
    }
  },
);

test("init preserves an existing Agent when rendered version metadata is invalid", async () => {
  const blueprints = await makeTempDir("spindle-agent-metadata-blueprints-");
  const project = await makeTempDir("spindle-agent-metadata-project-");
  const agentPath = join(project, ".github", "agents", "demo.agent.md");
  {
    await mkdir(join(blueprints, "agents", "demo"), { recursive: true });
    await writeFile(
      join(blueprints, "agents", "demo.agent.md"),
      "---\nname: demo\nmetadata:\n  spindle:\n    version: {{ variables.owner }}\n---\nshipped Agent\n",
    );
    await mkdir(join(project, ".github", "agents"), { recursive: true });
    await writeFile(agentPath, "existing Agent\n");

    const result = runCli(
      project,
      ["init", "--stack", "python", "--var", "owner=not-semver", "--on-conflict", "overwrite"],
      process.env.PATH ?? "",
      { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/Invalid Agent metadata.*semver.*version/);
    expect(await readFile(agentPath, "utf8")).toBe("existing Agent\n");
    await expect(readFile(join(project, ".github", "spindle.json"))).rejects.toThrow();
  }
});

test("init rejects a non-text Agent entry without replacing its destination", async () => {
  const blueprints = await makeTempDir("spindle-agent-binary-blueprints-");
  const project = await makeTempDir("spindle-agent-binary-project-");
  const agentPath = join(project, ".github", "agents", "demo.agent.md");
  {
    await mkdir(join(blueprints, "agents", "demo"), { recursive: true });
    await writeFile(
      join(blueprints, "agents", "demo.agent.md"),
      Buffer.from("---\nmetadata:\n  spindle:\n    version: 1.0.0\n---\ninvalid\0content\n"),
    );
    await mkdir(join(project, ".github", "agents"), { recursive: true });
    await writeFile(agentPath, "existing Agent\n");

    const result = runCli(
      project,
      ["init", "--stack", "python", "--on-conflict", "overwrite"],
      process.env.PATH ?? "",
      { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/demo\.agent\.md.*valid UTF-8 text/);
    expect(await readFile(agentPath, "utf8")).toBe("existing Agent\n");
    await expect(readFile(join(project, ".github", "spindle.json"))).rejects.toThrow();
  }
});

test("init and update help describe Blueprint kinds and generic policies", async () => {
  const project = await makeTempDir("spindle-agent-help-project-");
  {
    const init = runCli(project, ["init", "--help"], process.env.PATH ?? "");
    const update = runCli(project, ["update", "--help"], process.env.PATH ?? "");

    expect(init.status, init.stderr).toBe(0);
    expect(init.stdout).toMatch(/Blueprints.*Skills, Agents, and Instructions/i);
    expect(init.stdout).toMatch(/--on-conflict[\s\S]*Blueprint/i);
    expect(update.status, update.stderr).toBe(0);
    expect(update.stdout).toMatch(/Blueprints.*Skills, Agents, and Instructions/i);
    expect(update.stdout).toMatch(/--on-conflict[\s\S]*Blueprint/i);
    expect(update.stdout).toMatch(/--include-new\s+Install.*Blueprint/i);
  }
});

test("production init succeeds with shipped Agents", async () => {
  const project = await makeTempDir("spindle-agent-production-project-");
  {
    const result = runCli(project, ["init", "--stack", "python"], process.env.PATH ?? "");

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/^✔ Installed /);
  }
});

test(
  "update rejects a symlinked destination for a Stack-inapplicable catalog Agent",
  { skip: process.platform === "win32" },
  async () => {
    const blueprints = await makeTempDir("spindle-agent-omitted-blueprints-");
    const project = await makeTempDir("spindle-agent-omitted-project-");
    const outside = join(project, "outside.md");
    const target = join(project, ".github", "agents", "optional.agent.md");
    {
      await mkdir(join(blueprints, "skills", "demo"), { recursive: true });
      await writeFile(
        join(blueprints, "skills", "demo", "SKILL.md"),
        "---\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nSkill\n",
      );
      await mkdir(join(blueprints, "agents"), { recursive: true });
      await writeFile(
        join(blueprints, "agents", "optional.agent.md"),
        "---\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nPython only\n",
      );
      writeCatalogFixture(blueprints, {
        agents: {
          optional: {
            path: "optional.agent.md",
            status: "active",
            stacks: ["python"],
          },
        },
        instructions: {},
        skills: {
          demo: {
            path: "demo/",
            status: "active",
            stacks: [],
          },
        },
      } satisfies BlueprintCatalogDefinition);
      await mkdir(join(project, ".github", "skills", "demo"), { recursive: true });
      await mkdir(join(project, ".github", "agents"), { recursive: true });
      await writeFile(
        join(project, ".github", "spindle.json"),
        JSON.stringify({ stacks: ["typescript"], variables: {} }),
      );
      await writeFile(
        join(project, ".github", "skills", "demo", "SKILL.md"),
        "---\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nlocal Skill\n",
      );
      await writeFile(outside, "outside remains untouched\n");
      await symlink(outside, join(project, ".github", "agents", "optional.agent.md"));

      const result = runCli(project, ["update", "--no-interactive"], process.env.PATH ?? "", {
        SPINDLE_TEST_BLUEPRINTS_DIR: blueprints,
      });

      expect(result.status, result.stdout).not.toBe(0);
      expect(result.stderr).toMatch(/symbolic link/i);
      expect(await readFile(outside, "utf8")).toBe("outside remains untouched\n");
      expect((await lstat(target)).isSymbolicLink()).toBe(true);
    }
  },
);

test(
  "update refuses an Agent destination changed to a symlink while prompting",
  { skip: process.platform !== "linux" },
  async () => {
    const blueprints = await makeTempDir("spindle-agent-race-blueprints-");
    const project = await makeTempDir("spindle-agent-race-project-");
    const outside = join(project, "outside.md");
    const newTarget = join(project, ".github", "agents", "newcomer.agent.md");
    {
      for (const [name, version] of [
        ["newcomer", "1.0.0"],
        ["old", "2.0.0"],
      ]) {
        await mkdir(join(blueprints, "agents", name), { recursive: true });
        await writeFile(
          join(blueprints, "agents", `${name}.agent.md`),
          `---\nname: ${name}\nmetadata:\n  spindle:\n    version: ${version}\n---\nshipped ${name}\n`,
        );
      }
      await mkdir(join(project, ".github", "agents"), { recursive: true });
      await writeFile(
        join(project, ".github", "spindle.json"),
        JSON.stringify({ stacks: ["python"], variables: {} }),
      );
      await writeFile(
        join(project, ".github", "agents", "old.agent.md"),
        "---\nname: old\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nold Agent\n",
      );
      await writeFile(outside, "outside remains untouched\n");

      const result = await runCliInteractive(
        project,
        ["update"],
        process.env.PATH ?? "",
        [
          {
            trigger: "Enter: confirm",
            input: "\r",
            beforeInput: () => symlinkSync(outside, newTarget),
          },
          { trigger: "is outdated", input: "\r" },
        ],
        { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints },
      );

      expect(result.status, result.stdout).not.toBe(0);
      expect(result.stdout + result.stderr).toMatch(
        /newcomer\.agent\.md.*symbolic link|symbolic link.*newcomer\.agent\.md/i,
      );
      expect(await readFile(outside, "utf8")).toBe("outside remains untouched\n");
    }
  },
);

test(
  "update preserves an Agent file created while its new-install prompt is open",
  { skip: process.platform !== "linux" },
  async () => {
    const blueprints = await makeTempDir("spindle-agent-new-conflict-blueprints-");
    const project = await makeTempDir("spindle-agent-new-conflict-project-");
    const newTarget = join(project, ".github", "agents", "newcomer.agent.md");
    {
      await mkdir(join(blueprints, "agents", "newcomer"), { recursive: true });
      await writeFile(
        join(blueprints, "agents", "newcomer.agent.md"),
        "---\nname: newcomer\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nshipped Agent\n",
      );
      await mkdir(join(project, ".github", "agents"), { recursive: true });
      await writeFile(
        join(project, ".github", "spindle.json"),
        JSON.stringify({ stacks: ["python"], variables: {} }),
      );

      const result = await runCliInteractive(
        project,
        ["update"],
        process.env.PATH ?? "",
        [
          {
            trigger: "Enter: confirm",
            input: "\r",
            beforeInput: () => writeFileSync(newTarget, "created during prompt\n"),
          },
        ],
        { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints },
      );

      expect(result.status, result.stdout).not.toBe(0);
      expect(result.stdout + result.stderr).toMatch(/Agent 'newcomer\.agent\.md'.*already exists/);
      expect(await readFile(newTarget, "utf8")).toBe("created during prompt\n");
    }
  },
);

test("init and update omit Stack-inapplicable catalog Agents", async () => {
  const blueprints = await makeTempDir("spindle-agent-catalog-filter-blueprints-");
  const project = await makeTempDir("spindle-agent-catalog-filter-project-");
  {
    await mkdir(join(blueprints, "agents"), { recursive: true });
    await writeFile(
      join(blueprints, "agents", "python-only.agent.md"),
      "---\nname: python-only\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nPython Agent\n",
    );
    writeCatalogFixture(blueprints, {
      agents: {
        "python-only": {
          path: "python-only.agent.md",
          status: "active",
          stacks: ["python"],
        },
      },
      instructions: {},
      skills: {
        baseline: {
          path: "baseline/",
          status: "active",
          stacks: [],
        },
      },
    } satisfies BlueprintCatalogDefinition);
    await mkdir(join(blueprints, "skills", "baseline"), { recursive: true });
    await writeFile(
      join(blueprints, "skills", "baseline", "SKILL.md"),
      "---\nname: baseline\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nBaseline\n",
    );
    const env = { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints };
    const init = runCli(project, ["init", "--stack", "typescript"], process.env.PATH ?? "", env);

    expect(init.status, init.stderr).toBe(0);
    expect(init.stdout).toBe("✔ Installed 1 skill(s) for typescript\n");
    await expect(readdir(join(project, ".github", "agents"))).rejects.toMatchObject({
      code: "ENOENT",
    });

    const update = runCli(
      project,
      ["update", "--no-interactive", "--include-new"],
      process.env.PATH ?? "",
      env,
    );
    expect(update.status, update.stderr).toBe(0);
    expect(update.stdout).toMatch(/up to date 1 skill\(s\)/);
    await expect(readdir(join(project, ".github", "agents"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  }
});

test("update warns and preserves an Agent with unreadable version frontmatter", async () => {
  const blueprints = await makeTempDir("spindle-agent-bad-frontmatter-blueprints-");
  const project = await makeTempDir("spindle-agent-bad-frontmatter-project-");
  const agentPath = join(project, ".github", "agents", "demo.agent.md");
  const installed =
    "---\nname: demo\nmetadata:\n  spindle:\n    version: [unterminated\n---\nlocal Agent\n";
  {
    await mkdir(join(blueprints, "agents", "demo"), { recursive: true });
    await writeFile(
      join(blueprints, "agents", "demo.agent.md"),
      "---\nname: demo\nmetadata:\n  spindle:\n    version: 2.0.0\n---\nshipped Agent\n",
    );
    await mkdir(join(project, ".github", "agents"), { recursive: true });
    await writeFile(
      join(project, ".github", "spindle.json"),
      JSON.stringify({ stacks: ["python"], variables: {} }),
    );
    await writeFile(agentPath, installed);

    const result = runCli(
      project,
      ["update", "--no-interactive", "--on-conflict", "overwrite"],
      process.env.PATH ?? "",
      { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toMatch(/Agent 'demo\.agent\.md'.*no version/);
    expect(result.stdout).toMatch(/skipped 1.*agent\(s\)/);
    expect(await readFile(agentPath, "utf8")).toBe(installed);
  }
});

test("update renders a block-templated Agent version before comparing it", async () => {
  const blueprints = await makeTempDir("spindle-agent-version-template-blueprints-");
  const project = await makeTempDir("spindle-agent-version-template-project-");
  const agentPath = join(project, ".github", "agents", "demo.agent.md");
  {
    await mkdir(join(blueprints, "agents", "demo"), { recursive: true });
    await writeFile(
      join(blueprints, "agents", "demo.agent.md"),
      [
        "---",
        "name: demo",
        "metadata:",
        "  spindle:",
        "    version: {% if 'python' in stacks %}2.1.0{% else %}1.0.0{% endif %}",
        "---",
        "shipped for {{ variables.owner }}",
        "",
      ].join("\n"),
    );
    await mkdir(join(project, ".github", "agents"), { recursive: true });
    await writeFile(
      join(project, ".github", "spindle.json"),
      JSON.stringify({ stacks: ["python"], variables: { owner: "team" } }),
    );
    await writeFile(
      agentPath,
      "---\nname: demo\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nlocal Agent\n",
    );

    const result = runCli(
      project,
      ["update", "--no-interactive", "--on-conflict", "overwrite"],
      process.env.PATH ?? "",
      { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(await readFile(agentPath, "utf8")).toBe(
      "---\nname: demo\nmetadata:\n  spindle:\n    version: 2.1.0\n---\nshipped for team\n",
    );
    expect(result.stdout).toMatch(/updated 1.*agent\(s\)/);
  }
});

test("update compares large numeric SemVer identifiers without losing precision", async () => {
  const blueprints = await makeTempDir("spindle-agent-large-version-blueprints-");
  const project = await makeTempDir("spindle-agent-large-version-project-");
  {
    await mkdir(join(project, ".github", "agents"), { recursive: true });
    await writeFile(
      join(project, ".github", "spindle.json"),
      JSON.stringify({ stacks: ["python"], variables: {} }),
    );
    for (const [name, installed, shipped] of [
      ["core", "9007199254740992.0.0", "9007199254740993.0.0"],
      ["prerelease", "1.0.0-9007199254740992", "1.0.0-9007199254740993"],
    ]) {
      await mkdir(join(blueprints, "agents", name), { recursive: true });
      await writeFile(
        join(blueprints, "agents", `${name}.agent.md`),
        `---\nname: ${name}\nmetadata:\n  spindle:\n    version: ${shipped}\n---\nshipped\n`,
      );
      await writeFile(
        join(project, ".github", "agents", `${name}.agent.md`),
        `---\nname: ${name}\nmetadata:\n  spindle:\n    version: ${installed}\n---\nlocal\n`,
      );
    }

    const result = runCli(
      project,
      ["update", "--no-interactive", "--on-conflict", "overwrite"],
      process.env.PATH ?? "",
      { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/updated 2.*agent\(s\)/);
    expect(await readFile(join(project, ".github", "agents", "core.agent.md"), "utf8")).toMatch(
      /version: 9007199254740993\.0\.0/,
    );
    expect(
      await readFile(join(project, ".github", "agents", "prerelease.agent.md"), "utf8"),
    ).toMatch(/version: 1\.0\.0-9007199254740993/);
  }
});

test("catalog-selected Agent file installs and updates as a single rendered file", async () => {
  const blueprints = await makeTempDir("spindle-agent-catalog-blueprints-");
  const project = await makeTempDir("spindle-agent-catalog-project-");
  const source = join(blueprints, "agents", "python-only.agent.md");
  const target = join(project, ".github", "agents", "python-only.agent.md");
  const agent = (version: string) =>
    `---\nname: python-only\nmetadata:\n  spindle:\n    version: ${version}\n---\nOwner {{ variables.owner }} for {{ stacks | join(',') }}\n`;
  {
    await mkdir(join(source, ".."), { recursive: true });
    await writeFile(source, agent("1.0.0"));
    const env = { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints };
    const init = runCli(
      project,
      ["init", "--stack", "python", "--var", "owner=team"],
      process.env.PATH ?? "",
      env,
    );
    expect(init.status, init.stderr).toBe(0);
    expect(await readdir(join(project, ".github", "agents"))).toEqual(["python-only.agent.md"]);
    expect(await readFile(target, "utf8")).toBe(
      "---\nname: python-only\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nOwner team for python\n",
    );

    await writeFile(source, agent("2.0.0"));
    const update = runCli(
      project,
      ["update", "--no-interactive", "--on-conflict", "overwrite"],
      process.env.PATH ?? "",
      env,
    );
    expect(update.status, update.stderr).toBe(0);
    expect(update.stdout).toMatch(/updated 1.*agent\(s\)/);
    expect(await readFile(target, "utf8")).toBe(
      "---\nname: python-only\nmetadata:\n  spindle:\n    version: 2.0.0\n---\nOwner team for python\n",
    );
  }
});

test("init and update fail clearly when all registered kinds are empty or missing", async () => {
  const blueprints = await makeTempDir("spindle-empty-kinds-blueprints-");
  const project = await makeTempDir("spindle-empty-kinds-project-");
  {
    await mkdir(join(blueprints, "skills"), { recursive: true });
    const env = { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints };
    const init = runCli(project, ["init", "--stack", "python"], process.env.PATH ?? "", env);
    expect(init.status).not.toBe(0);
    expect(init.stderr).toMatch(/No Blueprints are available/i);
    await expect(readFile(join(project, ".github", "spindle.json"))).rejects.toThrow();

    await mkdir(join(project, ".github"), { recursive: true });
    const config = JSON.stringify({ stacks: ["python"], variables: {} });
    await writeFile(join(project, ".github", "spindle.json"), config);
    const update = runCli(project, ["update", "--no-interactive"], process.env.PATH ?? "", env);
    expect(update.status).not.toBe(0);
    expect(update.stderr).toMatch(/No Blueprints are available/i);
    expect(await readFile(join(project, ".github", "spindle.json"), "utf8")).toBe(config);
  }
});

test(
  "init and update reject existing or dangling symlinks at the Agent file destination",
  { skip: process.platform === "win32" },
  async () => {
    for (const command of ["init", "update"] as const) {
      for (const dangling of [false, true]) {
        const blueprints = await makeTempDir("spindle-agent-link-blueprints-");
        const project = await makeTempDir("spindle-agent-link-project-");
        const outside = join(project, "outside.md");
        const skillPath = join(project, ".github", "skills", "demo", "SKILL.md");
        {
          await mkdir(join(blueprints, "skills", "demo"), { recursive: true });
          await writeFile(
            join(blueprints, "skills", "demo", "SKILL.md"),
            "---\nmetadata:\n  spindle:\n    version: 2.0.0\n---\nshipped Skill\n",
          );
          await mkdir(join(blueprints, "agents", "demo"), { recursive: true });
          await writeFile(
            join(blueprints, "agents", "demo.agent.md"),
            "---\nmetadata:\n  spindle:\n    version: 2.0.0\n---\nshipped Agent\n",
          );
          await mkdir(join(project, ".github", "skills", "demo"), { recursive: true });
          await mkdir(join(project, ".github", "agents"), { recursive: true });
          await writeFile(
            skillPath,
            "---\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nlocal Skill\n",
          );
          if (!dangling) await writeFile(outside, "outside remains untouched\n");
          await symlink(outside, join(project, ".github", "agents", "demo.agent.md"));
          if (command === "update") {
            await writeFile(
              join(project, ".github", "spindle.json"),
              JSON.stringify({ stacks: ["python"], variables: {} }),
            );
          }
          const args =
            command === "init"
              ? ["init", "--stack", "python", "--on-conflict", "overwrite"]
              : ["update", "--no-interactive", "--on-conflict", "overwrite"];
          const result = runCli(project, args, process.env.PATH ?? "", {
            SPINDLE_TEST_BLUEPRINTS_DIR: blueprints,
          });

          expect(result.status, `${command}, dangling=${dangling}`).not.toBe(0);
          expect(result.stderr).toMatch(/symbolic link.*demo\.agent\.md/i);
          expect(await readFile(skillPath, "utf8")).toBe(
            "---\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nlocal Skill\n",
          );
          if (dangling) await expect(readFile(outside)).rejects.toThrow();
          else expect(await readFile(outside, "utf8")).toBe("outside remains untouched\n");
        }
      }
    }
  },
);

test("init applies skip and overwrite policies to the Agent file only", async () => {
  const blueprints = await makeTempDir("spindle-agent-policy-blueprints-");
  const project = await makeTempDir("spindle-agent-policy-project-");
  const target = join(project, ".github", "agents", "demo.agent.md");
  const other = join(project, ".github", "agents", "unmanaged.agent.md");
  {
    await mkdir(join(blueprints, "agents", "demo"), { recursive: true });
    await writeFile(
      join(blueprints, "agents", "demo.agent.md"),
      "---\nname: demo\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nshipped Agent\n",
    );
    await mkdir(join(project, ".github", "agents"), { recursive: true });
    await writeFile(target, "local Agent\n");
    await writeFile(other, "unmanaged Agent\n");
    const env = { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints };

    const skip = runCli(
      project,
      ["init", "--stack", "python", "--on-conflict", "skip"],
      process.env.PATH ?? "",
      env,
    );
    expect(skip.status, skip.stderr).toBe(0);
    expect(skip.stdout).toMatch(/Installed 0 agent\(s\).*Skipped 1 existing agent\(s\)/);
    expect(await readFile(target, "utf8")).toBe("local Agent\n");
    await rm(join(project, ".github", "spindle.json"));

    const overwrite = runCli(
      project,
      ["init", "--stack", "python", "--on-conflict", "overwrite"],
      process.env.PATH ?? "",
      env,
    );
    expect(overwrite.status, overwrite.stderr).toBe(0);
    expect(await readFile(target, "utf8")).toMatch(/shipped Agent/);
    expect(await readFile(other, "utf8")).toBe("unmanaged Agent\n");
  }
});

test("non-interactive update skips or includes same-named new Blueprints by kind", async () => {
  const blueprints = await makeTempDir("spindle-agent-new-kinds-blueprints-");
  const project = await makeTempDir("spindle-agent-new-kinds-project-");
  {
    await mkdir(join(blueprints, "skills", "demo"), { recursive: true });
    await writeFile(
      join(blueprints, "skills", "demo", "SKILL.md"),
      "---\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nSkill\n",
    );
    await mkdir(join(blueprints, "agents", "demo"), { recursive: true });
    await writeFile(
      join(blueprints, "agents", "demo.agent.md"),
      "---\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nAgent\n",
    );
    await mkdir(join(project, ".github"), { recursive: true });
    await writeFile(
      join(project, ".github", "spindle.json"),
      JSON.stringify({ stacks: ["python"], variables: {} }),
    );
    const env = { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints };
    const skip = runCli(project, ["update", "--no-interactive"], process.env.PATH ?? "", env);
    expect(skip.status, skip.stderr).toBe(0);
    expect(skip.stdout).toMatch(/skipped 1, up to date 0 skill\(s\)/);
    expect(skip.stdout).toMatch(/skipped 1, up to date 0 agent\(s\)/);
    await expect(
      readFile(join(project, ".github", "skills", "demo", "SKILL.md")),
    ).rejects.toThrow();
    await expect(readFile(join(project, ".github", "agents", "demo.agent.md"))).rejects.toThrow();

    const include = runCli(
      project,
      ["update", "--no-interactive", "--include-new"],
      process.env.PATH ?? "",
      env,
    );
    expect(include.status, include.stderr).toBe(0);
    expect(include.stdout).toMatch(/Added 1, updated 0, skipped 0, up to date 0 skill\(s\)/);
    expect(include.stdout).toMatch(/Added 1, updated 0, skipped 0, up to date 0 agent\(s\)/);
    expect(await readFile(join(project, ".github", "skills", "demo", "SKILL.md"), "utf8")).toMatch(
      /Skill/,
    );
    expect(await readFile(join(project, ".github", "agents", "demo.agent.md"), "utf8")).toMatch(
      /Agent/,
    );
  }
});

test("update rejects missing or invalid shipped Agent versions before replacing any kind", async () => {
  for (const version of [null, "v2"]) {
    const blueprints = await makeTempDir("spindle-agent-invalid-source-blueprints-");
    const project = await makeTempDir("spindle-agent-invalid-source-project-");
    const agentPath = join(project, ".github", "agents", "demo.agent.md");
    const skillPath = join(project, ".github", "skills", "demo", "SKILL.md");
    const old = "---\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nlocal\n";
    {
      await mkdir(join(blueprints, "skills", "demo"), { recursive: true });
      await writeFile(
        join(blueprints, "skills", "demo", "SKILL.md"),
        "---\nmetadata:\n  spindle:\n    version: 2.0.0\n---\nshipped Skill\n",
      );
      await mkdir(join(blueprints, "agents", "demo"), { recursive: true });
      await writeFile(
        join(blueprints, "agents", "demo.agent.md"),
        `---\nname: demo\n${version === null ? "" : `metadata:\n  spindle:\n    version: ${version}\n`}---\nshipped Agent\n`,
      );
      await mkdir(join(project, ".github", "skills", "demo"), { recursive: true });
      await mkdir(join(project, ".github", "agents"), { recursive: true });
      await writeFile(
        join(project, ".github", "spindle.json"),
        JSON.stringify({ stacks: ["python"], variables: {} }),
      );
      await writeFile(skillPath, old);
      await writeFile(agentPath, old);

      const result = runCli(
        project,
        ["update", "--no-interactive", "--on-conflict", "overwrite"],
        process.env.PATH ?? "",
        { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints },
      );

      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(
        /shipped agent Blueprint 'demo\.agent\.md'.*no valid semver version/i,
      );
      expect(await readFile(skillPath, "utf8")).toBe(old);
      expect(await readFile(agentPath, "utf8")).toBe(old);
    }
  }
});

test(
  "interactive selection distinguishes same-named new Skills and Agents",
  { skip: process.platform !== "linux" },
  async () => {
    const blueprints = await makeTempDir("spindle-agent-same-name-blueprints-");
    const project = await makeTempDir("spindle-agent-same-name-project-");
    {
      await mkdir(join(blueprints, "skills", "demo"), { recursive: true });
      await writeFile(
        join(blueprints, "skills", "demo", "SKILL.md"),
        "---\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nSkill\n",
      );
      await mkdir(join(blueprints, "agents", "demo"), { recursive: true });
      await writeFile(
        join(blueprints, "agents", "demo.agent.md"),
        "---\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nAgent\n",
      );
      await mkdir(join(project, ".github"), { recursive: true });
      await writeFile(
        join(project, ".github", "spindle.json"),
        JSON.stringify({ stacks: ["python"], variables: {} }),
      );

      const result = await runCliInteractive(
        project,
        ["update"],
        process.env.PATH ?? "",
        [
          { trigger: "Which new Skills should be installed?", input: "\r" },
          { trigger: "Which new Agents should be installed?", input: " \r" },
        ],
        { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints },
      );

      expect(result.status, result.stdout).toBe(0);
      expect(result.stdout).toMatch(/Which new Skills should be installed\?/);
      expect(result.stdout).toMatch(/Which new Agents should be installed\?/);
      expect(result.stdout).toMatch(/Added 1, updated 0, skipped 0, up to date 0 skill\(s\)/);
      expect(result.stdout).toMatch(/Added 0, updated 0, skipped 1, up to date 0 agent\(s\)/);
      expect(
        await readFile(join(project, ".github", "skills", "demo", "SKILL.md"), "utf8"),
      ).toMatch(/Skill/);
      await expect(readFile(join(project, ".github", "agents", "demo.agent.md"))).rejects.toThrow();
    }
  },
);

test("update skip policy preserves an outdated Agent", async () => {
  const blueprints = await makeTempDir("spindle-agent-update-skip-blueprints-");
  const project = await makeTempDir("spindle-agent-update-skip-project-");
  const agentPath = join(project, ".github", "agents", "demo.agent.md");
  const local = "---\nname: demo\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nlocal Agent\n";
  {
    await mkdir(join(blueprints, "agents", "demo"), { recursive: true });
    await writeFile(
      join(blueprints, "agents", "demo.agent.md"),
      "---\nname: demo\nmetadata:\n  spindle:\n    version: 2.0.0\n---\nshipped Agent\n",
    );
    await mkdir(join(project, ".github", "agents"), { recursive: true });
    await writeFile(
      join(project, ".github", "spindle.json"),
      JSON.stringify({ stacks: ["python"], variables: {} }),
    );
    await writeFile(agentPath, local);

    const result = runCli(
      project,
      ["update", "--no-interactive", "--on-conflict", "skip"],
      process.env.PATH ?? "",
      { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/updated 0, skipped 1, up to date 0 agent\(s\)/);
    expect(await readFile(agentPath, "utf8")).toBe(local);
  }
});

for (const command of ["init", "update"] as const) {
  test(`${command} preserves an Agent after an injected partial replacement write`, async () => {
    const blueprints = await makeTempDir("spindle-agent-write-failure-blueprints-");
    const project = await makeTempDir("spindle-agent-write-failure-project-");
    const agents = join(project, ".github", "agents");
    const agentPath = join(agents, "demo.agent.md");
    const configPath = join(project, ".github", "spindle.json");
    const installed =
      "---\nname: demo\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nlocal Agent\n";
    const config = JSON.stringify({ stacks: ["python"], variables: {} });
    {
      await mkdir(join(blueprints, "agents", "demo"), { recursive: true });
      await writeFile(
        join(blueprints, "agents", "demo.agent.md"),
        "---\nname: demo\nmetadata:\n  spindle:\n    version: 2.0.0\n---\nshipped Agent\n",
      );
      await mkdir(agents, { recursive: true });
      await writeFile(agentPath, installed);
      if (command === "update") await writeFile(configPath, config);

      const args =
        command === "init"
          ? ["init", "--stack", "python", "--on-conflict", "overwrite"]
          : ["update", "--no-interactive", "--on-conflict", "overwrite"];
      const result = runCli(project, args, process.env.PATH ?? "", {
        SPINDLE_TEST_BLUEPRINTS_DIR: blueprints,
        SPINDLE_TEST_FAIL_WRITE_DIR: agents,
        SPINDLE_TEST_PRELOAD: join(repoRoot, "tests/helpers/preloads/fail-agent-write.ts"),
      });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/Injected ENOSPC while writing Agent/);
      expect(await readFile(agentPath, "utf8")).toBe(installed);
      expect(await readdir(agents)).toEqual(["demo.agent.md"]);
      if (command === "update") {
        expect(await readFile(configPath, "utf8")).toBe(config);
      } else {
        await expect(readFile(configPath)).rejects.toThrow();
      }
    }
  });
}

for (const command of ["init", "update"] as const) {
  test(`${command} exclusively creates a new Agent after planning`, async () => {
    const blueprints = await makeTempDir("spindle-agent-create-race-blueprints-");
    const project = await makeTempDir("spindle-agent-create-race-project-");
    const agentPath = join(project, ".github", "agents", "demo.agent.md");
    const configPath = join(project, ".github", "spindle.json");
    const config = JSON.stringify({ stacks: ["python"], variables: {} });
    {
      await mkdir(join(blueprints, "agents", "demo"), { recursive: true });
      await writeFile(
        join(blueprints, "agents", "demo.agent.md"),
        "---\nname: demo\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nshipped Agent\n",
      );
      await mkdir(dirname(agentPath), { recursive: true });
      if (command === "update") await writeFile(configPath, config);

      const args =
        command === "init"
          ? ["init", "--stack", "python"]
          : ["update", "--no-interactive", "--include-new"];
      const result = runCli(project, args, process.env.PATH ?? "", {
        SPINDLE_TEST_BLUEPRINTS_DIR: blueprints,
        SPINDLE_TEST_RACE_AGENT_PATH: agentPath,
        SPINDLE_TEST_PRELOAD: join(repoRoot, "tests/helpers/preloads/race-agent-create.ts"),
      });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/EEXIST|file already exists/i);
      expect(await readFile(agentPath, "utf8")).toBe("created during write\n");
      if (command === "update") {
        expect(await readFile(configPath, "utf8")).toBe(config);
      } else {
        await expect(readFile(configPath)).rejects.toThrow();
      }
    }
  });
}

for (const destinationType of ["directory", "socket"] as const) {
  test(
    `init rejects a ${destinationType} at an Agent destination without removing it`,
    { skip: destinationType === "socket" && process.platform === "win32" },
    async () => {
      const blueprints = await makeTempDir("spindle-agent-type-blueprints-");
      const project = await makeTempDir("spindle-type-");
      const agents = join(project, ".github", "agents");
      const target = join(agents, "demo.agent.md");
      let server: ReturnType<typeof createServer> | undefined;
      try {
        await mkdir(join(blueprints, "agents", "demo"), { recursive: true });
        await writeFile(
          join(blueprints, "agents", "demo.agent.md"),
          "---\nname: demo\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nshipped Agent\n",
        );
        await mkdir(agents, { recursive: true });
        if (destinationType === "directory") {
          await mkdir(target);
          await writeFile(join(target, "notes.txt"), "unmanaged notes\n");
        } else {
          server = createServer();
          await new Promise<void>((resolve, reject) => {
            server!.once("error", reject);
            server!.listen(target, resolve);
          });
        }

        const result = runCli(
          project,
          ["init", "--stack", "python", "--on-conflict", "overwrite"],
          process.env.PATH ?? "",
          { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints },
        );

        expect(result.status).not.toBe(0);
        expect(result.stderr).toMatch(/regular file/i);
        if (destinationType === "directory") {
          expect(await readFile(join(target, "notes.txt"), "utf8")).toBe("unmanaged notes\n");
        } else {
          expect((await lstat(target)).isSocket()).toBe(true);
        }
        await expect(readFile(join(project, ".github", "spindle.json"))).rejects.toThrow();
      } finally {
        if (server?.listening) await new Promise<void>((resolve) => server!.close(() => resolve()));
      }
    },
  );
}

for (const command of ["init", "update"] as const) {
  test(`${command} rejects an Agent directory before replacing a Skill`, async () => {
    const blueprints = await makeTempDir("spindle-agent-directory-preflight-blueprints-");
    const project = await makeTempDir("spindle-agent-directory-preflight-project-");
    const skillPath = join(project, ".github", "skills", "demo", "SKILL.md");
    const notesPath = join(project, ".github", "agents", "demo.agent.md", "notes.txt");
    const configPath = join(project, ".github", "spindle.json");
    const oldSkill = "---\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nlocal Skill\n";
    const config = JSON.stringify({ stacks: ["python"], variables: {} });
    {
      await mkdir(join(blueprints, "skills", "demo"), { recursive: true });
      await mkdir(join(blueprints, "agents", "demo"), { recursive: true });
      await writeFile(
        join(blueprints, "skills", "demo", "SKILL.md"),
        "---\nmetadata:\n  spindle:\n    version: 2.0.0\n---\nshipped Skill\n",
      );
      await writeFile(
        join(blueprints, "agents", "demo.agent.md"),
        "---\nmetadata:\n  spindle:\n    version: 2.0.0\n---\nshipped Agent\n",
      );
      await mkdir(dirname(skillPath), { recursive: true });
      await mkdir(dirname(notesPath), { recursive: true });
      await writeFile(skillPath, oldSkill);
      await writeFile(notesPath, "unmanaged notes\n");
      if (command === "update") await writeFile(configPath, config);

      const args =
        command === "init"
          ? ["init", "--stack", "python", "--on-conflict", "overwrite"]
          : ["update", "--no-interactive", "--on-conflict", "overwrite"];
      const result = runCli(project, args, process.env.PATH ?? "", {
        SPINDLE_TEST_BLUEPRINTS_DIR: blueprints,
      });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/regular file/i);
      expect(await readFile(skillPath, "utf8")).toBe(oldSkill);
      expect(await readFile(notesPath, "utf8")).toBe("unmanaged notes\n");
      if (command === "update") {
        expect(await readFile(configPath, "utf8")).toBe(config);
      } else {
        await expect(readFile(configPath)).rejects.toThrow();
      }
    }
  });
}

for (const invalidKind of ["Skill", "Agent"] as const) {
  test(`init preflights invalid ${invalidKind} metadata across Blueprint kinds`, async () => {
    const blueprints = await makeTempDir("spindle-metadata-preflight-blueprints-");
    const project = await makeTempDir("spindle-metadata-preflight-project-");
    const skillPath = join(project, ".github", "skills", "demo", "SKILL.md");
    const stalePath = join(project, ".github", "skills", "demo", "notes.txt");
    const agentPath = join(project, ".github", "agents", "demo.agent.md");
    const oldSkill = "---\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nlocal Skill\n";
    const oldAgent = "---\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nlocal Agent\n";
    {
      await mkdir(join(blueprints, "skills", "demo"), { recursive: true });
      await mkdir(join(blueprints, "agents", "demo"), { recursive: true });
      await writeFile(
        join(blueprints, "skills", "demo", "SKILL.md"),
        `---\nmetadata:\n  spindle:\n    version: ${invalidKind === "Skill" ? "{{ variables.owner }}" : "2.0.0"}\n---\nshipped Skill\n`,
      );
      await writeFile(
        join(blueprints, "agents", "demo.agent.md"),
        `---\nmetadata:\n  spindle:\n    version: ${invalidKind === "Agent" ? "{{ variables.owner }}" : "2.0.0"}\n---\nshipped Agent\n`,
      );
      await mkdir(join(project, ".github", "skills", "demo"), { recursive: true });
      await mkdir(join(project, ".github", "agents"), { recursive: true });
      await writeFile(skillPath, oldSkill);
      await writeFile(stalePath, "local supporting file\n");
      await writeFile(agentPath, oldAgent);

      const result = runCli(
        project,
        ["init", "--stack", "python", "--var", "owner=not-semver", "--on-conflict", "overwrite"],
        process.env.PATH ?? "",
        { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints },
      );

      expect(result.status).not.toBe(0);
      const entryFile = invalidKind === "Skill" ? "SKILL.md" : "demo.agent.md";
      expect(
        result.stderr.includes(
          `Invalid ${invalidKind} metadata in '${entryFile}': expected a semver \`metadata.spindle.version\` in frontmatter.`,
        ),
        result.stderr,
      ).toBeTruthy();
      expect(await readFile(skillPath, "utf8")).toBe(oldSkill);
      expect(await readFile(stalePath, "utf8")).toBe("local supporting file\n");
      expect(await readFile(agentPath, "utf8")).toBe(oldAgent);
      await expect(readFile(join(project, ".github", "spindle.json"))).rejects.toThrow();
    }
  });
}

test("init preflights a new invalid Agent before replacing an existing Skill", async () => {
  const blueprints = await makeTempDir("spindle-new-agent-preflight-blueprints-");
  const project = await makeTempDir("spindle-new-agent-preflight-project-");
  const skillPath = join(project, ".github", "skills", "demo", "SKILL.md");
  const agentPath = join(project, ".github", "agents", "demo.agent.md");
  const oldSkill = "---\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nlocal Skill\n";
  {
    await mkdir(join(blueprints, "skills", "demo"), { recursive: true });
    await mkdir(join(blueprints, "agents", "demo"), { recursive: true });
    await writeFile(
      join(blueprints, "skills", "demo", "SKILL.md"),
      "---\nmetadata:\n  spindle:\n    version: 2.0.0\n---\nshipped Skill\n",
    );
    await writeFile(
      join(blueprints, "agents", "demo.agent.md"),
      "---\nmetadata:\n  spindle:\n    version: {{ variables.owner }}\n---\nnew Agent\n",
    );
    await mkdir(dirname(skillPath), { recursive: true });
    await writeFile(skillPath, oldSkill);

    const result = runCli(
      project,
      ["init", "--stack", "python", "--var", "owner=not-semver", "--on-conflict", "overwrite"],
      process.env.PATH ?? "",
      { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/Invalid Agent metadata.*semver/);
    expect(await readFile(skillPath, "utf8")).toBe(oldSkill);
    await expect(readFile(agentPath)).rejects.toThrow();
    await expect(readFile(join(project, ".github", "spindle.json"))).rejects.toThrow();
  }
});

test("init renders Skill supporting Markdown without validating it as an entry file", async () => {
  const blueprints = await makeTempDir("spindle-skill-support-blueprints-");
  const project = await makeTempDir("spindle-skill-support-project-");
  {
    const skill = join(blueprints, "skills", "demo");
    await mkdir(skill, { recursive: true });
    await writeFile(
      join(skill, "SKILL.md"),
      "---\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nSkill\n",
    );
    await writeFile(
      join(skill, "guide.md"),
      "---\nmetadata:\n  spindle:\n    version: [not-valid-yaml\n---\nOwner {{ variables.owner }}\n",
    );

    const result = runCli(
      project,
      ["init", "--stack", "python", "--var", "owner=team"],
      process.env.PATH ?? "",
      { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(await readFile(join(project, ".github", "skills", "demo", "guide.md"), "utf8")).toBe(
      "---\nmetadata:\n  spindle:\n    version: [not-valid-yaml\n---\nOwner team\n",
    );
  }
});

test("update preflights Agent rendering before replacing a Skill", async () => {
  const blueprints = await makeTempDir("spindle-render-preflight-blueprints-");
  const project = await makeTempDir("spindle-render-preflight-project-");
  const skillPath = join(project, ".github", "skills", "demo", "SKILL.md");
  const agentPath = join(project, ".github", "agents", "demo.agent.md");
  const configPath = join(project, ".github", "spindle.json");
  const oldSkill = "---\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nlocal Skill\n";
  const oldAgent = "---\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nlocal Agent\n";
  const config = JSON.stringify({ stacks: ["python"], variables: {} });
  {
    await mkdir(join(blueprints, "skills", "demo"), { recursive: true });
    await mkdir(join(blueprints, "agents", "demo"), { recursive: true });
    await writeFile(
      join(blueprints, "skills", "demo", "SKILL.md"),
      "---\nmetadata:\n  spindle:\n    version: 2.0.0\n---\nshipped Skill\n",
    );
    await writeFile(
      join(blueprints, "agents", "demo.agent.md"),
      "---\nmetadata:\n  spindle:\n    version: 2.0.0\n---\n{{ variables.not_supplied }}\n",
    );
    await mkdir(join(project, ".github", "skills", "demo"), { recursive: true });
    await mkdir(join(project, ".github", "agents"), { recursive: true });
    await writeFile(skillPath, oldSkill);
    await writeFile(agentPath, oldAgent);
    await writeFile(configPath, config);

    const result = runCli(
      project,
      ["update", "--no-interactive", "--on-conflict", "overwrite"],
      process.env.PATH ?? "",
      { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/undefined|not_supplied/i);
    expect(await readFile(skillPath, "utf8")).toBe(oldSkill);
    expect(await readFile(agentPath, "utf8")).toBe(oldAgent);
    expect(await readFile(configPath, "utf8")).toBe(config);
  }
});

test("update keeps a nested Agent version stable when a Skill supporting template mutates Stacks", async () => {
  const blueprints = await makeTempDir("spindle-version-context-blueprints-");
  const project = await makeTempDir("spindle-version-context-project-");
  const skillSource = join(blueprints, "skills", "demo");
  const agentSource = join(blueprints, "agents", "demo.agent.md");
  const skillInstalled = join(project, ".github", "skills", "demo", "SKILL.md");
  const agentInstalled = join(project, ".github", "agents", "demo.agent.md");
  const configPath = join(project, ".github", "spindle.json");
  const config = JSON.stringify({ stacks: ["python"], variables: {} });
  const agent = [
    "---",
    "metadata:",
    "  spindle:",
    "    version: {% if 'python' in stacks %}2.0.0{% else %}1.0.0{% endif %}",
    "---",
    "Shipped Agent",
    "",
  ].join("\n");
  {
    await mkdir(skillSource, { recursive: true });
    await mkdir(join(agentSource, ".."), { recursive: true });
    await writeFile(
      join(skillSource, "SKILL.md"),
      "---\nmetadata:\n  spindle:\n    version: 2.0.0\n---\nShipped Skill\n",
    );
    await writeFile(join(skillSource, "README.md"), "{{ stacks.pop() }}");
    await writeFile(agentSource, agent);
    await mkdir(dirname(skillInstalled), { recursive: true });
    await mkdir(dirname(agentInstalled), { recursive: true });
    await writeFile(
      skillInstalled,
      "---\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nlocal Skill\n",
    );
    await writeFile(
      agentInstalled,
      "---\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nlocal Agent\n",
    );
    await writeFile(configPath, config);

    const result = runCli(
      project,
      ["update", "--no-interactive", "--on-conflict", "overwrite"],
      process.env.PATH ?? "",
      { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(await readFile(skillInstalled, "utf8")).toMatch(/version: 2\.0\.0/);
    expect(await readFile(join(dirname(skillInstalled), "README.md"), "utf8")).toBe("python");
    expect(await readFile(agentInstalled, "utf8")).toBe(
      "---\nmetadata:\n  spindle:\n    version: 2.0.0\n---\nShipped Agent\n",
    );
    expect(await readFile(configPath, "utf8")).toBe(config);
    expect(result.stdout).toMatch(/updated 1.*skill\(s\)/);
    expect(result.stdout).toMatch(/updated 1.*agent\(s\)/);
  }
});
