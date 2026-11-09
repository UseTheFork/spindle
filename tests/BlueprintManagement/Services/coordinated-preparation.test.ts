import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { expect, test } from "vitest";

import type { BlueprintCatalogDefinition } from "@/BlueprintManagement/Catalog/BlueprintCatalog";

import { writeCatalogFixture } from "../../helpers/CatalogFixtures.ts";
import { runCliWithCatalog as runCli } from "../../helpers/Cli.ts";
import { makeTempDir, repoRoot } from "../../helpers/TemporaryDirectories.ts";

const versioned = (version: string, body: string) =>
  `---\nmetadata:\n  spindle:\n    version: ${version}\n---\n${body}\n`;

async function put(path: string, content: string | Buffer) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

test("update preparation failure leaves planned cross-kind changes untouched", async () => {
  const blueprints = await makeTempDir("spindle-update-preparation-blueprints-");
  const project = await makeTempDir("spindle-update-preparation-project-");
  const github = join(project, ".github");
  const configPath = join(github, "spindle.json");
  const agentPath = join(github, "agents", "new.agent.md");
  const currentSkill = join(github, "skills", "current");
  const skippedSkill = join(github, "skills", "skipped");
  const retiredSkill = join(github, "skills", "retired");
  const staleInstruction = join(github, "instructions", "owned", "local.txt");
  const outsideSentinel = join(project, "outside-sentinel.txt");
  const configBytes = Buffer.from('{\n  "stacks": ["python"],\n  "variables": {}\n}\n');
  const currentSkillBytes = Buffer.from(versioned("1.0.0", "installed and current"));
  const skippedSkillBytes = Buffer.from(versioned("1.0.0", "installed and outdated"));
  const retiredBytes = Buffer.from("retired Skill local content\n");
  const instructionBytes = Buffer.from("destination-only Instruction content\n");
  const outsideBytes = Buffer.from("outside the managed roots\n");

  {
    writeCatalogFixture(blueprints, {
      agents: {
        new: {
          path: "new.agent.md",
          status: "active",
          stacks: [],
        },
      },
      instructions: {
        owned: {
          path: "owned/",
          status: "active",
          stacks: [],
        },
      },
      skills: {
        current: {
          path: "current/",
          status: "active",
          stacks: [],
        },
        skipped: {
          path: "skipped/",
          status: "active",
          stacks: [],
        },
        retired: {
          path: "retired/",
          status: "removed",
          stacks: [],
        },
      },
    } satisfies BlueprintCatalogDefinition);
    await put(join(blueprints, "agents", "new.agent.md"), Buffer.from([0x66, 0x80, 0x67, 0x0a]));
    await put(
      join(blueprints, "instructions", "owned", "keep.instructions.md"),
      versioned("1.0.0", "source Instruction"),
    );
    await put(join(blueprints, "skills", "current", "SKILL.md"), currentSkillBytes);
    await put(
      join(blueprints, "skills", "skipped", "SKILL.md"),
      versioned("2.0.0", "outdated source"),
    );
    await put(configPath, configBytes);
    await put(join(currentSkill, "SKILL.md"), currentSkillBytes);
    await put(join(currentSkill, "local.txt"), "destination-only Skill content\n");
    await put(join(skippedSkill, "SKILL.md"), skippedSkillBytes);
    await put(join(skippedSkill, "local.txt"), "skipped Skill destination-only content\n");
    await put(join(retiredSkill, "local.txt"), retiredBytes);
    await put(staleInstruction, instructionBytes);
    await put(outsideSentinel, outsideBytes);

    const result = runCli(
      project,
      ["update", "--no-interactive", "--include-new", "--on-conflict", "skip"],
      process.env.PATH ?? "",
      { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints },
    );

    expect(result.status, result.stdout).not.toBe(0);
    expect(result.stderr).toMatch(/no valid semver version/i);
    await expect(readFile(agentPath)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(configPath)).toEqual(configBytes);
    expect(await readFile(join(currentSkill, "SKILL.md"))).toEqual(currentSkillBytes);
    expect(await readFile(join(currentSkill, "local.txt"), "utf8")).toBe(
      "destination-only Skill content\n",
    );
    expect(await readFile(join(skippedSkill, "SKILL.md"))).toEqual(skippedSkillBytes);
    expect(await readFile(join(skippedSkill, "local.txt"), "utf8")).toBe(
      "skipped Skill destination-only content\n",
    );
    expect(await readFile(join(retiredSkill, "local.txt"))).toEqual(retiredBytes);
    expect(await readFile(staleInstruction)).toEqual(instructionBytes);
    expect(await readFile(outsideSentinel)).toEqual(outsideBytes);
  }
});

test("init preparation failure leaves planned Config and target deletion untouched", async () => {
  const blueprints = await makeTempDir("spindle-init-preparation-blueprints-");
  const project = await makeTempDir("spindle-init-preparation-project-");
  const github = join(project, ".github");
  const configPath = join(github, "spindle.json");
  const agentPath = join(github, "agents", "new.agent.md");
  const retiredSkill = join(github, "skills", "retired", "local.txt");
  const outsideSentinel = join(project, "outside-sentinel.txt");
  const retiredBytes = Buffer.from("retired Skill local content\n");
  const outsideBytes = Buffer.from("outside the managed roots\n");

  {
    writeCatalogFixture(blueprints, {
      agents: {
        new: {
          path: "new.agent.md",
          status: "active",
          stacks: [],
        },
      },
      instructions: {},
      skills: {
        retired: {
          path: "retired/",
          status: "removed",
          stacks: [],
        },
      },
    } satisfies BlueprintCatalogDefinition);
    await put(join(blueprints, "agents", "new.agent.md"), Buffer.from([0x66, 0x80, 0x67, 0x0a]));
    await put(retiredSkill, retiredBytes);
    await put(outsideSentinel, outsideBytes);

    const result = runCli(
      project,
      ["init", "--stack", "python", "--no-interactive"],
      process.env.PATH ?? "",
      { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints },
    );

    expect(result.status, result.stdout).not.toBe(0);
    expect(result.stderr).toMatch(/valid UTF-8 text/);
    await expect(readFile(configPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(agentPath)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(retiredSkill)).toEqual(retiredBytes);
    expect(await readFile(outsideSentinel)).toEqual(outsideBytes);
  }
});

test("application Config failure reports completed Blueprint installs", async () => {
  const blueprints = await makeTempDir("spindle-config-progress-blueprints-");
  const project = await makeTempDir("spindle-config-progress-project-");
  const github = join(project, ".github");
  const configPath = join(github, "spindle.json");
  const agentPath = join(github, "agents", "new.agent.md");
  const agentBytes = Buffer.from(
    `---\nname: new\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nnew Agent\n`,
  );

  {
    writeCatalogFixture(blueprints, {
      agents: {
        new: {
          path: "new.agent.md",
          status: "active",
          stacks: [],
        },
      },
      instructions: {},
      skills: {},
    } satisfies BlueprintCatalogDefinition);
    await put(join(blueprints, "agents", "new.agent.md"), agentBytes);

    const result = runCli(
      project,
      ["init", "--stack", "python", "--no-interactive"],
      process.env.PATH ?? "",
      {
        SPINDLE_TEST_BLUEPRINTS_DIR: blueprints,
        SPINDLE_TEST_PRELOAD: join(repoRoot, "tests/helpers/preloads/fail-config-write.ts"),
      },
    );

    expect(result.status, result.stdout).not.toBe(0);
    expect(result.stderr).toMatch(/Failed to write Config/);
    expect(result.stderr).toMatch(/forced Config write failure/);
    expect(result.stderr).toMatch(/Completed changes: installed Agent 'new\.agent\.md'/);
    expect(result.stderr).toMatch(/Application stopped; rollback was not attempted/);
    expect(await readFile(agentPath)).toEqual(agentBytes);
    await expect(readFile(configPath)).rejects.toMatchObject({ code: "ENOENT" });
  }
});

test("application write failure reports earlier cross-kind changes without claiming rollback", async () => {
  const blueprints = await makeTempDir("spindle-write-progress-blueprints-");
  const project = await makeTempDir("spindle-write-progress-project-");
  const github = join(project, ".github");
  const agents = join(github, "agents");
  const agentPath = join(agents, "write.agent.md");
  const skillPath = join(github, "skills", "demo", "SKILL.md");
  const configPath = join(github, "spindle.json");
  const originalAgent = Buffer.from(
    `---\nname: write\nmetadata:\n  spindle:\n    version: 1.0.0\n---\ninstalled Agent\n`,
  );
  const configBytes = Buffer.from('{"stacks":["python"],"variables":{}}\n');

  {
    writeCatalogFixture(blueprints, {
      agents: {
        write: {
          path: "write.agent.md",
          status: "active",
          stacks: [],
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
    await put(
      join(blueprints, "agents", "write.agent.md"),
      `---\nname: write\nmetadata:\n  spindle:\n    version: 2.0.0\n---\nshipped Agent\n`,
    );
    await put(join(blueprints, "skills", "demo", "SKILL.md"), versioned("2.0.0", "updated Skill"));
    await put(agentPath, originalAgent);
    await put(skillPath, versioned("1.0.0", "installed Skill"));
    await put(configPath, configBytes);

    const result = runCli(
      project,
      ["update", "--no-interactive", "--on-conflict", "overwrite"],
      process.env.PATH ?? "",
      {
        SPINDLE_TEST_BLUEPRINTS_DIR: blueprints,
        SPINDLE_TEST_FAIL_WRITE_DIR: agents,
        SPINDLE_TEST_PRELOAD: join(repoRoot, "tests/helpers/preloads/fail-agent-write.ts"),
      },
    );

    expect(result.status, result.stdout).not.toBe(0);
    expect(result.stderr).toMatch(/Failed to apply Agent 'write\.agent\.md'/);
    expect(result.stderr).toMatch(/Injected ENOSPC while writing Agent/);
    expect(result.stderr).toMatch(
      /Completed changes: removed existing Skill 'demo' before replacement, applied Skill file 'demo\/SKILL\.md', updated Skill 'demo'/,
    );
    expect(result.stderr).toMatch(/Application stopped; rollback was not attempted/);
    expect(await readFile(skillPath, "utf8")).toBe(versioned("2.0.0", "updated Skill"));
    expect(await readFile(agentPath)).toEqual(originalAgent);
    expect(await readFile(configPath)).toEqual(configBytes);
  }
});

test("partial Skill application reports each applied file and the exact later failure", async () => {
  const blueprints = await makeTempDir("spindle-skill-file-progress-blueprints-");
  const project = await makeTempDir("spindle-skill-file-progress-project-");
  const github = join(project, ".github");
  const skill = join(github, "skills", "demo");
  const skillEntry = join(skill, "SKILL.md");
  const firstFile = join(skill, "a-first.txt");
  const failingFile = join(skill, "z-failing.txt");
  const configPath = join(github, "spindle.json");
  const configBytes = Buffer.from('{"stacks":["python"],"variables":{}}\n');
  const outsideSentinel = join(project, "outside-sentinel.txt");
  const outsideBytes = Buffer.from("outside managed targets\n");

  {
    writeCatalogFixture(blueprints, {
      agents: {},
      instructions: {},
      skills: {
        demo: {
          path: "demo/",
          status: "active",
          stacks: [],
        },
      },
    } satisfies BlueprintCatalogDefinition);
    await put(join(blueprints, "skills", "demo", "SKILL.md"), versioned("2.0.0", "new Skill"));
    await put(join(blueprints, "skills", "demo", "a-first.txt"), "first supporting file\n");
    await put(join(blueprints, "skills", "demo", "z-failing.txt"), "later supporting file\n");
    await put(configPath, configBytes);
    await put(join(skill, "SKILL.md"), versioned("1.0.0", "installed Skill"));
    await put(join(skill, "local.txt"), "old local Skill content\n");
    await put(outsideSentinel, outsideBytes);

    const result = runCli(
      project,
      ["update", "--no-interactive", "--on-conflict", "overwrite"],
      process.env.PATH ?? "",
      {
        SPINDLE_TEST_BLUEPRINTS_DIR: blueprints,
        SPINDLE_TEST_FAIL_WRITE_FILE: failingFile,
        SPINDLE_TEST_PRELOAD: join(repoRoot, "tests/helpers/preloads/fail-skill-file-write.ts"),
      },
    );

    expect(result.status, result.stdout).not.toBe(0);
    expect(
      result.stderr.includes(`Failed to apply file 'z-failing.txt' at '${failingFile}'`),
      result.stderr,
    ).toBeTruthy();
    expect(result.stderr).toMatch(/applied Skill file 'demo\/SKILL\.md'/);
    expect(result.stderr).toMatch(/applied Skill file 'demo\/a-first\.txt'/);
    expect(result.stderr).toMatch(/Application stopped; rollback was not attempted/);
    expect(await readFile(skillEntry, "utf8")).toBe(versioned("2.0.0", "new Skill"));
    expect(await readFile(firstFile, "utf8")).toBe("first supporting file\n");
    await expect(readFile(failingFile)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(join(skill, "local.txt"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(configPath)).toEqual(configBytes);
    expect(await readFile(outsideSentinel)).toEqual(outsideBytes);
  }
});

test("application deletion failure reports all earlier cross-kind changes", async () => {
  const blueprints = await makeTempDir("spindle-delete-progress-blueprints-");
  const project = await makeTempDir("spindle-delete-progress-project-");
  const github = join(project, ".github");
  const newAgent = join(github, "agents", "new.agent.md");
  const firstRemoval = join(github, "agents", "first.agent.md");
  const secondRemoval = join(github, "agents", "second.agent.md");

  {
    writeCatalogFixture(blueprints, {
      agents: {
        new: {
          path: "new.agent.md",
          status: "active",
          stacks: [],
        },
        first: {
          path: "first.agent.md",
          status: "removed",
          stacks: [],
        },
        second: {
          path: "second.agent.md",
          status: "removed",
          stacks: [],
        },
      },
      instructions: {},
      skills: {},
    } satisfies BlueprintCatalogDefinition);
    await put(
      join(blueprints, "agents", "new.agent.md"),
      `---\nname: new\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nnew Agent\n`,
    );
    await put(join(github, "spindle.json"), '{"stacks":["python"],"variables":{}}\n');
    await put(firstRemoval, "first installed Agent\n");
    await put(secondRemoval, "second installed Agent\n");

    const result = runCli(
      project,
      ["update", "--no-interactive", "--include-new"],
      process.env.PATH ?? "",
      {
        SPINDLE_TEST_BLUEPRINTS_DIR: blueprints,
        SPINDLE_TEST_FAIL_REMOVE_TARGET: secondRemoval,
        SPINDLE_TEST_PRELOAD: join(repoRoot, "tests/helpers/preloads/fail-removal.ts"),
      },
    );

    expect(result.status, result.stdout).not.toBe(0);
    expect(result.stderr).toMatch(/Failed to remove Agent 'second\.agent\.md'/);
    expect(result.stderr).toMatch(/forced removal failure/);
    expect(result.stderr).toMatch(
      /Completed changes: installed Agent 'new\.agent\.md', removed Agent 'first\.agent\.md'/,
    );
    expect(result.stderr).toMatch(/Application stopped; rollback was not attempted/);
    expect(await readFile(newAgent, "utf8")).toMatch(/new Agent/);
    await expect(readFile(firstRemoval)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(secondRemoval, "utf8")).toBe("second installed Agent\n");
  }
});

test("mixed reconciliation reports exact Blueprint writes, removals, and repeated-run results", async () => {
  const blueprints = await makeTempDir("spindle-mixed-reconciliation-blueprints-");
  const project = await makeTempDir("spindle-mixed-reconciliation-project-");
  const github = join(project, ".github");
  const agentPath = join(github, "agents", "new.agent.md");
  const instructionPath = join(github, "instructions", "testing", "testing.instructions.md");
  const currentSkill = join(github, "skills", "current");
  const retiredSkill = join(github, "skills", "retired");
  const outsideSentinel = join(project, "outside-sentinel.txt");
  const currentSkillSource = versioned("1.0.0", "current source Skill");
  const currentSkillInstall = versioned("1.0.0", "preserve installed Skill");
  const preservedAsset = Buffer.from("preserve surviving installed asset\n");
  const outsideBytes = Buffer.from("outside managed targets\n");

  {
    writeCatalogFixture(blueprints, {
      agents: {
        new: {
          path: "new.agent.md",
          status: "active",
          stacks: [],
        },
      },
      instructions: {
        testing: {
          path: "testing/",
          status: "active",
          stacks: [],
        },
      },
      skills: {
        current: {
          path: "current/",
          status: "active",
          stacks: [],
        },
        retired: {
          path: "retired/",
          status: "removed",
          stacks: [],
        },
      },
    } satisfies BlueprintCatalogDefinition);
    await put(
      join(blueprints, "agents", "new.agent.md"),
      `---\nname: new\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nnew Agent\n`,
    );
    await put(
      join(blueprints, "instructions", "testing", "testing.instructions.md"),
      versioned("1.0.0", "new Instruction"),
    );
    await put(join(blueprints, "skills", "current", "SKILL.md"), currentSkillSource);
    await put(join(blueprints, "skills", "current", "asset.txt"), "source asset\n");

    await put(join(github, "spindle.json"), '{"stacks":["python"],"variables":{}}\n');
    await put(join(github, "skills", "current", "SKILL.md"), currentSkillInstall);
    await put(join(currentSkill, "asset.txt"), preservedAsset);
    await put(join(currentSkill, "local.txt"), "destination-only content\n");
    await put(join(retiredSkill, "nested", "local.txt"), "retired content\n");
    await put(outsideSentinel, outsideBytes);

    const first = runCli(
      project,
      ["update", "--no-interactive", "--include-new"],
      process.env.PATH ?? "",
      { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints },
    );

    expect(first.status, first.stderr).toBe(0);
    expect(first.stdout).toMatch(/Added 1, updated 0, skipped 0, up to date 0 agent\(s\)/);
    expect(first.stdout).toMatch(/Added 1, updated 0, skipped 0, up to date 0 instruction\(s\)/);
    expect(first.stdout).toMatch(/Added 0, updated 0, skipped 0, up to date 1 skill\(s\)/);
    expect(first.stdout).toMatch(/Removed skill 'retired'/);
    expect(first.stdout).toMatch(/Removed skill 'current\/local\.txt'/);
    expect(await readFile(agentPath, "utf8")).toBe(
      `---\nname: new\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nnew Agent\n`,
    );
    expect(await readFile(instructionPath, "utf8")).toBe(versioned("1.0.0", "new Instruction"));
    expect(await readFile(join(currentSkill, "SKILL.md"), "utf8")).toBe(currentSkillInstall);
    expect(await readFile(join(currentSkill, "asset.txt"))).toEqual(preservedAsset);
    await expect(readFile(join(currentSkill, "local.txt"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(readFile(join(retiredSkill, "nested", "local.txt"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(await readFile(outsideSentinel)).toEqual(outsideBytes);

    const second = runCli(
      project,
      ["update", "--no-interactive", "--include-new"],
      process.env.PATH ?? "",
      { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints },
    );

    expect(second.status, second.stderr).toBe(0);
    expect(second.stdout.includes("Removed ")).toBe(false);
    expect(second.stdout).toMatch(/Added 0, updated 0, skipped 0, up to date 1 agent\(s\)/);
    expect(second.stdout).toMatch(/Added 0, updated 0, skipped 0, up to date 1 instruction\(s\)/);
    expect(second.stdout).toMatch(/Added 0, updated 0, skipped 0, up to date 1 skill\(s\)/);
    expect(await readFile(outsideSentinel)).toEqual(outsideBytes);
  }
});
