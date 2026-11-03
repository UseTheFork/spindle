import assert from "node:assert/strict";
import { lstat, mkdir, readFile, rm, symlink, writeFile as fsWriteFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { after, before, test } from "node:test";

import {
  makeJustStubDir,
  makeTempDir,
  pathWith,
  runCliWithFixtureCatalog as runCli,
} from "./helpers.ts";

let justDirectory: string;

before(async () => {
  justDirectory = await makeJustStubDir();
});

after(async () => {
  await rm(justDirectory, { recursive: true, force: true });
});

const versioned = (name: string, body: string) =>
  `---\nname: ${name}\nmeta:\n  spindle:\n    version: 1.0.0\n---\n${body}\n`;

const catalog = `agents:
  baseline:
    path: baseline.agent.md
    status: active
    stacks: []
  retired:
    path: retired.agent.md
    status: removed
    stacks: []
  absent:
    path: absent.agent.md
    status: removed
    stacks: []
  typescript-only:
    path: typescript.agent.md
    status: active
    stacks: [typescript]
just:
  baseline:
    path: baseline.just
    status: active
    stacks: []
  absent:
    path: absent.just
    status: removed
    stacks: []
  retired:
    path: retired.just
    status: removed
    stacks: []
  typescript-only:
    path: typescript.just
    status: active
    stacks: [typescript]
instructions:
  baseline:
    path: baseline.instructions.md
    status: active
    stacks: []
  retired:
    path: retired/
    status: removed
    stacks: []
  typescript-only:
    path: typescript/
    status: active
    stacks: [typescript]
skills:
  baseline:
    path: baseline/
    status: active
    stacks: []
  retired:
    path: retired/
    status: removed
    stacks: []
  typescript-only:
    path: typescript/
    status: active
    stacks: [typescript]
`;

async function writeFile(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true });
  await fsWriteFile(path, content);
}

async function assertMissing(path: string) {
  await assert.rejects(lstat(path), { code: "ENOENT" });
}

for (const mode of ["init", "update"] as const) {
  test(`${mode} removes retired and Stack-inapplicable catalog targets across all kinds`, async () => {
    const blueprints = await makeTempDir(`spindle-${mode}-removal-blueprints-`);
    const project = await makeTempDir(`spindle-${mode}-removal-project-`);
    const github = join(project, ".github");
    const modules = join(github, "scripts", "just-modules");
    const outside = join(project, "unrelated.txt");
    try {
      await writeFile(join(blueprints, "catalog.yaml"), catalog);
      await writeFile(
        join(blueprints, "agents", "baseline.agent.md"),
        versioned("baseline", "baseline Agent"),
      );
      await writeFile(
        join(blueprints, "agents", "typescript.agent.md"),
        versioned("typescript-only", "inapplicable Agent"),
      );
      await writeFile(
        join(blueprints, "instructions", "baseline.instructions.md"),
        versioned("baseline", "baseline Instruction"),
      );
      await writeFile(
        join(blueprints, "instructions", "typescript", "guide.instructions.md"),
        versioned("typescript-only", "inapplicable Instruction"),
      );
      await writeFile(
        join(blueprints, "skills", "baseline", "SKILL.md"),
        versioned("baseline", "baseline Skill"),
      );
      await writeFile(
        join(blueprints, "skills", "typescript", "SKILL.md"),
        versioned("typescript-only", "inapplicable Skill"),
      );
      await writeFile(join(blueprints, "just", "baseline.just"), "baseline recipe\n");
      await writeFile(join(blueprints, "just", "typescript.just"), "typescript recipe\n");

      await writeFile(join(github, "agents", "baseline.agent.md"), versioned("baseline", "local"));
      await writeFile(join(github, "agents", "retired.agent.md"), "edited retired Agent\n");
      await writeFile(join(github, "agents", "typescript.agent.md"), "edited inapplicable Agent\n");
      await writeFile(
        join(github, "instructions", "baseline.instructions.md"),
        versioned("baseline", "local"),
      );
      await writeFile(
        join(github, "instructions", "retired", "guide.instructions.md"),
        "edited retired Instruction\n",
      );
      await writeFile(
        join(github, "instructions", "retired", "nested", "local-addition.txt"),
        "local nested addition\n",
      );
      await writeFile(
        join(github, "instructions", "typescript", "guide.instructions.md"),
        "edited inapplicable Instruction\n",
      );
      await writeFile(
        join(github, "instructions", "typescript", "nested", "local-addition.txt"),
        "inapplicable nested addition\n",
      );
      await writeFile(
        join(github, "skills", "baseline", "SKILL.md"),
        versioned("baseline", "local"),
      );
      await writeFile(join(github, "skills", "retired", "SKILL.md"), "edited retired Skill\n");
      await writeFile(
        join(github, "skills", "retired", "nested", "local-addition.txt"),
        "local nested addition\n",
      );
      await writeFile(
        join(github, "skills", "typescript", "SKILL.md"),
        "edited inapplicable Skill\n",
      );
      await writeFile(
        join(github, "skills", "typescript", "nested", "local-addition.txt"),
        "inapplicable nested addition\n",
      );
      await writeFile(join(modules, "baseline.just"), "local recipe\n");
      await writeFile(join(modules, "retired.just"), "edited retired module\n");
      await writeFile(join(modules, "typescript.just"), "edited inapplicable module\n");
      await writeFile(join(modules, "custom.just"), "unlisted module content\n");
      await writeFile(
        join(project, "justfile"),
        [
          "# User-owned root content",
          "mod custom '.github/scripts/just-modules/custom.just'",
          "mod baseline '.github/scripts/just-modules/baseline.just'",
          "mod retired-alias '.github/scripts/just-modules/retired.just'",
          "mod absent '.github/scripts/just-modules/absent.just'",
          "mod typescript '.github/scripts/just-modules/typescript.just'",
          "ready:",
          "  @echo keep",
          "",
        ].join("\n"),
      );
      await writeFile(outside, "unrelated project content\n");
      if (mode === "update") {
        await writeFile(
          join(github, "spindle.json"),
          JSON.stringify({ stacks: ["python"], variables: {} }),
        );
      }

      const args =
        mode === "init"
          ? ["init", "--stack", "python", "--no-interactive", "--on-conflict", "skip"]
          : ["update", "--no-interactive", "--on-conflict", "skip", "--include-new"];
      const env = { SPINDLE_BLUEPRINTS_DIR: blueprints };
      const result = runCli(project, args, pathWith(justDirectory), env);

      assert.equal(result.status, 0, result.stderr);
      for (const path of [
        join(github, "agents", "retired.agent.md"),
        join(github, "agents", "typescript.agent.md"),
        join(github, "instructions", "retired"),
        join(github, "instructions", "typescript"),
        join(github, "skills", "retired"),
        join(github, "skills", "typescript"),
        join(modules, "retired.just"),
        join(modules, "typescript.just"),
      ]) {
        await assertMissing(path);
      }
      assert.equal(await readFile(outside, "utf8"), "unrelated project content\n");
      assert.equal(
        await readFile(join(github, "agents", "baseline.agent.md"), "utf8"),
        versioned("baseline", "local"),
      );
      const justfile = await readFile(join(project, "justfile"), "utf8");
      assert.match(justfile, /# User-owned root content/);
      assert.match(justfile, /mod custom '.github\/scripts\/just-modules\/custom\.just'/);
      assert.match(justfile, /mod baseline '.github\/scripts\/just-modules\/baseline\.just'/);
      assert.match(justfile, /ready:\n  @echo keep/);
      assert.doesNotMatch(justfile, /mod (?:absent|retired-alias|typescript) /);
      assert.equal(
        await readFile(join(modules, "custom.just"), "utf8"),
        "unlisted module content\n",
      );
      assert.equal((result.stdout.match(/Removed /g) ?? []).length, 9, result.stdout);
      assert.match(result.stdout, /Removed just module 'absent\.just'/);

      const reportsMissing = result.stdout.includes("absent.agent.md");
      assert.equal(
        reportsMissing,
        false,
        "absent removal targets are not reported as actual removals",
      );
      if (mode === "update") {
        const repeated = runCli(project, args, pathWith(justDirectory), env);
        assert.equal(repeated.status, 0, repeated.stderr);
        assert.doesNotMatch(repeated.stdout, /Removed /);
      }
    } finally {
      await rm(blueprints, { recursive: true, force: true });
      await rm(project, { recursive: true, force: true });
    }
  });
}

for (const mode of ["init", "update"] as const) {
  test(`${mode} reports removal of an absent aliased Just Module target`, async () => {
    const blueprints = await makeTempDir(`spindle-${mode}-absent-alias-blueprints-`);
    const project = await makeTempDir(`spindle-${mode}-absent-alias-project-`);
    const github = join(project, ".github");
    const modules = join(github, "scripts", "just-modules");
    try {
      await writeFile(
        join(blueprints, "catalog.yaml"),
        `agents: {}
just:
  retired:
    path: retired.just
    status: removed
    stacks: []
instructions: {}
skills: {}
`,
      );
      await writeFile(join(modules, "custom.just"), "custom recipe\n");
      await writeFile(
        join(project, "justfile"),
        [
          "# User-owned root content",
          "mod custom '.github/scripts/just-modules/custom.just'",
          "mod retired-alias '.github/scripts/just-modules/retired.just'",
          "ready:",
          "  @echo keep",
          "",
        ].join("\n"),
      );
      if (mode === "update") {
        await writeFile(
          join(github, "spindle.json"),
          JSON.stringify({ stacks: ["python"], variables: {} }),
        );
      }

      const args =
        mode === "init"
          ? ["init", "--stack", "python", "--no-interactive"]
          : ["update", "--no-interactive"];
      const result = runCli(project, args, pathWith(justDirectory), {
        SPINDLE_BLUEPRINTS_DIR: blueprints,
      });

      assert.equal(result.status, 0, result.stderr);
      await assertMissing(join(modules, "retired.just"));
      const justfile = await readFile(join(project, "justfile"), "utf8");
      assert.doesNotMatch(justfile, /mod retired-alias /);
      assert.match(justfile, /# User-owned root content/);
      assert.match(justfile, /mod custom '.github\/scripts\/just-modules\/custom\.just'/);
      assert.match(justfile, /ready:\n  @echo keep/);
      assert.match(result.stdout, /Removed just module 'retired\.just'/);
      assert.doesNotMatch(result.stdout, /retired-alias\.just/);
      assert.equal(await readFile(join(modules, "custom.just"), "utf8"), "custom recipe\n");
    } finally {
      await rm(blueprints, { recursive: true, force: true });
      await rm(project, { recursive: true, force: true });
    }
  });
}

test("update deletes newly inapplicable entries, retains multi-Stack matches, and infers no old paths", async () => {
  const blueprints = await makeTempDir("spindle-stack-transition-blueprints-");
  const project = await makeTempDir("spindle-stack-transition-project-");
  const github = join(project, ".github");
  const catalogForTransition = `agents:
  multi:
    path: multi.agent.md
    status: active
    stacks: [python, typescript]
  python-only:
    path: python-only.agent.md
    status: active
    stacks: [python]
  renamed:
    path: new.agent.md
    status: active
    stacks: []
just: {}
instructions: {}
skills: {}
`;
  try {
    await writeFile(join(blueprints, "catalog.yaml"), catalogForTransition);
    for (const name of ["multi", "python-only", "new"]) {
      await writeFile(
        join(blueprints, "agents", `${name}.agent.md`),
        versioned(name, `shipped ${name}`),
      );
      await writeFile(
        join(github, "agents", `${name}.agent.md`),
        versioned(name, `installed ${name}`),
      );
    }
    await writeFile(join(github, "agents", "old.agent.md"), "old path content\n");
    await writeFile(join(github, "agents", "unlisted.agent.md"), "unlisted content\n");
    const configPath = join(github, "spindle.json");
    await writeFile(configPath, JSON.stringify({ stacks: ["python"], variables: {} }));

    const env = { SPINDLE_BLUEPRINTS_DIR: blueprints };
    const args = ["update", "--no-interactive", "--on-conflict", "skip"];
    const pythonResult = runCli(project, args, pathWith(justDirectory), env);
    assert.equal(pythonResult.status, 0, pythonResult.stderr);
    assert.equal(
      await readFile(join(github, "agents", "python-only.agent.md"), "utf8"),
      versioned("python-only", "installed python-only"),
    );

    await writeFile(configPath, JSON.stringify({ stacks: ["typescript"], variables: {} }));
    const typescriptResult = runCli(project, args, pathWith(justDirectory), env);
    assert.equal(typescriptResult.status, 0, typescriptResult.stderr);
    await assertMissing(join(github, "agents", "python-only.agent.md"));
    assert.equal(
      await readFile(join(github, "agents", "multi.agent.md"), "utf8"),
      versioned("multi", "installed multi"),
    );
    assert.equal(
      await readFile(join(github, "agents", "old.agent.md"), "utf8"),
      "old path content\n",
    );
    assert.equal(
      await readFile(join(github, "agents", "unlisted.agent.md"), "utf8"),
      "unlisted content\n",
    );
    assert.match(typescriptResult.stdout, /Removed agent 'python-only\.agent\.md'/);
    assert.doesNotMatch(typescriptResult.stdout, /Removed agent '(?:multi|old|unlisted)/);
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("update rejects unsafe deletion targets before changing any target or outside content", async () => {
  const blueprints = await makeTempDir("spindle-unsafe-removal-blueprints-");
  const project = await makeTempDir("spindle-unsafe-removal-project-");
  const github = join(project, ".github");
  const outside = join(project, "outside.txt");
  const firstTarget = join(github, "agents", "first.agent.md");
  const secondTarget = join(github, "agents", "second.agent.md");
  try {
    await writeFile(
      join(blueprints, "catalog.yaml"),
      `agents:
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
    await writeFile(firstTarget, "first target must remain\n");
    await writeFile(outside, "outside target must remain\n");
    await symlink(outside, secondTarget);
    await writeFile(
      join(github, "spindle.json"),
      JSON.stringify({ stacks: ["python"], variables: {} }),
    );

    const result = runCli(project, ["update", "--no-interactive"], pathWith(justDirectory), {
      SPINDLE_BLUEPRINTS_DIR: blueprints,
    });

    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stderr, /symbolic link/i);
    assert.equal(await readFile(firstTarget, "utf8"), "first target must remain\n");
    assert.equal(await readFile(outside, "utf8"), "outside target must remain\n");
    assert.equal((await lstat(secondTarget)).isSymbolicLink(), true);
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("update rejects a directory at a file-removal target before deleting other targets", async () => {
  const blueprints = await makeTempDir("spindle-wrong-target-blueprints-");
  const project = await makeTempDir("spindle-wrong-target-project-");
  const github = join(project, ".github");
  const firstTarget = join(github, "agents", "first.agent.md");
  const wrongTarget = join(github, "agents", "second.agent.md");
  const child = join(wrongTarget, "keep.txt");
  try {
    await writeFile(
      join(blueprints, "catalog.yaml"),
      `agents:
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
    await writeFile(firstTarget, "first target must remain\n");
    await writeFile(child, "directory content must remain\n");
    await writeFile(
      join(github, "spindle.json"),
      JSON.stringify({ stacks: ["python"], variables: {} }),
    );

    const result = runCli(project, ["update", "--no-interactive"], pathWith(justDirectory), {
      SPINDLE_BLUEPRINTS_DIR: blueprints,
    });

    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stderr, /expected a regular file/i);
    assert.equal(await readFile(firstTarget, "utf8"), "first target must remain\n");
    assert.equal(await readFile(child, "utf8"), "directory content must remain\n");
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("update reports a failed removal and already completed deletions", async () => {
  const blueprints = await makeTempDir("spindle-remove-failure-blueprints-");
  const project = await makeTempDir("spindle-remove-failure-project-");
  const github = join(project, ".github");
  const firstTarget = join(github, "agents", "first.agent.md");
  const secondTarget = join(github, "agents", "second.agent.md");
  try {
    await writeFile(
      join(blueprints, "catalog.yaml"),
      `agents:
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
    await writeFile(firstTarget, "first target\n");
    await writeFile(secondTarget, "second target\n");
    await writeFile(
      join(github, "spindle.json"),
      JSON.stringify({ stacks: ["python"], variables: {} }),
    );

    const result = runCli(project, ["update", "--no-interactive"], pathWith(justDirectory), {
      SPINDLE_BLUEPRINTS_DIR: blueprints,
      NODE_OPTIONS: `--import=${resolve(process.cwd(), "tests/fail-removal.mjs")}`,
      SPINDLE_TEST_FAIL_REMOVE_TARGET: secondTarget,
    });

    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stderr, /Failed to remove Agent 'second\.agent\.md'/);
    assert.match(result.stderr, /forced removal failure/);
    assert.match(result.stderr, /Completed removals: Agent 'first\.agent\.md'/);
    await assertMissing(firstTarget);
    assert.equal(await readFile(secondTarget, "utf8"), "second target\n");
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("update reports completed Just removals when a later Just deletion fails", async () => {
  const blueprints = await makeTempDir("spindle-just-remove-failure-blueprints-");
  const project = await makeTempDir("spindle-just-remove-failure-project-");
  const github = join(project, ".github");
  const modules = join(github, "scripts", "just-modules");
  const firstTarget = join(modules, "first.just");
  const secondTarget = join(modules, "second.just");
  const rootJustfile = join(project, "justfile");
  const originalJustfile = [
    "mod first '.github/scripts/just-modules/first.just'",
    "mod second '.github/scripts/just-modules/second.just'",
    "",
  ].join("\n");
  try {
    await writeFile(
      join(blueprints, "catalog.yaml"),
      `agents: {}
just:
  first:
    path: first.just
    status: removed
    stacks: []
  second:
    path: second.just
    status: removed
    stacks: []
instructions: {}
skills: {}
`,
    );
    await writeFile(firstTarget, "first module\n");
    await writeFile(secondTarget, "second module\n");
    await writeFile(rootJustfile, originalJustfile);
    await writeFile(
      join(github, "spindle.json"),
      JSON.stringify({ stacks: ["python"], variables: {} }),
    );

    const result = runCli(project, ["update", "--no-interactive"], pathWith(justDirectory), {
      SPINDLE_BLUEPRINTS_DIR: blueprints,
      NODE_OPTIONS: `--import=${resolve(process.cwd(), "tests/fail-removal.mjs")}`,
      SPINDLE_TEST_FAIL_REMOVE_TARGET: secondTarget,
    });

    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stderr, /Failed to apply staged Just Module changes/);
    assert.match(result.stderr, /forced removal failure/);
    assert.match(result.stderr, /Completed changes: removed Just Module 'first\.just'/);
    await assertMissing(firstTarget);
    assert.equal(await readFile(secondTarget, "utf8"), "second module\n");
    assert.equal(await readFile(rootJustfile, "utf8"), originalJustfile);
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});
