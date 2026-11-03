import assert from "node:assert/strict";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test } from "node:test";

import { makeJustStubDir, makeTempDir, pathWith, runCli } from "./helpers.ts";

const versioned = (version: string, body: string) =>
  `---\nmeta:\n  spindle:\n    version: ${version}\n---\n${body}\n`;

async function put(path: string, content: string | Buffer) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

test("Just preparation failure leaves every planned cross-kind change untouched", async () => {
  const blueprints = await makeTempDir("spindle-coordinated-preparation-blueprints-");
  const project = await makeTempDir("spindle-coordinated-preparation-project-");
  const justDirectory = await makeJustStubDir();
  const github = join(project, ".github");
  const configPath = join(github, "spindle.json");
  const justfilePath = join(project, "justfile");
  const modulePath = join(github, "scripts", "just-modules", "broken.just");
  const agentPath = join(github, "agents", "new.agent.md");
  const currentSkill = join(github, "skills", "current");
  const skippedSkill = join(github, "skills", "skipped");
  const removedSkill = join(github, "skills", "retired");
  const staleInstruction = join(github, "instructions", "owned", "local.txt");
  const outsideSentinel = join(project, "outside-sentinel.txt");
  const configBytes = Buffer.from('{\n  "stacks": ["python"],\n  "variables": {}\n}\n');
  const justfileBytes = Buffer.from(
    "mod broken '.github/scripts/just-modules/broken.just'\n\nready:\n  @echo unchanged\n",
  );
  const moduleBytes = Buffer.from("installed Just Module\n");
  const currentSkillBytes = Buffer.from(versioned("1.0.0", "installed and current"));
  const staleSkillBytes = Buffer.from("destination-only Skill content\n");
  const skippedSkillBytes = Buffer.from(versioned("1.0.0", "installed and outdated"));
  const skippedStaleBytes = Buffer.from("skipped Skill destination-only content\n");
  const removedSkillBytes = Buffer.from("retired Skill local content\n");
  const instructionBytes = Buffer.from("destination-only Instruction content\n");
  const outsideBytes = Buffer.from("outside the managed roots\n");

  try {
    await put(
      join(blueprints, "catalog.yaml"),
      `agents:
  new:
    path: new.agent.md
    status: active
    stacks: []
just:
  broken:
    path: broken.just
    status: active
    stacks: []
instructions:
  owned:
    path: owned/
    status: active
    stacks: []
skills:
  current:
    path: current/
    status: active
    stacks: []
  skipped:
    path: skipped/
    status: active
    stacks: []
  retired:
    path: retired/
    status: removed
    stacks: []
`,
    );
    await put(
      join(blueprints, "agents", "new.agent.md"),
      `---\nname: new\nmeta:\n  spindle:\n    version: 1.0.0\n---\nnew Agent\n`,
    );
    await put(join(blueprints, "just", "broken.just"), Buffer.from([0x66, 0x80, 0x67, 0x0a]));
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
    await put(justfilePath, justfileBytes);
    await put(modulePath, moduleBytes);
    await put(join(currentSkill, "SKILL.md"), currentSkillBytes);
    await put(join(currentSkill, "local.txt"), staleSkillBytes);
    await put(join(skippedSkill, "SKILL.md"), skippedSkillBytes);
    await put(join(skippedSkill, "local.txt"), skippedStaleBytes);
    await put(join(removedSkill, "local.txt"), removedSkillBytes);
    await put(staleInstruction, instructionBytes);
    await put(outsideSentinel, outsideBytes);

    const result = runCli(
      project,
      ["update", "--no-interactive", "--include-new", "--on-conflict", "skip"],
      pathWith(justDirectory),
      { SPINDLE_BLUEPRINTS_DIR: blueprints },
    );

    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stderr, /valid UTF-8 text/);
    await assert.rejects(readFile(agentPath), { code: "ENOENT" });
    assert.deepEqual(await readFile(configPath), configBytes);
    assert.deepEqual(await readFile(justfilePath), justfileBytes);
    assert.deepEqual(await readFile(modulePath), moduleBytes);
    assert.deepEqual(await readFile(join(currentSkill, "SKILL.md")), currentSkillBytes);
    assert.deepEqual(await readFile(join(currentSkill, "local.txt")), staleSkillBytes);
    assert.deepEqual(await readFile(join(skippedSkill, "SKILL.md")), skippedSkillBytes);
    assert.deepEqual(await readFile(join(skippedSkill, "local.txt")), skippedStaleBytes);
    assert.deepEqual(await readFile(join(removedSkill, "local.txt")), removedSkillBytes);
    assert.deepEqual(await readFile(staleInstruction), instructionBytes);
    assert.deepEqual(await readFile(outsideSentinel), outsideBytes);
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
    await rm(justDirectory, { recursive: true, force: true });
  }
});

test("init Just preparation failure leaves planned Config and whole-target deletion untouched", async () => {
  const blueprints = await makeTempDir("spindle-init-preparation-blueprints-");
  const project = await makeTempDir("spindle-init-preparation-project-");
  const justDirectory = await makeJustStubDir();
  const github = join(project, ".github");
  const configPath = join(github, "spindle.json");
  const justfilePath = join(project, "justfile");
  const modulePath = join(github, "scripts", "just-modules", "broken.just");
  const agentPath = join(github, "agents", "new.agent.md");
  const retiredSkill = join(github, "skills", "retired", "local.txt");
  const outsideSentinel = join(project, "outside-sentinel.txt");
  const justfileBytes = Buffer.from(
    "mod broken '.github/scripts/just-modules/broken.just'\n\nready:\n  @echo untouched\n",
  );
  const moduleBytes = Buffer.from("installed Just Module\n");
  const retiredBytes = Buffer.from("retired Skill local content\n");
  const outsideBytes = Buffer.from("outside the managed roots\n");

  try {
    await put(
      join(blueprints, "catalog.yaml"),
      `agents:
  new:
    path: new.agent.md
    status: active
    stacks: []
just:
  broken:
    path: broken.just
    status: active
    stacks: []
instructions: {}
skills:
  retired:
    path: retired/
    status: removed
    stacks: []
`,
    );
    await put(
      join(blueprints, "agents", "new.agent.md"),
      `---\nname: new\nmeta:\n  spindle:\n    version: 1.0.0\n---\nnew Agent\n`,
    );
    await put(join(blueprints, "just", "broken.just"), Buffer.from([0x66, 0x80, 0x67, 0x0a]));
    await put(justfilePath, justfileBytes);
    await put(modulePath, moduleBytes);
    await put(retiredSkill, retiredBytes);
    await put(outsideSentinel, outsideBytes);

    const result = runCli(
      project,
      ["init", "--stack", "python", "--no-interactive"],
      pathWith(justDirectory),
      { SPINDLE_BLUEPRINTS_DIR: blueprints },
    );

    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stderr, /valid UTF-8 text/);
    await assert.rejects(readFile(configPath), { code: "ENOENT" });
    await assert.rejects(readFile(agentPath), { code: "ENOENT" });
    assert.deepEqual(await readFile(retiredSkill), retiredBytes);
    assert.deepEqual(await readFile(justfilePath), justfileBytes);
    assert.deepEqual(await readFile(modulePath), moduleBytes);
    assert.deepEqual(await readFile(outsideSentinel), outsideBytes);
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
    await rm(justDirectory, { recursive: true, force: true });
  }
});

test("application Config failure reports completed install and Just import changes", async () => {
  const blueprints = await makeTempDir("spindle-config-progress-blueprints-");
  const project = await makeTempDir("spindle-config-progress-project-");
  const justDirectory = await makeJustStubDir();
  const github = join(project, ".github");
  const configPath = join(github, "spindle.json");
  const agentPath = join(github, "agents", "new.agent.md");
  const modulePath = join(github, "scripts", "just-modules", "quality.just");
  const justfilePath = join(project, "justfile");
  const agentBytes = Buffer.from(
    `---\nname: new\nmeta:\n  spindle:\n    version: 1.0.0\n---\nnew Agent\n`,
  );
  const moduleBytes = Buffer.from("quality:\n  @echo ready\n");

  try {
    await put(
      join(blueprints, "catalog.yaml"),
      `agents:
  new:
    path: new.agent.md
    status: active
    stacks: []
just:
  quality:
    path: quality.just
    status: active
    stacks: []
instructions: {}
skills: {}
`,
    );
    await put(join(blueprints, "agents", "new.agent.md"), agentBytes);
    await put(join(blueprints, "just", "quality.just"), moduleBytes);

    const result = runCli(
      project,
      ["init", "--stack", "python", "--no-interactive"],
      pathWith(justDirectory),
      {
        SPINDLE_BLUEPRINTS_DIR: blueprints,
        NODE_OPTIONS: `--import=${join(process.cwd(), "tests", "fail-config-write.mjs")}`,
      },
    );

    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stderr, /Failed to write Config/);
    assert.match(result.stderr, /forced Config write failure/);
    assert.match(result.stderr, /Completed changes: installed Agent 'new\.agent\.md'/);
    assert.match(result.stderr, /installed Just Module 'quality\.just'/);
    assert.match(result.stderr, /reconciled managed imports in the root justfile/);
    assert.match(result.stderr, /Application stopped; rollback was not attempted/);
    assert.deepEqual(await readFile(agentPath), agentBytes);
    assert.deepEqual(await readFile(modulePath), moduleBytes);
    assert.equal(
      await readFile(justfilePath, "utf8"),
      "mod quality '.github/scripts/just-modules/quality.just'\n",
    );
    await assert.rejects(readFile(configPath), { code: "ENOENT" });
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
    await rm(justDirectory, { recursive: true, force: true });
  }
});

test("application write failure reports earlier cross-kind changes without claiming rollback", async () => {
  const blueprints = await makeTempDir("spindle-write-progress-blueprints-");
  const project = await makeTempDir("spindle-write-progress-project-");
  const justDirectory = await makeJustStubDir();
  const github = join(project, ".github");
  const agents = join(github, "agents");
  const agentPath = join(agents, "write.agent.md");
  const skillPath = join(github, "skills", "demo", "SKILL.md");
  const configPath = join(github, "spindle.json");
  const originalAgent = Buffer.from(
    `---\nname: write\nmeta:\n  spindle:\n    version: 1.0.0\n---\ninstalled Agent\n`,
  );
  const configBytes = Buffer.from('{"stacks":["python"],"variables":{}}\n');

  try {
    await put(
      join(blueprints, "catalog.yaml"),
      `agents:
  write:
    path: write.agent.md
    status: active
    stacks: []
just: {}
instructions: {}
skills:
  demo:
    path: demo/
    status: active
    stacks: []
`,
    );
    await put(
      join(blueprints, "agents", "write.agent.md"),
      `---\nname: write\nmeta:\n  spindle:\n    version: 2.0.0\n---\nshipped Agent\n`,
    );
    await put(join(blueprints, "skills", "demo", "SKILL.md"), versioned("2.0.0", "updated Skill"));
    await put(agentPath, originalAgent);
    await put(skillPath, versioned("1.0.0", "installed Skill"));
    await put(configPath, configBytes);

    const result = runCli(
      project,
      ["update", "--no-interactive", "--on-conflict", "overwrite"],
      pathWith(justDirectory),
      {
        SPINDLE_BLUEPRINTS_DIR: blueprints,
        SPINDLE_TEST_FAIL_WRITE_DIR: agents,
        NODE_OPTIONS: `--import=${join(process.cwd(), "tests", "fail-agent-write.mjs")}`,
      },
    );

    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stderr, /Failed to apply Agent 'write\.agent\.md'/);
    assert.match(result.stderr, /Injected ENOSPC while writing Agent/);
    assert.match(
      result.stderr,
      /Completed changes: removed existing Skill 'demo' before replacement, applied Skill file 'demo\/SKILL\.md', updated Skill 'demo'/,
    );
    assert.match(result.stderr, /Application stopped; rollback was not attempted/);
    assert.equal(await readFile(skillPath, "utf8"), versioned("2.0.0", "updated Skill"));
    assert.deepEqual(await readFile(agentPath), originalAgent);
    assert.deepEqual(await readFile(configPath), configBytes);
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
    await rm(justDirectory, { recursive: true, force: true });
  }
});

test("earlier application failure disposes prepared Just Module staging files", async () => {
  const blueprints = await makeTempDir("spindle-just-stage-cleanup-blueprints-");
  const project = await makeTempDir("spindle-just-stage-cleanup-project-");
  const justDirectory = await makeJustStubDir();
  const github = join(project, ".github");
  const agents = join(github, "agents");
  const justfilePath = join(project, "justfile");
  try {
    await put(
      join(blueprints, "catalog.yaml"),
      `agents:
  write:
    path: write.agent.md
    status: active
    stacks: []
just:
  quality:
    path: quality.just
    status: active
    stacks: []
instructions: {}
skills: {}
`,
    );
    await put(join(blueprints, "agents", "write.agent.md"), versioned("1.0.0", "new Agent"));
    await put(join(blueprints, "just", "quality.just"), "quality:\n  @echo ready\n");

    const result = runCli(
      project,
      ["init", "--stack", "python", "--no-interactive"],
      pathWith(justDirectory),
      {
        SPINDLE_BLUEPRINTS_DIR: blueprints,
        SPINDLE_TEST_FAIL_WRITE_DIR: agents,
        NODE_OPTIONS: `--import=${join(process.cwd(), "tests", "fail-agent-write.mjs")}`,
      },
    );

    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stderr, /Failed to apply Agent 'write\.agent\.md'/);
    assert.match(result.stderr, /Injected ENOSPC while writing Agent/);
    assert.match(result.stderr, /Application stopped; rollback was not attempted/);
    assert.deepEqual(
      (await readdir(project)).filter((name) => name.startsWith(".spindle-just-modules-")),
      [],
    );
    await assert.rejects(readFile(justfilePath), { code: "ENOENT" });
    await assert.rejects(readFile(join(github, "scripts", "just-modules", "quality.just")), {
      code: "ENOENT",
    });
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
    await rm(justDirectory, { recursive: true, force: true });
  }
});

test("partial Skill application reports each applied file and the exact later failure", async () => {
  const blueprints = await makeTempDir("spindle-skill-file-progress-blueprints-");
  const project = await makeTempDir("spindle-skill-file-progress-project-");
  const justDirectory = await makeJustStubDir();
  const github = join(project, ".github");
  const skill = join(github, "skills", "demo");
  const skillEntry = join(skill, "SKILL.md");
  const firstFile = join(skill, "a-first.txt");
  const failingFile = join(skill, "z-failing.txt");
  const configPath = join(github, "spindle.json");
  const configBytes = Buffer.from('{"stacks":["python"],"variables":{}}\n');
  const outsideSentinel = join(project, "outside-sentinel.txt");
  const outsideBytes = Buffer.from("outside managed targets\n");

  try {
    await put(
      join(blueprints, "catalog.yaml"),
      `agents: {}
just: {}
instructions: {}
skills:
  demo:
    path: demo/
    status: active
    stacks: []
`,
    );
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
      pathWith(justDirectory),
      {
        SPINDLE_BLUEPRINTS_DIR: blueprints,
        SPINDLE_TEST_FAIL_WRITE_FILE: failingFile,
        NODE_OPTIONS: `--import=${join(process.cwd(), "tests", "fail-skill-file-write.mjs")}`,
      },
    );

    assert.notEqual(result.status, 0, result.stdout);
    assert.ok(
      result.stderr.includes(`Failed to apply file 'z-failing.txt' at '${failingFile}'`),
      result.stderr,
    );
    assert.match(result.stderr, /applied Skill file 'demo\/SKILL\.md'/);
    assert.match(result.stderr, /applied Skill file 'demo\/a-first\.txt'/);
    assert.match(result.stderr, /Application stopped; rollback was not attempted/);
    assert.equal(await readFile(skillEntry, "utf8"), versioned("2.0.0", "new Skill"));
    assert.equal(await readFile(firstFile, "utf8"), "first supporting file\n");
    await assert.rejects(readFile(failingFile), { code: "ENOENT" });
    await assert.rejects(readFile(join(skill, "local.txt")), { code: "ENOENT" });
    assert.deepEqual(await readFile(configPath), configBytes);
    assert.deepEqual(await readFile(outsideSentinel), outsideBytes);
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
    await rm(justDirectory, { recursive: true, force: true });
  }
});

test("application deletion failure reports all earlier cross-kind changes", async () => {
  const blueprints = await makeTempDir("spindle-delete-progress-blueprints-");
  const project = await makeTempDir("spindle-delete-progress-project-");
  const justDirectory = await makeJustStubDir();
  const github = join(project, ".github");
  const newAgent = join(github, "agents", "new.agent.md");
  const firstRemoval = join(github, "agents", "first.agent.md");
  const secondRemoval = join(github, "agents", "second.agent.md");

  try {
    await put(
      join(blueprints, "catalog.yaml"),
      `agents:
  new:
    path: new.agent.md
    status: active
    stacks: []
  first:
    path: first.agent.md
    status: removed
    stacks: []
  second:
    path: second.agent.md
    status: removed
    stacks: []
just: {}
instructions: {}
skills: {}
`,
    );
    await put(
      join(blueprints, "agents", "new.agent.md"),
      `---\nname: new\nmeta:\n  spindle:\n    version: 1.0.0\n---\nnew Agent\n`,
    );
    await put(join(github, "spindle.json"), '{"stacks":["python"],"variables":{}}\n');
    await put(firstRemoval, "first installed Agent\n");
    await put(secondRemoval, "second installed Agent\n");

    const result = runCli(
      project,
      ["update", "--no-interactive", "--include-new"],
      pathWith(justDirectory),
      {
        SPINDLE_BLUEPRINTS_DIR: blueprints,
        SPINDLE_TEST_FAIL_REMOVE_TARGET: secondRemoval,
        NODE_OPTIONS: `--import=${join(process.cwd(), "tests", "fail-removal.mjs")}`,
      },
    );

    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stderr, /Failed to remove Agent 'second\.agent\.md'/);
    assert.match(result.stderr, /forced removal failure/);
    assert.match(
      result.stderr,
      /Completed changes: installed Agent 'new\.agent\.md', removed Agent 'first\.agent\.md'/,
    );
    assert.match(result.stderr, /Application stopped; rollback was not attempted/);
    assert.match(await readFile(newAgent, "utf8"), /new Agent/);
    await assert.rejects(readFile(firstRemoval), { code: "ENOENT" });
    assert.equal(await readFile(secondRemoval, "utf8"), "second installed Agent\n");
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
    await rm(justDirectory, { recursive: true, force: true });
  }
});

test("mixed reconciliation reports exact writes, removals, imports, and repeated-run results", async () => {
  const blueprints = await makeTempDir("spindle-mixed-reconciliation-blueprints-");
  const project = await makeTempDir("spindle-mixed-reconciliation-project-");
  const justDirectory = await makeJustStubDir();
  const github = join(project, ".github");
  const agentPath = join(github, "agents", "new.agent.md");
  const instructionPath = join(github, "instructions", "testing", "testing.instructions.md");
  const currentSkill = join(github, "skills", "current");
  const retiredSkill = join(github, "skills", "retired");
  const modules = join(github, "scripts", "just-modules");
  const justfilePath = join(project, "justfile");
  const outsideSentinel = join(project, "outside-sentinel.txt");
  const currentSkillSource = versioned("1.0.0", "current source Skill");
  const currentSkillInstall = versioned("1.0.0", "preserve installed Skill");
  const preservedAsset = Buffer.from("preserve surviving installed asset\n");
  const outsideBytes = Buffer.from("outside managed targets\n");
  const justfileInput =
    "ready:\n  @echo keep\n\nmod retired '.github/scripts/just-modules/retired.just'\n";
  const justfileExpected =
    "ready:\n  @echo keep\n\nmod quality '.github/scripts/just-modules/quality.just'\n";

  try {
    await put(
      join(blueprints, "catalog.yaml"),
      `agents:
  new:
    path: new.agent.md
    status: active
    stacks: []
just:
  quality:
    path: quality.just
    status: active
    stacks: []
  retired:
    path: retired.just
    status: removed
    stacks: []
instructions:
  testing:
    path: testing/
    status: active
    stacks: []
skills:
  current:
    path: current/
    status: active
    stacks: []
  retired:
    path: retired/
    status: removed
    stacks: []
`,
    );
    await put(
      join(blueprints, "agents", "new.agent.md"),
      `---\nname: new\nmeta:\n  spindle:\n    version: 1.0.0\n---\nnew Agent\n`,
    );
    await put(join(blueprints, "just", "quality.just"), "quality:\n  @echo bundled\n");
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
    await put(modules + "/retired.just", "retired module\n");
    await put(justfilePath, justfileInput);
    await put(outsideSentinel, outsideBytes);

    const first = runCli(
      project,
      ["update", "--no-interactive", "--include-new"],
      pathWith(justDirectory),
      { SPINDLE_BLUEPRINTS_DIR: blueprints },
    );

    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /Added 1, updated 0, skipped 0, up to date 0 agent\(s\)/);
    assert.match(first.stdout, /Added 1, updated 0, skipped 0, up to date 0 instruction\(s\)/);
    assert.match(first.stdout, /Added 0, updated 0, skipped 0, up to date 1 skill\(s\)/);
    assert.match(first.stdout, /Added 1, updated 0, skipped 0, up to date 0 just module\(s\)/);
    assert.match(first.stdout, /Removed skill 'retired'/);
    assert.match(first.stdout, /Removed skill 'current\/local\.txt'/);
    assert.match(first.stdout, /Removed just module 'retired\.just'/);
    assert.equal(
      await readFile(agentPath, "utf8"),
      `---\nname: new\nmeta:\n  spindle:\n    version: 1.0.0\n---\nnew Agent\n`,
    );
    assert.equal(await readFile(instructionPath, "utf8"), versioned("1.0.0", "new Instruction"));
    assert.equal(await readFile(join(currentSkill, "SKILL.md"), "utf8"), currentSkillInstall);
    assert.deepEqual(await readFile(join(currentSkill, "asset.txt")), preservedAsset);
    await assert.rejects(readFile(join(currentSkill, "local.txt")), { code: "ENOENT" });
    await assert.rejects(readFile(join(retiredSkill, "nested", "local.txt")), { code: "ENOENT" });
    assert.equal(
      await readFile(join(modules, "quality.just"), "utf8"),
      "quality:\n  @echo bundled\n",
    );
    await assert.rejects(readFile(join(modules, "retired.just")), { code: "ENOENT" });
    assert.equal(await readFile(justfilePath, "utf8"), justfileExpected);
    assert.deepEqual(await readFile(outsideSentinel), outsideBytes);

    const second = runCli(
      project,
      ["update", "--no-interactive", "--include-new"],
      pathWith(justDirectory),
      { SPINDLE_BLUEPRINTS_DIR: blueprints },
    );

    assert.equal(second.status, 0, second.stderr);
    assert.equal(second.stdout.includes("Removed "), false);
    assert.match(second.stdout, /Added 0, updated 0, skipped 0, up to date 1 agent\(s\)/);
    assert.match(second.stdout, /Added 0, updated 0, skipped 0, up to date 1 instruction\(s\)/);
    assert.match(second.stdout, /Added 0, updated 0, skipped 0, up to date 1 skill\(s\)/);
    assert.match(second.stdout, /Added 1, updated 0, skipped 0, up to date 0 just module\(s\)/);
    assert.equal(await readFile(justfilePath, "utf8"), justfileExpected);
    assert.deepEqual(await readFile(outsideSentinel), outsideBytes);
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
    await rm(justDirectory, { recursive: true, force: true });
  }
});
