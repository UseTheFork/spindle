import assert from "node:assert/strict";
import { mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { Chalk } from "chalk";

import { makeJustStubDir, makeTempDir, pathWith, runCli } from "./helpers.ts";

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

test("init combines shared files and all selected Stack overlays only", async () => {
  const blueprints = await makeTempDir("spindle-init-overlay-blueprints-");
  const project = await makeTempDir();
  const skillDirectory = join(blueprints, "skills", "demo");
  try {
    await mkdir(join(skillDirectory, "stacks", "python"), { recursive: true });
    await mkdir(join(skillDirectory, "stacks", "python", "guidance"), { recursive: true });
    await mkdir(join(skillDirectory, "stacks", "typescript"), { recursive: true });
    await mkdir(join(skillDirectory, "stacks", "php-laravel"), { recursive: true });
    await writeFile(
      join(skillDirectory, "SKILL.md"),
      "---\nname: demo\nmeta:\n  spindle:\n    version: 1.0.0\n---\n# shared\n",
    );
    await writeFile(join(skillDirectory, "shared.txt"), "shared content\n");
    await writeFile(join(skillDirectory, "stacks", "python", "python.txt"), "python content\n");
    await writeFile(
      join(skillDirectory, "stacks", "python", "guidance", "python.md"),
      "nested python content\n",
    );
    await writeFile(
      join(skillDirectory, "stacks", "typescript", "typescript.txt"),
      "typescript content\n",
    );
    await writeFile(join(skillDirectory, "stacks", "php-laravel", "php.txt"), "php content\n");

    const result = runCli(
      project,
      ["init", "--stack", "python", "--stack", "typescript"],
      pathWith(justDirectory),
      { SPINDLE_BLUEPRINTS_DIR: blueprints },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      await readFile(join(project, ".github/skills/demo/shared.txt"), "utf8"),
      "shared content\n",
    );
    assert.equal(
      await readFile(join(project, ".github/skills/demo/python.txt"), "utf8"),
      "python content\n",
    );
    assert.equal(
      await readFile(join(project, ".github/skills/demo/guidance/python.md"), "utf8"),
      "nested python content\n",
    );
    assert.equal(
      await readFile(join(project, ".github/skills/demo/typescript.txt"), "utf8"),
      "typescript content\n",
    );
    await assert.rejects(readFile(join(project, ".github/skills/demo/php.txt")));
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("init rejects a shared file colliding with a selected Stack overlay before writing", async () => {
  const blueprints = await makeTempDir("spindle-init-collision-blueprints-");
  const project = await makeTempDir();
  const skillDirectory = join(blueprints, "skills", "demo");
  try {
    await mkdir(join(skillDirectory, "stacks", "python"), { recursive: true });
    await writeFile(
      join(skillDirectory, "SKILL.md"),
      "---\nname: demo\nmeta:\n  spindle:\n    version: 1.0.0\n---\n# shared\n",
    );
    await writeFile(join(skillDirectory, "guide.md"), "shared guide\n");
    await writeFile(join(skillDirectory, "stacks", "python", "guide.md"), "python guide\n");

    const result = runCli(project, ["init", "--stack", "python"], pathWith(justDirectory), {
      SPINDLE_BLUEPRINTS_DIR: blueprints,
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /duplicate blueprint output path 'guide\.md'/i);
    assert.match(result.stderr, /guide\.md.*stacks[\\/]python[\\/]guide\.md/i);
    await assert.rejects(readFile(join(project, ".github/skills/demo/guide.md")));
    await assert.rejects(readFile(join(project, ".github/spindle.json")));
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
