import assert from "node:assert/strict";
import { chmod, lstat, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { Chalk } from "chalk";

import {
  makeJustStubDir,
  makeTempDir,
  pathWith,
  runCliWithFixtureCatalog as runCli,
  runCliInteractiveWithFixtureCatalog as runCliInteractive,
} from "./helpers.ts";

let justDirectory: string;
let stubsDirectory: string;
const fixtureVariables = {
  lint_command: "just lint",
  owner: "nobody",
};

before(async () => {
  justDirectory = await makeJustStubDir();
  stubsDirectory = await makeTempDir("spindle-init-stubs-");
  await mkdir(join(stubsDirectory, "skills", "demo"), { recursive: true });
  await writeFile(
    join(stubsDirectory, "skills", "demo", "SKILL.md"),
    "---\nname: demo\nmeta:\n  spindle:\n    version: 1.0.0\n---\n\n# Demo\n",
  );
});

after(async () => {
  await rm(justDirectory, { recursive: true, force: true });
  await rm(stubsDirectory, { recursive: true, force: true });
});

async function runInit(args: string[], env: Record<string, string> = {}) {
  const project = await makeTempDir();
  try {
    return {
      project,
      result: runCli(project, ["init", ...args], pathWith(justDirectory), {
        SPINDLE_BLUEPRINTS_DIR: stubsDirectory,
        ...env,
      }),
    };
  } catch (error) {
    await rm(project, { recursive: true, force: true });
    throw error;
  }
}

test("init reports success with a plain message when colors are off", async () => {
  const { project, result } = await runInit(["--stack", "python"]);

  try {
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "✔ Installed 1 skill(s) for python\n");
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("init colors success output with chalk when colors are forced", async () => {
  const { project, result } = await runInit(["--stack", "python"], { FORCE_COLOR: "1" });

  try {
    assert.equal(result.status, 0, result.stderr);
    const forced = new Chalk({ level: 1 });
    assert.equal(
      result.stdout,
      `${forced.green("✔")} Installed 1 skill(s) for ${forced.cyan("python")}\n`,
    );
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("init colors errors red with chalk when colors are forced", async () => {
  const { project, result } = await runInit([], { FORCE_COLOR: "1" });

  try {
    assert.notEqual(result.status, 0);
    const forced = new Chalk({ level: 1 });
    assert.equal(result.stderr.startsWith(`${forced.red.bold("spindle:")} `), true, result.stderr);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("init installs its configured skill and records repeatable stack flags", async () => {
  const { project, result } = await runInit(["--stack", "php-laravel", "--stack", "typescript"]);

  try {
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(await readFile(join(project, ".github/spindle.json"), "utf8")), {
      stacks: ["php-laravel", "typescript"],
      variables: fixtureVariables,
    });
    const skill = await readFile(join(project, ".github/skills/demo/SKILL.md"), "utf8");
    assert.match(skill, /^---\nname: demo\nmeta:\n  spindle:\n    version: \d+\.\d+\.\d+\n/m);
    assert.match(skill, /# Demo/);
    assert.deepEqual(await readdir(join(project, ".github/skills")), ["demo"]);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("init renders standalone Just Modules and creates their filename-based imports", async () => {
  const blueprints = await makeTempDir("spindle-init-just-blueprints-");
  const project = await makeTempDir();
  const moduleDirectory = join(blueprints, "just");
  try {
    await mkdir(moduleDirectory, { recursive: true });
    await writeFile(join(moduleDirectory, "quality.just"), "shared={{ variables.owner }}\n");
    await writeFile(join(moduleDirectory, "quality-python.just"), "python\n");
    await writeFile(join(moduleDirectory, "quality-typescript.just"), "typescript\n");

    const result = runCli(
      project,
      [
        "init",
        "--stack",
        "typescript",
        "--stack",
        "python",
        "--var",
        "owner=team",
        "--no-interactive",
      ],
      pathWith(justDirectory),
      { SPINDLE_BLUEPRINTS_DIR: blueprints },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      await readFile(join(project, ".github/scripts/just-modules/quality.just"), "utf8"),
      "shared=team\n",
    );
    assert.equal(
      await readFile(join(project, "justfile"), "utf8"),
      [
        "mod quality '.github/scripts/just-modules/quality.just'",
        "mod quality-python '.github/scripts/just-modules/quality-python.just'",
        "mod quality-typescript '.github/scripts/just-modules/quality-typescript.just'",
        "",
      ].join("\n"),
    );
    assert.equal(
      await readFile(join(project, ".github/scripts/just-modules/quality-python.just"), "utf8"),
      "python\n",
    );
    assert.equal(
      await readFile(join(project, ".github/scripts/just-modules/quality-typescript.just"), "utf8"),
      "typescript\n",
    );
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("init replaces generated modules and reconciles managed imports without changing unrelated justfile content", async () => {
  const blueprints = await makeTempDir("spindle-init-just-reconcile-blueprints-");
  const project = await makeTempDir();
  try {
    for (const [name, content] of [
      ["zeta", "new zeta\n"],
      ["alpha", "new alpha\n"],
    ]) {
      const source = join(blueprints, "just", `${name}.just`);
      await mkdir(join(source, ".."), { recursive: true });
      await writeFile(source, content);
    }

    const moduleOutput = join(project, ".github/scripts/just-modules");
    await mkdir(moduleOutput, { recursive: true });
    await writeFile(join(moduleOutput, "zeta.just"), "stale zeta\n");
    await writeFile(join(moduleOutput, "obsolete.just"), "obsolete\n");
    const rootJustfile = [
      "# User-owned header",
      "mod local '.github/other.just'",
      "",
      "# Keep this recipe",
      "ready:",
      "  @echo ready",
      "mod zeta '.github/scripts/just-modules/zeta.just'",
      "mod alpha '.github/scripts/just-modules/alpha.just'",
      "mod zeta '.github/scripts/just-modules/zeta.just'",
      "",
    ].join("\r\n");
    await writeFile(join(project, "justfile"), rootJustfile);

    const result = runCli(
      project,
      ["init", "--stack", "python", "--no-interactive"],
      pathWith(justDirectory),
      { SPINDLE_BLUEPRINTS_DIR: blueprints },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.equal(await readFile(join(moduleOutput, "zeta.just"), "utf8"), "new zeta\n");
    assert.equal(await readFile(join(moduleOutput, "alpha.just"), "utf8"), "new alpha\n");
    assert.equal(await readFile(join(moduleOutput, "obsolete.just"), "utf8"), "obsolete\n");
    assert.equal(
      await readFile(join(project, "justfile"), "utf8"),
      [
        "# User-owned header",
        "mod local '.github/other.just'",
        "",
        "# Keep this recipe",
        "ready:",
        "  @echo ready",
        "",
        "mod alpha '.github/scripts/just-modules/alpha.just'",
        "mod zeta '.github/scripts/just-modules/zeta.just'",
        "",
      ].join("\r\n"),
    );
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("init reports Just Module import conflicts before replacing generated files", async () => {
  const blueprints = await makeTempDir("spindle-init-just-conflict-blueprints-");
  const project = await makeTempDir();
  try {
    const source = join(blueprints, "just", "quality.just");
    await mkdir(join(source, ".."), { recursive: true });
    await writeFile(source, "new generated content\n");
    const moduleOutput = join(project, ".github/scripts/just-modules");
    await mkdir(moduleOutput, { recursive: true });
    await writeFile(join(moduleOutput, "quality.just"), "keep existing generated content\n");
    const justfile = "mod quality '.github/custom/quality.just'\n";
    await writeFile(join(project, "justfile"), justfile);

    const result = runCli(
      project,
      ["init", "--stack", "python", "--no-interactive"],
      pathWith(justDirectory),
      { SPINDLE_BLUEPRINTS_DIR: blueprints },
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Just Module import conflict.*quality/i);
    assert.equal(
      await readFile(join(moduleOutput, "quality.just"), "utf8"),
      "keep existing generated content\n",
    );
    assert.equal(await readFile(join(project, "justfile"), "utf8"), justfile);
    await assert.rejects(readFile(join(project, ".github/spindle.json")));
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("init rejects invalid Just Module names without creating managed files", async () => {
  const blueprints = await makeTempDir("spindle-init-just-invalid-name-blueprints-");
  const project = await makeTempDir();
  try {
    const source = join(blueprints, "just", "not.valid.just");
    await mkdir(join(source, ".."), { recursive: true });
    await writeFile(source, "invalid module\n");

    const result = runCli(
      project,
      ["init", "--stack", "python", "--no-interactive"],
      pathWith(justDirectory),
      { SPINDLE_BLUEPRINTS_DIR: blueprints },
    );

    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /Blueprint Catalog Just Module path 'just\.not\.valid\.just' must be a root-level \.just file with a valid Just module identifier/,
    );
    await assert.rejects(readFile(join(project, ".github/scripts/just-modules/not.valid.just")));
    await assert.rejects(readFile(join(project, "justfile")));
    await assert.rejects(readFile(join(project, ".github/spindle.json")));
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("init reports missing template Variables before changing managed module files", async () => {
  const blueprints = await makeTempDir("spindle-init-just-missing-variable-blueprints-");
  const project = await makeTempDir();
  try {
    const validSource = join(blueprints, "just", "alpha.just");
    const invalidSource = join(blueprints, "just", "zeta.just");
    await mkdir(join(validSource, ".."), { recursive: true });
    await writeFile(validSource, "new generated content\n");
    await writeFile(invalidSource, "{{ variables.missing_value }}\n");
    const moduleOutput = join(project, ".github/scripts/just-modules");
    await mkdir(moduleOutput, { recursive: true });
    await writeFile(join(moduleOutput, "alpha.just"), "keep existing alpha\n");
    await writeFile(join(moduleOutput, "zeta.just"), "keep existing zeta\n");
    await writeFile(join(moduleOutput, "obsolete.just"), "keep obsolete module\n");
    const justfile = "default:\n  @echo keep\n";
    await writeFile(join(project, "justfile"), justfile);

    const result = runCli(
      project,
      ["init", "--stack", "python", "--no-interactive"],
      pathWith(justDirectory),
      { SPINDLE_BLUEPRINTS_DIR: blueprints },
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /missing_value|undefined|null/i);
    assert.equal(await readFile(join(moduleOutput, "alpha.just"), "utf8"), "keep existing alpha\n");
    assert.equal(await readFile(join(moduleOutput, "zeta.just"), "utf8"), "keep existing zeta\n");
    assert.equal(
      await readFile(join(moduleOutput, "obsolete.just"), "utf8"),
      "keep obsolete module\n",
    );
    assert.equal(await readFile(join(project, "justfile"), "utf8"), justfile);
    await assert.rejects(readFile(join(project, ".github/spindle.json")));
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("init reports staging failures without changing generated modules or the root justfile", async () => {
  const blueprints = await makeTempDir("spindle-init-just-staging-blueprints-");
  const project = await makeTempDir();
  const installed = join(project, ".github/scripts/just-modules");
  const justfile = "ready:\n  @echo keep\n";
  try {
    for (const [name, content] of [
      ["alpha", "new alpha\n"],
      ["beta", "new beta\n"],
    ]) {
      const source = join(blueprints, "just", `${name}.just`);
      await mkdir(join(source, ".."), { recursive: true });
      await writeFile(source, content);
    }
    await mkdir(installed, { recursive: true });
    await writeFile(join(installed, "alpha.just"), "old alpha\n");
    await writeFile(join(installed, "beta.just"), "old beta\n");
    await writeFile(join(installed, "obsolete.just"), "obsolete\n");
    await writeFile(join(project, "justfile"), justfile);

    await chmod(project, 0o555);
    let result: ReturnType<typeof runCli>;
    try {
      result = runCli(
        project,
        ["init", "--stack", "python", "--no-interactive"],
        pathWith(justDirectory),
        { SPINDLE_BLUEPRINTS_DIR: blueprints },
      );
    } finally {
      await chmod(project, 0o755);
    }

    assert.notEqual(result.status, 0, result.stderr);
    assert.match(result.stderr, /Failed to stage Just Module changes/i);
    assert.equal(await readFile(join(installed, "alpha.just"), "utf8"), "old alpha\n");
    assert.equal(await readFile(join(installed, "beta.just"), "utf8"), "old beta\n");
    assert.equal(await readFile(join(installed, "obsolete.just"), "utf8"), "obsolete\n");
    assert.equal(await readFile(join(project, "justfile"), "utf8"), justfile);
    await assert.rejects(readFile(join(project, ".github/spindle.json")));
  } finally {
    await chmod(project, 0o755);
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test(
  "init refuses unsafe Just Module filesystem targets without following or replacing them",
  { skip: process.platform === "win32" },
  async () => {
    const cases = [
      "root justfile symlink",
      "root justfile directory",
      "module directory symlink",
      "module directory file",
      "generated module symlink",
      "generated module directory",
    ] as const;

    for (const unsafeTarget of cases) {
      const blueprints = await makeTempDir("spindle-init-just-unsafe-blueprints-");
      const project = await makeTempDir();
      const outside = await makeTempDir("spindle-init-just-unsafe-outside-");
      const modules = join(project, ".github/scripts/just-modules");
      const rootJustfile = join(project, "justfile");
      const rootContent = "ready:\n  @echo keep\n";
      try {
        const source = join(blueprints, "just", "quality.just");
        await mkdir(join(source, ".."), { recursive: true });
        await writeFile(source, "new generated content\n");
        await mkdir(join(project, ".github/scripts"), { recursive: true });

        if (
          unsafeTarget !== "root justfile symlink" &&
          unsafeTarget !== "root justfile directory"
        ) {
          await writeFile(rootJustfile, rootContent);
        }
        if (
          unsafeTarget !== "module directory symlink" &&
          unsafeTarget !== "module directory file"
        ) {
          await mkdir(modules, { recursive: true });
        }
        if (
          unsafeTarget !== "generated module symlink" &&
          unsafeTarget !== "generated module directory" &&
          unsafeTarget !== "module directory symlink" &&
          unsafeTarget !== "module directory file"
        ) {
          await writeFile(join(modules, "quality.just"), "old generated content\n");
        }

        switch (unsafeTarget) {
          case "root justfile symlink":
            await writeFile(join(outside, "justfile"), rootContent);
            await symlink(join(outside, "justfile"), rootJustfile);
            break;
          case "root justfile directory":
            await mkdir(rootJustfile);
            await writeFile(join(rootJustfile, "sentinel"), "keep\n");
            break;
          case "module directory symlink":
            await mkdir(outside, { recursive: true });
            await writeFile(join(outside, "sentinel"), "keep\n");
            await symlink(outside, modules, "dir");
            break;
          case "module directory file":
            await writeFile(modules, "keep module directory path\n");
            break;
          case "generated module symlink":
            await writeFile(join(outside, "module.just"), "keep external target\n");
            await symlink(join(outside, "module.just"), join(modules, "quality.just"));
            break;
          case "generated module directory":
            await mkdir(join(modules, "quality.just"));
            await writeFile(join(modules, "quality.just", "sentinel"), "keep\n");
            break;
        }

        const result = runCli(
          project,
          ["init", "--stack", "python", "--no-interactive"],
          pathWith(justDirectory),
          { SPINDLE_BLUEPRINTS_DIR: blueprints },
        );
        assert.notEqual(result.status, 0, `${unsafeTarget}: ${result.stderr}`);
        assert.match(result.stderr, /Refusing to (?:replace|use)/i);

        switch (unsafeTarget) {
          case "root justfile symlink":
            assert.equal((await lstat(rootJustfile)).isSymbolicLink(), true);
            assert.equal(await readFile(join(outside, "justfile"), "utf8"), rootContent);
            assert.equal(
              await readFile(join(modules, "quality.just"), "utf8"),
              "old generated content\n",
            );
            break;
          case "root justfile directory":
            assert.equal(await readFile(join(rootJustfile, "sentinel"), "utf8"), "keep\n");
            assert.equal(
              await readFile(join(modules, "quality.just"), "utf8"),
              "old generated content\n",
            );
            break;
          case "module directory symlink":
            assert.equal((await lstat(modules)).isSymbolicLink(), true);
            assert.equal(await readFile(join(outside, "sentinel"), "utf8"), "keep\n");
            assert.equal(await readFile(rootJustfile, "utf8"), rootContent);
            break;
          case "module directory file":
            assert.equal(await readFile(modules, "utf8"), "keep module directory path\n");
            assert.equal(await readFile(rootJustfile, "utf8"), rootContent);
            break;
          case "generated module symlink":
            assert.equal((await lstat(join(modules, "quality.just"))).isSymbolicLink(), true);
            assert.equal(
              await readFile(join(outside, "module.just"), "utf8"),
              "keep external target\n",
            );
            assert.equal(await readFile(rootJustfile, "utf8"), rootContent);
            break;
          case "generated module directory":
            assert.equal(
              await readFile(join(modules, "quality.just", "sentinel"), "utf8"),
              "keep\n",
            );
            assert.equal(await readFile(rootJustfile, "utf8"), rootContent);
            break;
        }
      } finally {
        await rm(blueprints, { recursive: true, force: true });
        await rm(project, { recursive: true, force: true });
        await rm(outside, { recursive: true, force: true });
      }
    }
  },
);

test(
  "init uses an interactively prompted Variable when rendering Just Modules",
  { skip: process.platform !== "linux" },
  async () => {
    const blueprints = await makeTempDir("spindle-init-just-prompt-blueprints-");
    const project = await makeTempDir();
    try {
      const source = join(blueprints, "just", "quality.just");
      await mkdir(join(source, ".."), { recursive: true });
      await writeFile(source, "owner={{ variables.owner }}\n");

      const result = await runCliInteractive(
        project,
        ["init", "--stack", "python"],
        pathWith(justDirectory),
        [
          { trigger: "lint_command: Lint command", input: "\r" },
          { trigger: "owner: Team owner", input: "\u0015interactive-team\r" },
        ],
        { SPINDLE_BLUEPRINTS_DIR: blueprints },
      );

      assert.equal(result.status, 0, result.stderr);
      assert.equal(
        await readFile(join(project, ".github/scripts/just-modules/quality.just"), "utf8"),
        "owner=interactive-team\n",
      );
      assert.deepEqual(JSON.parse(await readFile(join(project, ".github/spindle.json"), "utf8")), {
        stacks: ["python"],
        variables: { lint_command: "just lint", owner: "interactive-team" },
      });
    } finally {
      await rm(blueprints, { recursive: true, force: true });
      await rm(project, { recursive: true, force: true });
    }
  },
);

test("init installs the repository's shipped Just Module Blueprints with required imports", async () => {
  const project = await makeTempDir("spindle-init-shipped-just-");
  try {
    const result = runCli(
      project,
      ["init", "--stack", "python", "--no-interactive"],
      pathWith(justDirectory),
    );

    assert.equal(result.status, 0, result.stderr);
    const moduleDirectory = join(project, ".github/scripts/just-modules");
    assert.deepEqual(await readdir(moduleDirectory), [
      "format.just",
      "lint.just",
      "test.just",
      "tool.just",
    ]);
    assert.match(await readFile(join(moduleDirectory, "format.just"), "utf8"), /pnpm fmt/);
    assert.match(await readFile(join(moduleDirectory, "lint.just"), "utf8"), /pnpm lint:fix/);
    assert.match(await readFile(join(moduleDirectory, "test.just"), "utf8"), /pnpm test/);
    assert.match(await readFile(join(moduleDirectory, "tool.just"), "utf8"), /git-detailed-diff/);
    assert.equal(
      await readFile(join(project, "justfile"), "utf8"),
      [
        "mod format '.github/scripts/just-modules/format.just'",
        "mod lint '.github/scripts/just-modules/lint.just'",
        "mod test '.github/scripts/just-modules/test.just'",
        "mod tool '.github/scripts/just-modules/tool.just'",
        "",
      ].join("\n"),
    );
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("init renders nested Markdown with shared Variables and selected Stack values", async () => {
  const blueprints = await makeTempDir("spindle-init-rendering-blueprints-");
  const project = await makeTempDir();
  const skillDirectory = join(blueprints, "skills", "demo");
  const binaryAsset = Buffer.from([0x00, 0x7f, 0xff, 0x42]);
  try {
    await mkdir(join(skillDirectory, "guidance", "nested"), { recursive: true });
    await writeFile(
      join(skillDirectory, "SKILL.md"),
      [
        "---",
        "name: demo",
        "meta:",
        "  spindle:",
        "    version: 1.0.0",
        'description: "{{ variables.owner }}"',
        "---",
        "",
        "{% if 'python' in stacks %}Python guidance{% endif %}",
        "",
      ].join("\n"),
    );
    await writeFile(
      join(skillDirectory, "guidance", "nested", "python.md"),
      "Owner={{ variables.owner }}{% if 'python' in stacks %}; stack=python{% endif %}\n",
    );
    await writeFile(join(skillDirectory, "assets.bin"), binaryAsset);

    const result = runCli(
      project,
      ["init", "--stack", "python", "--var", "owner=team"],
      pathWith(justDirectory),
      { SPINDLE_BLUEPRINTS_DIR: blueprints },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(await readFile(join(project, ".github/spindle.json"), "utf8")), {
      stacks: ["python"],
      variables: { lint_command: "just lint", owner: "team" },
    });
    assert.equal(
      await readFile(join(project, ".github/skills/demo/SKILL.md"), "utf8"),
      '---\nname: demo\nmeta:\n  spindle:\n    version: 1.0.0\ndescription: "team"\n---\n\nPython guidance\n',
    );
    assert.equal(
      await readFile(join(project, ".github/skills/demo/guidance/nested/python.md"), "utf8"),
      "Owner=team; stack=python\n",
    );
    assert.deepEqual(await readFile(join(project, ".github/skills/demo/assets.bin")), binaryAsset);
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("init skip policy leaves existing Skills untouched and still writes Config", async () => {
  const { project: projectRoot, result: initialResult } = await runInit(["--stack", "python"]);
  try {
    assert.equal(initialResult.status, 0, initialResult.stderr);
    await writeFile(join(projectRoot, ".github/skills/demo/SKILL.md"), "preserve this");
    const configPath = join(projectRoot, ".github/spindle.json");
    await rm(configPath);

    const project = await runCli(
      projectRoot,
      ["init", "--stack", "typescript", "--on-conflict", "skip"],
      pathWith(justDirectory),
      { SPINDLE_BLUEPRINTS_DIR: stubsDirectory },
    );

    assert.equal(project.status, 0, project.stderr);
    assert.equal(
      project.stdout,
      "✔ Installed 0 skill(s) for typescript. Skipped 1 existing skill(s)\n",
    );
    assert.equal(
      await readFile(join(projectRoot, ".github/skills/demo/SKILL.md"), "utf8"),
      "preserve this",
    );
    assert.deepEqual(JSON.parse(await readFile(configPath, "utf8")), {
      stacks: ["typescript"],
      variables: fixtureVariables,
    });
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("init overwrite policy removes files that are no longer in the Stub", async () => {
  const { project, result: initialResult } = await runInit(["--stack", "python"]);
  try {
    assert.equal(initialResult.status, 0, initialResult.stderr);
    const stalePath = join(project, ".github/skills/demo/stale.txt");
    await writeFile(stalePath, "remove me");
    await rm(join(project, ".github/spindle.json"));

    const result = runCli(
      project,
      ["init", "--stack", "python", "--on-conflict", "overwrite"],
      pathWith(justDirectory),
      { SPINDLE_BLUEPRINTS_DIR: stubsDirectory },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Installed 1 skill\(s\) for python/);
    await assert.rejects(readFile(stalePath));
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("init fails clearly and writes nothing when no stack is selected", async () => {
  const { project, result } = await runInit([]);

  try {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /at least one --stack/i);
    await assert.rejects(readFile(join(project, ".github/spindle.json")));
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("init rejects unsupported stack ids with a clear error", async () => {
  const { project, result } = await runInit(["--stack", "ruby"]);

  try {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /invalid stack.*ruby|unsupported stack.*ruby/i);
    await assert.rejects(readFile(join(project, ".github/spindle.json")));
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test(
  "init refuses a symlinked .github directory without writing through it",
  { skip: process.platform === "win32" },
  async () => {
    const project = await makeTempDir();
    const outside = join(project, "outside");
    try {
      await mkdir(outside);
      await writeFile(join(outside, "sentinel"), "keep");
      await symlink(outside, join(project, ".github"), "dir");
      const result = runCli(
        project,
        ["init", "--stack", "python", "--on-conflict", "overwrite"],
        pathWith(justDirectory),
        {
          SPINDLE_BLUEPRINTS_DIR: stubsDirectory,
        },
      );

      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /\.github.*symbolic link|symbolic link.*\.github/i);
      assert.equal(await readFile(join(outside, "sentinel"), "utf8"), "keep");
      await assert.rejects(readFile(join(outside, "spindle.json")));
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  },
);

test(
  "init refuses a symlinked skills directory without writing through it",
  { skip: process.platform === "win32" },
  async () => {
    const project = await makeTempDir();
    const outside = join(project, "outside");
    try {
      await mkdir(join(project, ".github"));
      await mkdir(outside);
      await writeFile(join(outside, "sentinel"), "keep");
      await symlink(outside, join(project, ".github", "skills"), "dir");
      const result = runCli(
        project,
        ["init", "--stack", "python", "--on-conflict", "overwrite"],
        pathWith(justDirectory),
        {
          SPINDLE_BLUEPRINTS_DIR: stubsDirectory,
        },
      );

      assert.notEqual(result.status, 0);
      assert.match(
        result.stderr,
        /\.github[\\/]skills.*symbolic link|symbolic link.*\.github[\\/]skills/i,
      );
      assert.equal(await readFile(join(outside, "sentinel"), "utf8"), "keep");
      await assert.rejects(readFile(join(project, ".github", "spindle.json")));
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  },
);

test(
  "init refuses a symlinked existing skill before overwrite",
  { skip: process.platform === "win32" },
  async () => {
    const project = await makeTempDir();
    const outside = join(project, "outside");
    try {
      await mkdir(join(project, ".github", "skills"), { recursive: true });
      await mkdir(outside);
      await writeFile(join(outside, "sentinel"), "keep");
      await symlink(outside, join(project, ".github", "skills", "demo"), "dir");
      const result = runCli(
        project,
        ["init", "--stack", "python", "--on-conflict", "overwrite"],
        pathWith(justDirectory),
        {
          SPINDLE_BLUEPRINTS_DIR: stubsDirectory,
        },
      );

      assert.notEqual(result.status, 0);
      assert.match(
        result.stderr,
        /\.github[\\/]skills[\\/]demo.*symbolic link|symbolic link.*\.github[\\/]skills[\\/]demo/i,
      );
      assert.equal(await readFile(join(outside, "sentinel"), "utf8"), "keep");
      await assert.rejects(readFile(join(project, ".github", "spindle.json")));
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  },
);
