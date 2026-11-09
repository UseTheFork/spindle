import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterAll, beforeAll, test, expect, vi } from "vitest";

vi.setConfig({ testTimeout: 30_000 });

import { Chalk } from "chalk";

import {
  makeTempDir,
  runCliWithFixtureCatalog as runCli,
  runCliWithFixtureCatalogRaw as runCliRaw,
  runCliInteractiveWithFixtureCatalog as runCliInteractive,
} from "../../helpers.ts";

let stubsDirectory: string;
const fixtureVariables = {
  lint_command: "just lint",
  owner: "nobody",
};

beforeAll(async () => {
  stubsDirectory = await makeTempDir("spindle-init-stubs-");
  await mkdir(join(stubsDirectory, "skills", "demo"), { recursive: true });
  await writeFile(
    join(stubsDirectory, "skills", "demo", "SKILL.md"),
    "---\nname: demo\nmetadata:\n  spindle:\n    version: 1.0.0\n---\n\n# Demo\n",
  );
});

afterAll(async () => {
  await rm(stubsDirectory, { recursive: true, force: true });
});

async function runInit(args: string[], env: Record<string, string> = {}) {
  const project = await makeTempDir();
  try {
    return {
      project,
      result: runCli(project, ["init", ...args], process.env.PATH ?? "", {
        SPINDLE_TEST_BLUEPRINTS_DIR: stubsDirectory,
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
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("✔ Installed 1 skill(s) for python\n");
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("init help uses Commander conventions without starting the workflow", async () => {
  const { project, result } = await runInit(["-h"]);

  try {
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/Usage: spindle init \[options\]/);
    expect(result.stdout).toMatch(/-h, --help/);
    expect(result.stdout).toMatch(/--stack <id>/);
    expect(result.stdout).not.toMatch(/Installed/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("init help and invalid-option errors are available outside a Git working tree", async () => {
  const project = await mkdtemp(join(process.cwd(), "spindle-init-outside-git-"));

  try {
    const help = runCliRaw(project, ["init", "--help"], process.env.PATH ?? "", {
      SPINDLE_TEST_BLUEPRINTS_DIR: stubsDirectory,
    });
    expect(help.status, help.stderr).toBe(0);
    expect(help.stdout).toMatch(/Usage: spindle init \[options\]/);

    const invalid = runCliRaw(project, ["init", "--include-new"], process.env.PATH ?? "", {
      SPINDLE_TEST_BLUEPRINTS_DIR: stubsDirectory,
    });
    expect(invalid.status).not.toBe(0);
    expect(invalid.stderr).toMatch(/unknown option.*include-new/i);
    expect(invalid.stderr).not.toMatch(/Git working-tree root/i);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("init reports semantic argument errors before Git discovery outside a working tree", async () => {
  const project = await mkdtemp(join(process.cwd(), "spindle-init-semantic-errors-"));
  const cases = [
    { args: ["--stack", "cobol"], error: /Invalid stack 'cobol'/ },
    { args: ["--stack", "python", "--var", "owner"], error: /Invalid --var 'owner'/ },
    {
      args: ["--stack", "python", "--var", "unknown=value"],
      error: /Unknown variable 'unknown'/,
    },
    { args: ["--no-interactive"], error: /Provide at least one --stack flag/ },
  ];

  try {
    for (const { args, error } of cases) {
      const result = runCliRaw(project, ["init", ...args], "", {
        SPINDLE_TEST_BLUEPRINTS_DIR: stubsDirectory,
      });

      expect(result.status, `Expected rejection for ${args.join(" ")}`).not.toBe(0);
      expect(result.stderr, `Unexpected error for ${args.join(" ")}`).toMatch(error);
      expect(result.stderr).not.toMatch(/Git working-tree root/i);
      expect(await readdir(project), "Invalid arguments must not create project files").toEqual([]);
    }
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("init rejects inapplicable options, missing values, invalid policies, and positionals", async () => {
  const cases = [
    { args: ["--include-new", "--stack", "python"], error: /unknown option.*include-new/i },
    { args: ["--stack"], error: /argument.*missing/i },
    { args: ["--var"], error: /argument.*missing/i },
    { args: ["--stack", "python", "--on-conflict", "merge"], error: /allowed choices/i },
    { args: ["--stack", "python", "extra"], error: /too many arguments/i },
  ];

  for (const { args, error } of cases) {
    const { project, result } = await runInit(args);

    try {
      expect(result.status, `Expected rejection for ${args.join(" ")}`).not.toBe(0);
      expect(result.stderr, `Unexpected error for ${args.join(" ")}`).toMatch(error);
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  }
});

test("init colors success output with chalk when colors are forced", async () => {
  const { project, result } = await runInit(["--stack", "python"], { FORCE_COLOR: "1" });

  try {
    expect(result.status, result.stderr).toBe(0);
    const forced = new Chalk({ level: 1 });
    expect(result.stdout).toBe(
      `${forced.green("✔")} Installed 1 skill(s) for ${forced.cyan("python")}\n`,
    );
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("init colors errors red with chalk when colors are forced", async () => {
  const { project, result } = await runInit([], { FORCE_COLOR: "1" });

  try {
    expect(result.status).not.toBe(0);
    const forced = new Chalk({ level: 1 });
    expect(result.stderr.startsWith(`${forced.red.bold("spindle:")} `), result.stderr).toBe(true);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("init installs its configured skill and records repeatable stack flags", async () => {
  const { project, result } = await runInit(["--stack", "php-laravel", "--stack", "typescript"]);

  try {
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(await readFile(join(project, ".github/spindle.json"), "utf8"))).toEqual({
      stacks: ["php-laravel", "typescript"],
      variables: fixtureVariables,
    });
    const skill = await readFile(join(project, ".github/skills/demo/SKILL.md"), "utf8");
    expect(skill).toMatch(/^---\nname: demo\nmetadata:\n  spindle:\n    version: \d+\.\d+\.\d+\n/m);
    expect(skill).toMatch(/# Demo/);
    expect(await readdir(join(project, ".github/skills"))).toEqual(["demo"]);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("init applies repeated Variable flags in command-line order", async () => {
  const { project, result } = await runInit([
    "--stack",
    "python",
    "--var",
    "owner=first",
    "--var",
    "owner=second",
  ]);

  try {
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(await readFile(join(project, ".github/spindle.json"), "utf8"))).toEqual({
      stacks: ["python"],
      variables: { lint_command: "just lint", owner: "second" },
    });
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test(
  "interactive init prompts before overwriting an existing Blueprint",
  { skip: process.platform !== "linux" },
  async () => {
    const project = await makeTempDir();
    const skillPath = join(project, ".github", "skills", "demo", "SKILL.md");

    try {
      await mkdir(join(project, ".github", "skills", "demo"), { recursive: true });
      await writeFile(skillPath, "existing Skill\n");

      const result = await runCliInteractive(
        project,
        ["init", "--stack", "python", "--var", "lint_command=just lint", "--var", "owner=nobody"],
        process.env.PATH ?? "",
        [{ trigger: "What should happen?", input: "\r" }],
        { SPINDLE_TEST_BLUEPRINTS_DIR: stubsDirectory },
      );

      expect(result.status, result.stdout).toBe(0);
      expect(result.stdout).toMatch(/Skill 'demo'.*What should happen\?/);
      expect(await readFile(skillPath, "utf8")).toMatch(/# Demo/);
      expect(await readFile(join(project, ".github", "spindle.json"), "utf8")).toMatch(
        /"stacks":\s*\[\s*"python"\s*\]/,
      );
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  },
);

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
        "metadata:",
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
      process.env.PATH ?? "",
      { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(await readFile(join(project, ".github/spindle.json"), "utf8"))).toEqual({
      stacks: ["python"],
      variables: { lint_command: "just lint", owner: "team" },
    });
    expect(await readFile(join(project, ".github/skills/demo/SKILL.md"), "utf8")).toBe(
      '---\nname: demo\nmetadata:\n  spindle:\n    version: 1.0.0\ndescription: "team"\n---\n\nPython guidance\n',
    );
    expect(
      await readFile(join(project, ".github/skills/demo/guidance/nested/python.md"), "utf8"),
    ).toBe("Owner=team; stack=python\n");
    expect(await readFile(join(project, ".github/skills/demo/assets.bin"))).toEqual(binaryAsset);
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("init skip policy leaves existing Skills untouched and still writes Config", async () => {
  const { project: projectRoot, result: initialResult } = await runInit(["--stack", "python"]);
  try {
    expect(initialResult.status, initialResult.stderr).toBe(0);
    await writeFile(join(projectRoot, ".github/skills/demo/SKILL.md"), "preserve this");
    const configPath = join(projectRoot, ".github/spindle.json");
    await rm(configPath);

    const project = await runCli(
      projectRoot,
      ["init", "--stack", "typescript", "--on-conflict", "skip"],
      process.env.PATH ?? "",
      { SPINDLE_TEST_BLUEPRINTS_DIR: stubsDirectory },
    );

    expect(project.status, project.stderr).toBe(0);
    expect(project.stdout).toBe(
      "✔ Installed 0 skill(s) for typescript. Skipped 1 existing skill(s)\n",
    );
    expect(await readFile(join(projectRoot, ".github/skills/demo/SKILL.md"), "utf8")).toBe(
      "preserve this",
    );
    expect(JSON.parse(await readFile(configPath, "utf8"))).toEqual({
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
    expect(initialResult.status, initialResult.stderr).toBe(0);
    const stalePath = join(project, ".github/skills/demo/stale.txt");
    await writeFile(stalePath, "remove me");
    await rm(join(project, ".github/spindle.json"));

    const result = runCli(
      project,
      ["init", "--stack", "python", "--on-conflict", "overwrite"],
      process.env.PATH ?? "",
      { SPINDLE_TEST_BLUEPRINTS_DIR: stubsDirectory },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/Installed 1 skill\(s\) for python/);
    await expect(readFile(stalePath)).rejects.toThrow();
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("init fails clearly and writes nothing when no stack is selected", async () => {
  const { project, result } = await runInit([]);

  try {
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/at least one --stack/i);
    await expect(readFile(join(project, ".github/spindle.json"))).rejects.toThrow();
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("init rejects unsupported stack ids with a clear error", async () => {
  const { project, result } = await runInit(["--stack", "ruby"]);

  try {
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/invalid stack.*ruby|unsupported stack.*ruby/i);
    await expect(readFile(join(project, ".github/spindle.json"))).rejects.toThrow();
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
        process.env.PATH ?? "",
        {
          SPINDLE_TEST_BLUEPRINTS_DIR: stubsDirectory,
        },
      );

      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/\.github.*symbolic link|symbolic link.*\.github/i);
      expect(await readFile(join(outside, "sentinel"), "utf8")).toBe("keep");
      await expect(readFile(join(outside, "spindle.json"))).rejects.toThrow();
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
        process.env.PATH ?? "",
        {
          SPINDLE_TEST_BLUEPRINTS_DIR: stubsDirectory,
        },
      );

      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(
        /\.github[\\/]skills.*symbolic link|symbolic link.*\.github[\\/]skills/i,
      );
      expect(await readFile(join(outside, "sentinel"), "utf8")).toBe("keep");
      await expect(readFile(join(project, ".github", "spindle.json"))).rejects.toThrow();
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
        process.env.PATH ?? "",
        {
          SPINDLE_TEST_BLUEPRINTS_DIR: stubsDirectory,
        },
      );

      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(
        /\.github[\\/]skills[\\/]demo.*symbolic link|symbolic link.*\.github[\\/]skills[\\/]demo/i,
      );
      expect(await readFile(join(outside, "sentinel"), "utf8")).toBe("keep");
      await expect(readFile(join(project, ".github", "spindle.json"))).rejects.toThrow();
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  },
);
