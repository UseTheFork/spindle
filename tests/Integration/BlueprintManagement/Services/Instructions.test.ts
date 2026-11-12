import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, test } from "vitest";

import { runCliWithFixtureCatalog as runCli } from "../../../Helpers/Cli.ts";
import { makeTempDir } from "../../../Helpers/TemporaryDirectories.ts";

const instruction = (name: string, version: string | null, body: string) =>
  `---\nname: ${name}\n${version === null ? "" : `metadata:\n  spindle:\n    version: ${version}\n`}---\n${body}\n`;

async function writeInstruction(blueprints: string, path: string, text: string) {
  const file = join(
    blueprints,
    "instructions",
    path.endsWith(".instructions.md") ? path : `${path}.instructions.md`,
  );
  await mkdir(join(file, ".."), { recursive: true });
  await writeFile(file, text);
}

test("init and update install selected Instructions as single versioned files", async () => {
  const blueprints = await makeTempDir("spindle-instruction-blueprints-");
  const project = await makeTempDir("spindle-instruction-project-");
  const installed = join(project, ".github", "instructions");
  const env = { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints };
  {
    await writeInstruction(
      blueprints,
      "style",
      instruction(
        "style",
        "1.0.0",
        "{% if 'python' in stacks %}Python{% endif %} {{ computed.spindle_package_manager }}",
      ),
    );
    await writeInstruction(blueprints, "invalid", instruction("invalid", "1.0.0", "shipped"));
    await writeInstruction(blueprints, "py.instructions.md", instruction("py", "1.0.0", "py"));
    await writeInstruction(blueprints, "ts.instructions.md", instruction("ts", "1.0.0", "ts"));
    await writeInstruction(blueprints, "local", instruction("local", "1.0.0", "shipped"));
    await mkdir(installed, { recursive: true });
    await writeFile(join(installed, "local.instructions.md"), instruction("local", null, "mine"));

    const init = runCli(
      project,
      ["init", "--stack", "python", "--on-conflict", "skip"],
      process.env.PATH ?? "",
      env,
    );

    expect(init.status, init.stderr).toBe(0);
    expect(init.stdout).toBe(
      "✔ Installed 4 instruction(s) for python. Skipped 1 existing instruction(s)\n✔ Initialized project guidance and tooling documentation.\n",
    );
    expect(await readdir(installed)).toEqual([
      "invalid.instructions.md",
      "local.instructions.md",
      "py.instructions.md",
      "style.instructions.md",
      "ts.instructions.md",
    ]);
    expect(await readFile(join(installed, "style.instructions.md"), "utf8")).toBe(
      instruction("style", "1.0.0", "Python pnpm"),
    );

    await writeInstruction(
      blueprints,
      "style",
      instruction("style", "2.0.0", "{{ computed.spindle_package_manager }} v2"),
    );
    const invalidInstalled = join(installed, "invalid.instructions.md");
    const invalidLocal = instruction("invalid", "v1", "local");
    await writeFile(invalidInstalled, invalidLocal);
    const update = runCli(project, ["update"], process.env.PATH ?? "", env);

    expect(update.status, update.stderr).toBe(0);
    expect(await readFile(join(installed, "style.instructions.md"), "utf8")).toBe(
      instruction("style", "2.0.0", "pnpm v2"),
    );
    expect(await readFile(join(installed, "local.instructions.md"), "utf8")).toBe(
      instruction("local", null, "mine"),
    );
    expect(await readFile(invalidInstalled, "utf8")).toBe(
      instruction("invalid", "1.0.0", "shipped"),
    );
    expect(update.stderr).toMatch(/Instruction 'local\.instructions\.md'.*not managed/);
    expect(update.stdout).toBe("✔ Added 0, updated 2, skipped 1, up to date 2 instruction(s)\n");
  }
});

test("Instruction conflicts and invalid versions preserve the installed file", async () => {
  const blueprints = await makeTempDir("spindle-instruction-conflict-blueprints-");
  const project = await makeTempDir("spindle-instruction-conflict-project-");
  const target = join(project, ".github", "instructions", "style.instructions.md");
  const env = { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints };
  {
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, "local\n");
    await writeInstruction(blueprints, "style", instruction("style", "v1", "shipped"));

    const invalid = runCli(
      project,
      ["init", "--stack", "python", "--on-conflict", "overwrite"],
      process.env.PATH ?? "",
      env,
    );
    expect(invalid.status).not.toBe(0);
    expect(invalid.stderr).toMatch(/Invalid Instruction metadata in 'style\.instructions\.md'/);
    expect(await readFile(target, "utf8")).toBe("local\n");

    await writeInstruction(blueprints, "style", instruction("style", "1.0.0", "shipped"));
    const conflict = runCli(
      project,
      ["init", "--stack", "python", "--no-interactive"],
      process.env.PATH ?? "",
      env,
    );
    expect(conflict.status).not.toBe(0);
    expect(conflict.stderr).toMatch(/Instruction 'style\.instructions\.md' already exists/);
    expect(await readFile(target, "utf8")).toBe("local\n");

    const overwrite = runCli(
      project,
      ["init", "--stack", "python", "--on-conflict", "overwrite"],
      process.env.PATH ?? "",
      env,
    );
    expect(overwrite.status, overwrite.stderr).toBe(0);
    expect(await readFile(target, "utf8")).toBe(instruction("style", "1.0.0", "shipped"));
  }
});

test("production init and update install the shipped Instructions", async () => {
  const project = await makeTempDir("spindle-instruction-production-project-");
  {
    const init = runCli(project, ["init", "--stack", "python"], process.env.PATH ?? "");
    expect(init.status, init.stderr).toBe(0);
    expect(init.stdout).toMatch(
      /[1-9]\d* skill\(s\), [1-9]\d* agent\(s\), 2 instruction\(s\) for python/,
    );
    expect(init.stdout).toMatch(/2 instruction\(s\) for python/);
    expect(await readdir(join(project, ".github", "instructions"))).toEqual([
      "code-commenting.instructions.md",
      "source-architecture.instructions.md",
    ]);
    expect(
      await readFile(
        join(project, ".github", "instructions", "code-commenting.instructions.md"),
        "utf8",
      ),
    ).toContain("# Code Commenting Rules");
    expect(
      await readFile(
        join(project, ".github", "instructions", "source-architecture.instructions.md"),
        "utf8",
      ),
    ).toContain("# Source Architecture");

    const update = runCli(project, ["update"], process.env.PATH ?? "");
    expect(update.status, update.stderr).toBe(0);
    expect(update.stdout).toMatch(/up to date 2 instruction\(s\)/);
  }
});
