import assert from "node:assert/strict";
import { lstat, mkdir, readFile, rm, symlink, writeFile as fsWriteFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";

import { makeTempDir, runCliWithFixtureCatalog as runCli } from "./helpers.ts";

const versioned = (name: string, body: string) =>
  `---\nname: ${name}\nmetadata:\n  spindle:\n    version: 1.0.0\n---\n${body}\n`;

async function writeFile(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true });
  await fsWriteFile(path, content);
}

async function assertMissing(path: string) {
  await assert.rejects(lstat(path), { code: "ENOENT" });
}

const removalCatalog = `agents:
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

for (const mode of ["init", "update"] as const) {
  test(`${mode} removes retired and Stack-inapplicable catalog targets`, async () => {
    const blueprints = await makeTempDir(`spindle-${mode}-removal-blueprints-`);
    const project = await makeTempDir(`spindle-${mode}-removal-project-`);
    const github = join(project, ".github");
    const outside = join(project, "unrelated.txt");
    try {
      await writeFile(join(blueprints, "catalog.yaml"), removalCatalog);
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
      const result = runCli(project, args, process.env.PATH ?? "", env);

      assert.equal(result.status, 0, result.stderr);
      for (const path of [
        join(github, "agents", "retired.agent.md"),
        join(github, "agents", "typescript.agent.md"),
        join(github, "instructions", "retired"),
        join(github, "instructions", "typescript"),
        join(github, "skills", "retired"),
        join(github, "skills", "typescript"),
      ]) {
        await assertMissing(path);
      }
      assert.equal(await readFile(outside, "utf8"), "unrelated project content\n");
      assert.equal(
        await readFile(join(github, "agents", "baseline.agent.md"), "utf8"),
        versioned("baseline", "local"),
      );
      assert.equal((result.stdout.match(/Removed /g) ?? []).length, 6, result.stdout);
      assert.equal(result.stdout.includes("absent.agent.md"), false);
      if (mode === "update") {
        const repeated = runCli(project, args, process.env.PATH ?? "", env);
        assert.equal(repeated.status, 0, repeated.stderr);
        assert.doesNotMatch(repeated.stdout, /Removed /);
      }
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
    const pythonResult = runCli(project, args, process.env.PATH ?? "", env);
    assert.equal(pythonResult.status, 0, pythonResult.stderr);
    assert.equal(
      await readFile(join(github, "agents", "python-only.agent.md"), "utf8"),
      versioned("python-only", "installed python-only"),
    );

    await writeFile(configPath, JSON.stringify({ stacks: ["typescript"], variables: {} }));
    const typescriptResult = runCli(project, args, process.env.PATH ?? "", env);
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

    const result = runCli(project, ["update", "--no-interactive"], process.env.PATH ?? "", {
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

    const result = runCli(project, ["update", "--no-interactive"], process.env.PATH ?? "", {
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

    const result = runCli(project, ["update", "--no-interactive"], process.env.PATH ?? "", {
      SPINDLE_BLUEPRINTS_DIR: blueprints,
      NODE_OPTIONS: `--import=${resolve(process.cwd(), "tests/fail-removal.mjs")}`,
      SPINDLE_TEST_FAIL_REMOVE_TARGET: secondTarget,
    });

    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stderr, /Failed to remove Agent 'second\.agent\.md'/);
    assert.match(result.stderr, /forced removal failure/);
    assert.match(result.stderr, /Completed changes: removed Agent 'first\.agent\.md'/);
    await assertMissing(firstTarget);
    assert.equal(await readFile(secondTarget, "utf8"), "second target\n");
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});
