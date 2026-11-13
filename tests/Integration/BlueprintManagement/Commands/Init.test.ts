import { mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { beforeEach, test, expect, vi } from "vitest";

vi.setConfig({ testTimeout: 30_000 });

import { Chalk } from "chalk";

import {
  runCliWithFixtureCatalog as runCli,
  runCliWithFixtureCatalogRaw as runCliRaw,
  runCliInteractiveWithFixtureCatalog as runCliInteractive,
} from "../../../Helpers/Cli.ts";
import { makeTempDir } from "../../../Helpers/TemporaryDirectories.ts";

let stubsDirectory: string;

beforeEach(async () => {
  stubsDirectory = await makeTempDir("spindle-init-stubs-");
  await mkdir(join(stubsDirectory, "skills", "demo"), { recursive: true });
  await writeFile(
    join(stubsDirectory, "skills", "demo", "SKILL.md"),
    "---\nname: demo\nmetadata:\n  spindle:\n    version: 1.0.0\n---\n\n# Demo\n",
  );
});

async function runInit(args: string[], env: Record<string, string> = {}) {
  const project = await makeTempDir();
  return {
    project,
    result: runCli(project, ["init", ...args], process.env.PATH ?? "", {
      SPINDLE_TEST_BLUEPRINTS_DIR: stubsDirectory,
      ...env,
    }),
  };
}

test("init reports success with a plain message when colors are off", async () => {
  const { result } = await runInit(["--stack", "python"]);

  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toBe(
    "✔ Installed 1 skill(s) for python\n✔ Initialized project guidance and tooling documentation.\n",
  );
});

test("init help uses Commander conventions without starting the workflow", async () => {
  const { result } = await runInit(["-h"]);

  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toMatch(/Usage: spindle init \[options\]/);
  expect(result.stdout).toMatch(/-h, --help/);
  expect(result.stdout).toMatch(/--stack <id>/);
  expect(result.stdout).toMatch(/--spindle-package-manager <command>/);
  expect(result.stdout).not.toMatch(/Installed/);
});

test("init help and invalid-option errors are available outside a Git working tree", async () => {
  const project = await makeTempDir("spindle-init-outside-git-");

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
});

test("init reports semantic argument errors before Git discovery outside a working tree", async () => {
  const project = await makeTempDir("spindle-init-semantic-errors-");
  const cases = [
    { args: ["--stack", "cobol"], error: /Invalid stack 'cobol'/ },
    {
      args: ["--stack", "python", "--var", "owner"],
      error: /unknown option.*var/i,
    },
    {
      args: ["--stack", "python", "--spindle-package-manager", "\n"],
      error: /single-line command/,
    },
    { args: ["--no-interactive"], error: /Provide at least one --stack flag/ },
  ];

  for (const { args, error } of cases) {
    const result = runCliRaw(project, ["init", ...args], "", {
      SPINDLE_TEST_BLUEPRINTS_DIR: stubsDirectory,
    });

    expect(result.status, `Expected rejection for ${args.join(" ")}`).not.toBe(0);
    expect(result.stderr, `Unexpected error for ${args.join(" ")}`).toMatch(error);
    expect(result.stderr).not.toMatch(/Git working-tree root/i);
    expect(await readdir(project), "Invalid arguments must not create project files").toEqual([]);
  }
});

test("init rejects inapplicable options, missing values, invalid policies, and positionals", async () => {
  const cases = [
    { args: ["--include-new", "--stack", "python"], error: /unknown option.*include-new/i },
    { args: ["--stack"], error: /argument.*missing/i },
    { args: ["--var"], error: /unknown option.*var/i },
    { args: ["--stack", "python", "--on-conflict", "merge"], error: /allowed choices/i },
    { args: ["--stack", "python", "extra"], error: /too many arguments/i },
  ];

  for (const { args, error } of cases) {
    const { result } = await runInit(args);

    expect(result.status, `Expected rejection for ${args.join(" ")}`).not.toBe(0);
    expect(result.stderr, `Unexpected error for ${args.join(" ")}`).toMatch(error);
  }
});

test("init colors success output with chalk when colors are forced", async () => {
  const { result } = await runInit(["--stack", "python"], { FORCE_COLOR: "1" });

  expect(result.status, result.stderr).toBe(0);
  const forced = new Chalk({ level: 1 });
  expect(result.stdout).toBe(
    `${forced.green("✔")} Installed 1 skill(s) for python\n${forced.green("✔")} Initialized project guidance and tooling documentation.\n`,
  );
});

test("init colors errors red with chalk when colors are forced", async () => {
  const { result } = await runInit([], { FORCE_COLOR: "1" });

  expect(result.status).not.toBe(0);
  const forced = new Chalk({ level: 1 });
  expect(result.stderr.startsWith(`${forced.red.bold("spindle:")} `), result.stderr).toBe(true);
});

test("init installs its configured skill and records repeatable stack flags", async () => {
  const { project, result } = await runInit(["--stack", "php-laravel", "--stack", "typescript"]);

  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(await readFile(join(project, ".github/spindle.json"), "utf8"))).toMatchObject({
    stacks: ["php-laravel", "typescript"],
    spindle_package_manager: "pnpm",
    tooling: [],
  });
  const skill = await readFile(join(project, ".github/skills/demo/SKILL.md"), "utf8");
  expect(skill).toMatch(/^---\nname: demo\nmetadata:\n  spindle:\n    version: \d+\.\d+\.\d+\n/m);
  expect(skill).toMatch(/# Demo/);
  expect(await readdir(join(project, ".github/skills"))).toEqual(["demo"]);
});

test("init accepts an explicit Spindle package-manager command", async () => {
  const { project, result } = await runInit([
    "--stack",
    "python",
    "--spindle-package-manager",
    "npm run",
  ]);

  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(await readFile(join(project, ".github/spindle.json"), "utf8"))).toMatchObject({
    stacks: ["python"],
    spindle_package_manager: "npm run",
    tooling: expect.any(Array),
  });
});

test("init JSON mode returns typed outcomes without human output or terminal colors", async () => {
  const { result } = await runInit(["--stack", "python", "--json"], { FORCE_COLOR: "1" });
  expect(result.status, result.stderr).toBe(0);
  expect(result.stderr).toBe("");
  expect(JSON.parse(result.stdout)).toEqual({
    ok: true,
    data: {
      stacks: ["python"],
      guidanceInitialized: true,
      outcomes: [{ kind: "Skill", name: "demo", status: "installed" }],
    },
  });
  expect(result.stdout.trim().split("\n")).toHaveLength(1);
});

test("JSON mode reports parser and pre-bootstrap errors as structured stderr", async () => {
  const project = await makeTempDir("spindle-json-errors-");
  for (const args of [
    ["--json"],
    ["sdd", "--json"],
    ["--json", "init", "--unknown"],
    ["init", "--json", "--stack"],
    ["init", "--stack", "cobol", "--json"],
    ["init", "--json", "--no-interactive"],
    ["init", "--json", "--stack", "python", "--spindle-package-manager", "pnpm"],
  ]) {
    const result = runCliRaw(project, args, process.env.PATH ?? "", { FORCE_COLOR: "1" });
    expect(result.status, args.join(" ")).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toEqual({
      ok: false,
      error: { message: expect.any(String) },
    });
  }
});

test(
  "JSON init never prompts even when stdin and stdout are terminals",
  { skip: process.platform !== "linux" },
  async () => {
    const project = await makeTempDir();
    const result = await runCliInteractive(
      project,
      ["init", "--json", "--spindle-package-manager", "pnpm"],
      process.env.PATH ?? "",
      [],
      { SPINDLE_TEST_BLUEPRINTS_DIR: stubsDirectory },
    );
    expect(result.status).not.toBe(0);
    expect(result.stdout).not.toContain("Which stacks");
    expect(result.stdout).toContain('"ok":false');
  },
);

test(
  "interactive init prompts before overwriting an existing Blueprint",
  { skip: process.platform !== "linux" },
  async () => {
    const project = await makeTempDir();
    const skillPath = join(project, ".github", "skills", "demo", "SKILL.md");

    await mkdir(join(project, ".github", "skills", "demo"), { recursive: true });
    await writeFile(skillPath, "existing Skill\n");

    const result = await runCliInteractive(
      project,
      ["init", "--stack", "python", "--spindle-package-manager", "pnpm"],
      process.env.PATH ?? "",
      [
        { trigger: "Allow commit message bodies?", input: "\r" },
        { trigger: "Maximum commit title length", input: "\r" },
        { trigger: "Require commit scopes?", input: "\r" },
        { trigger: "Allow breaking-change notation?", input: "\r" },
        { trigger: "What should happen?", input: "\r" },
      ],
      { SPINDLE_TEST_BLUEPRINTS_DIR: stubsDirectory },
    );

    expect(result.status, result.stdout).toBe(0);
    expect(result.stdout).toMatch(/Skill 'demo'.*What should happen\?/);
    expect(await readFile(skillPath, "utf8")).toMatch(/# Demo/);
    expect(await readFile(join(project, ".github", "spindle.json"), "utf8")).toMatch(
      /"stacks":\s*\[\s*"python"\s*\]/,
    );
  },
);

test("init renders computed package-manager and selected Stack values", async () => {
  const blueprints = await makeTempDir("spindle-init-rendering-blueprints-");
  const project = await makeTempDir();
  const skillDirectory = join(blueprints, "skills", "demo");
  const binaryAsset = Buffer.from([0x00, 0x7f, 0xff, 0x42]);
  await mkdir(join(skillDirectory, "guidance", "nested"), { recursive: true });
  await writeFile(
    join(skillDirectory, "SKILL.md"),
    [
      "---",
      "name: demo",
      "metadata:",
      "  spindle:",
      "    version: 1.0.0",
      'description: "{{ computed.spindle_package_manager }}"',
      "---",
      "",
      "{% if 'python' in stacks %}Python guidance{% endif %}",
      "",
    ].join("\n"),
  );
  await writeFile(
    join(skillDirectory, "guidance", "nested", "python.md"),
    "Command={{ computed.spindle_package_manager }}{% if 'python' in stacks %}; stack=python{% endif %}\n",
  );
  await writeFile(join(skillDirectory, "assets.bin"), binaryAsset);

  const result = runCli(
    project,
    ["init", "--stack", "python", "--spindle-package-manager", "pnpm"],
    process.env.PATH ?? "",
    { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints },
  );

  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(await readFile(join(project, ".github/spindle.json"), "utf8"))).toMatchObject({
    stacks: ["python"],
    spindle_package_manager: "pnpm",
    tooling: expect.any(Array),
  });
  expect(await readFile(join(project, ".github/skills/demo/SKILL.md"), "utf8")).toBe(
    '---\nname: demo\nmetadata:\n  spindle:\n    version: 1.0.0\ndescription: "pnpm"\n---\n\nPython guidance\n',
  );
  expect(
    await readFile(join(project, ".github/skills/demo/guidance/nested/python.md"), "utf8"),
  ).toBe("Command=pnpm; stack=python\n");
  expect(await readFile(join(project, ".github/skills/demo/assets.bin"))).toEqual(binaryAsset);
});

test("init skip policy leaves existing Skills untouched and still writes Project Settings", async () => {
  const { project: projectRoot, result: initialResult } = await runInit(["--stack", "python"]);
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
    "✔ Installed 0 skill(s) for typescript. Skipped 1 existing skill(s)\n✔ Initialized project guidance and tooling documentation.\n",
  );
  expect(await readFile(join(projectRoot, ".github/skills/demo/SKILL.md"), "utf8")).toBe(
    "preserve this",
  );
  expect(JSON.parse(await readFile(configPath, "utf8"))).toMatchObject({
    stacks: ["typescript"],
    spindle_package_manager: "pnpm",
    tooling: expect.any(Array),
  });
});

test("init overwrite policy removes files that are no longer in the Stub", async () => {
  const { project, result: initialResult } = await runInit(["--stack", "python"]);
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
});

test("init fails clearly and writes nothing when no stack is selected", async () => {
  const { project, result } = await runInit([]);

  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/at least one --stack/i);
  await expect(readFile(join(project, ".github/spindle.json"))).rejects.toThrow();
  await expect(readFile(join(project, "docs/agents/domain.md"))).rejects.toThrow();
});

test("init initializes project guidance for configured stacks before directing updates", async () => {
  const { project, result: initial } = await runInit(["--stack", "python"]);
  expect(initial.status, initial.stderr).toBe(0);
  const originalConfig = await readFile(join(project, ".github/spindle.json"), "utf8");
  await rm(join(project, "docs"), { recursive: true });

  const repeated = runCli(
    project,
    ["init", "--stack", "typescript", "--no-interactive"],
    process.env.PATH ?? "",
    { SPINDLE_TEST_BLUEPRINTS_DIR: stubsDirectory },
  );

  expect(repeated.status).not.toBe(0);
  expect(repeated.stderr).toMatch(/already has configured Blueprint stacks.*spindle update/i);
  expect(await readFile(join(project, "docs/agents/domain.md"), "utf8")).not.toBe("");
  expect(await readFile(join(project, ".github/spindle.json"), "utf8")).toBe(originalConfig);
});

test("init rejects unsupported stack ids with a clear error", async () => {
  const { project, result } = await runInit(["--stack", "ruby"]);

  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/invalid stack.*ruby|unsupported stack.*ruby/i);
  await expect(readFile(join(project, ".github/spindle.json"))).rejects.toThrow();
});

test(
  "init refuses a symlinked .github directory without writing through it",
  { skip: process.platform === "win32" },
  async () => {
    const project = await makeTempDir();
    const outside = join(project, "outside");
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
    expect(result.stderr).toMatch(/\.github must be a real directory/i);
    expect(await readFile(join(outside, "sentinel"), "utf8")).toBe("keep");
    await expect(readFile(join(outside, "spindle.json"))).rejects.toThrow();
  },
);

test(
  "init refuses a symlinked skills directory without writing through it",
  { skip: process.platform === "win32" },
  async () => {
    const project = await makeTempDir();
    const outside = join(project, "outside");
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
    await expect(readFile(join(project, "docs/agents/domain.md"))).rejects.toThrow();
  },
);

test(
  "init refuses a symlinked existing skill before overwrite",
  { skip: process.platform === "win32" },
  async () => {
    const project = await makeTempDir();
    const outside = join(project, "outside");
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
  },
);
