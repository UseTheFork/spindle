import assert from "node:assert/strict";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { makeJustStubDir, makeTempDir, pathWith, runCli } from "./helpers.ts";

let justDirectory: string;

before(async () => {
  justDirectory = await makeJustStubDir();
});

after(async () => {
  await rm(justDirectory, { recursive: true, force: true });
});

const instruction = (name: string, version: string | null, body: string) =>
  `---\nname: ${name}\n${version === null ? "" : `meta:\n  spindle:\n    version: ${version}\n`}---\n${body}\n`;

async function writeInstruction(blueprints: string, path: string, text: string) {
  const file = join(blueprints, "instructions", path, "INSTRUCTION.md");
  await mkdir(join(file, ".."), { recursive: true });
  await writeFile(file, text);
}

test("init and update install selected Instructions as single versioned files", async () => {
  const blueprints = await makeTempDir("spindle-instruction-blueprints-");
  const project = await makeTempDir("spindle-instruction-project-");
  const installed = join(project, ".github", "instructions");
  const env = { SPINDLE_BLUEPRINTS_DIR: blueprints };
  try {
    await writeInstruction(
      blueprints,
      "style",
      instruction(
        "style",
        "1.0.0",
        "{% if 'python' in stacks %}Python{% endif %} {{ variables.owner }}",
      ),
    );
    await writeInstruction(blueprints, "invalid", instruction("invalid", "1.0.0", "shipped"));
    await writeInstruction(blueprints, "py/stacks/python", instruction("py", "1.0.0", "py only"));
    await writeInstruction(blueprints, "ts/stacks/typescript", instruction("ts", "1.0.0", "ts"));
    await writeInstruction(blueprints, "local", instruction("local", "1.0.0", "shipped"));
    await mkdir(installed, { recursive: true });
    await writeFile(join(installed, "local.instructions.md"), instruction("local", null, "mine"));

    const init = runCli(
      project,
      ["init", "--stack", "python", "--var", "owner=team", "--on-conflict", "skip"],
      pathWith(justDirectory),
      env,
    );

    assert.equal(init.status, 0, init.stderr);
    assert.equal(
      init.stdout,
      "✔ Installed 3 instruction(s) for python. Skipped 1 existing instruction(s)\n",
    );
    assert.deepEqual(await readdir(installed), [
      "invalid.instructions.md",
      "local.instructions.md",
      "py.instructions.md",
      "style.instructions.md",
    ]);
    assert.equal(
      await readFile(join(installed, "style.instructions.md"), "utf8"),
      instruction("style", "1.0.0", "Python team"),
    );

    await writeInstruction(
      blueprints,
      "style",
      instruction("style", "2.0.0", "{{ variables.owner }} v2"),
    );
    const invalidInstalled = join(installed, "invalid.instructions.md");
    const invalidLocal = instruction("invalid", "v1", "local");
    await writeFile(invalidInstalled, invalidLocal);
    const update = runCli(
      project,
      ["update", "--no-interactive", "--on-conflict", "overwrite"],
      pathWith(justDirectory),
      env,
    );

    assert.equal(update.status, 0, update.stderr);
    assert.equal(
      await readFile(join(installed, "style.instructions.md"), "utf8"),
      instruction("style", "2.0.0", "team v2"),
    );
    assert.equal(
      await readFile(join(installed, "local.instructions.md"), "utf8"),
      instruction("local", null, "mine"),
    );
    assert.equal(await readFile(invalidInstalled, "utf8"), invalidLocal);
    assert.match(update.stderr, /Instruction 'local'.*no version/);
    assert.match(update.stderr, /Instruction 'invalid'.*non-semver version 'v1'/);
    assert.equal(update.stdout, "✔ Added 0, updated 1, skipped 2, up to date 1 instruction(s)\n");
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("Instruction conflicts and invalid versions preserve the installed file", async () => {
  const blueprints = await makeTempDir("spindle-instruction-conflict-blueprints-");
  const project = await makeTempDir("spindle-instruction-conflict-project-");
  const target = join(project, ".github", "instructions", "style.instructions.md");
  const env = { SPINDLE_BLUEPRINTS_DIR: blueprints };
  try {
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, "local\n");
    await writeInstruction(blueprints, "style", instruction("style", "v1", "shipped"));

    const invalid = runCli(
      project,
      ["init", "--stack", "python", "--on-conflict", "overwrite"],
      pathWith(justDirectory),
      env,
    );
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, /Invalid Instruction metadata in 'INSTRUCTION\.md'/);
    assert.equal(await readFile(target, "utf8"), "local\n");

    await writeInstruction(blueprints, "style", instruction("style", "1.0.0", "shipped"));
    const conflict = runCli(
      project,
      ["init", "--stack", "python", "--no-interactive"],
      pathWith(justDirectory),
      env,
    );
    assert.notEqual(conflict.status, 0);
    assert.match(conflict.stderr, /Instruction 'style' already exists/);
    assert.equal(await readFile(target, "utf8"), "local\n");

    const overwrite = runCli(
      project,
      ["init", "--stack", "python", "--on-conflict", "overwrite"],
      pathWith(justDirectory),
      env,
    );
    assert.equal(overwrite.status, 0, overwrite.stderr);
    assert.equal(await readFile(target, "utf8"), instruction("style", "1.0.0", "shipped"));
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("production init and update ship no Instructions and do not report the empty kind", async () => {
  const project = await makeTempDir("spindle-instruction-production-project-");
  try {
    const init = runCli(project, ["init", "--stack", "python"], pathWith(justDirectory));
    assert.equal(init.status, 0, init.stderr);
    assert.match(init.stdout, /skill\(s\), [1-9]\d* agent\(s\) for python/);
    assert.doesNotMatch(init.stdout, /instruction/i);
    await assert.rejects(readdir(join(project, ".github", "instructions")));

    const update = runCli(project, ["update", "--no-interactive"], pathWith(justDirectory));
    assert.equal(update.status, 0, update.stderr);
    assert.doesNotMatch(update.stdout, /instruction/i);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});
