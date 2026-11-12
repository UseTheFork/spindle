import { cp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { beforeEach, test, expect, vi } from "vitest";

vi.setConfig({ testTimeout: 30_000 });

import {
  runCliRaw,
  runCliWithFixtureCatalog as runCli,
  runCliInteractiveWithFixtureCatalog as runCliInteractive,
} from "../../../Helpers/Cli.ts";
import { makeTempDir, repoRoot } from "../../../Helpers/TemporaryDirectories.ts";

let stubs: string;

beforeEach(async () => {
  stubs = await makeTempDir("spindle-update-stubs-");
  const stubSkills: Record<string, string> = {
    newer: "2.0.0",
    equal: "1.0.0",
    lower: "1.0.0",
    missing: "1.0.0",
    bad: "1.0.0",
    absent: "1.0.0",
  };
  for (const [name, version] of Object.entries(stubSkills)) {
    await mkdir(join(stubs, "skills", name), { recursive: true });
    await writeFile(
      join(stubs, "skills", name, "SKILL.md"),
      `---\nmetadata:\n  spindle:\n    version: ${version}\n---\nfresh ${name} owner={{ computed.spindle_package_manager }} stacks={% for s in stacks %}{{ s }};{% endfor %}\n`,
    );
  }
});

const skill = (version: string | null, body = "old") =>
  `---\n${version === null ? "" : `metadata:\n  spindle:\n    version: ${version}\n`}---\n${body}\n`;

interface Setup {
  config?: string | object;
  skills?: Record<string, string>;
}

interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

async function withProject(
  setup: Setup,
  args: string[],
  check: (project: string, result: CliResult) => void | Promise<void>,
  stubsDir = stubs,
  runner: (
    project: string,
    args: string[],
    searchPath: string,
    env: Record<string, string>,
  ) => CliResult | Promise<CliResult> = runCli,
) {
  const project = await makeTempDir();
  await mkdir(join(project, ".github"), { recursive: true });
  if (setup.config !== undefined) {
    await writeFile(
      join(project, ".github/spindle.json"),
      typeof setup.config === "string" ? setup.config : JSON.stringify(setup.config),
    );
  }
  for (const [name, content] of Object.entries(setup.skills ?? {})) {
    await mkdir(join(project, ".github/skills", name), { recursive: true });
    await writeFile(join(project, ".github/skills", name, "SKILL.md"), content);
    await writeFile(join(project, ".github/skills", name, "extra.txt"), "stale");
  }
  const result = await runner(project, ["update", ...args], process.env.PATH ?? "", {
    SPINDLE_TEST_BLUEPRINTS_DIR: stubsDir,
  });
  await check(project, result);
}

const read = (project: string, name: string) =>
  readFile(join(project, ".github/skills", name, "SKILL.md"), "utf8");

const goodConfig = {
  stacks: ["python", "typescript"],
  spindle_package_manager: "pnpm",
  variables: { owner: "legacy" },
  tooling: [],
};

test("JSON update returns one typed result when replacing a collision", async () => {
  await withProject(
    { config: goodConfig, skills: { newer: "custom skill\n" } },
    ["--json"],
    (_project, result) => {
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        ok: true,
        data: {
          stacks: ["python", "typescript"],
          guidanceInitialized: true,
          outcomes: expect.arrayContaining([
            expect.objectContaining({ name: "newer", status: "updated" }),
          ]),
        },
      });
      expect(result.stdout.trim().split("\n")).toHaveLength(1);
      expect(result.stderr).toBe("");
    },
  );
});

test("update copies a Skill's stacks directory as ordinary recursive content", async () => {
  const blueprints = await makeTempDir("spindle-update-stacks-content-blueprints-");
  const skillDirectory = join(blueprints, "skills", "demo");
  {
    await mkdir(join(skillDirectory, "stacks", "python"), { recursive: true });
    await mkdir(join(skillDirectory, "stacks", "typescript"), { recursive: true });
    await mkdir(join(skillDirectory, "stacks", "php-laravel"), { recursive: true });
    await writeFile(
      join(skillDirectory, "SKILL.md"),
      "---\nname: demo\nmetadata:\n  spindle:\n    version: 2.0.0\n---\n# updated\n",
    );
    await writeFile(join(skillDirectory, "shared.txt"), "shared content\n");
    await writeFile(join(skillDirectory, "stacks", "python", "python.txt"), "python content\n");
    await writeFile(
      join(skillDirectory, "stacks", "typescript", "typescript.txt"),
      "typescript content\n",
    );
    await writeFile(join(skillDirectory, "stacks", "php-laravel", "php.txt"), "php content\n");

    await withProject(
      { config: goodConfig, skills: { demo: skill("1.0.0") } },
      [],
      async (project, result) => {
        expect(result.status, result.stderr).toBe(0);
        expect(await readFile(join(project, ".github/skills/demo/shared.txt"), "utf8")).toBe(
          "shared content\n",
        );
        expect(
          await readFile(join(project, ".github/skills/demo/stacks/python/python.txt"), "utf8"),
        ).toBe("python content\n");
        expect(
          await readFile(
            join(project, ".github/skills/demo/stacks/typescript/typescript.txt"),
            "utf8",
          ),
        ).toBe("typescript content\n");
        expect(
          await readFile(join(project, ".github/skills/demo/stacks/php-laravel/php.txt"), "utf8"),
        ).toBe("php content\n");
      },
      blueprints,
    );
  }
});

test("update reads Skill metadata from its catalog-selected root entry", async () => {
  const blueprints = await makeTempDir("spindle-update-catalog-skill-blueprints-");
  const skillDirectory = join(blueprints, "skills", "demo");
  {
    await mkdir(skillDirectory, { recursive: true });
    await writeFile(join(skillDirectory, "SKILL.md"), skill("2.0.0", "new"));

    await withProject(
      {
        config: { stacks: ["python"], spindle_package_manager: "pnpm", variables: {} },
        skills: { demo: skill("1.0.0") },
      },
      [],
      async (project, result) => {
        expect(result.status, result.stderr).toBe(0);
        expect(await read(project, "demo")).toBe(skill("2.0.0", "new"));
      },
      blueprints,
    );
  }
});

test("update preserves paths for duplicate basenames in a Skill's stacks directory", async () => {
  const blueprints = await makeTempDir("spindle-update-stacks-blueprints-");
  const skillDirectory = join(blueprints, "skills", "demo");
  {
    await mkdir(join(skillDirectory, "stacks", "python"), { recursive: true });
    await mkdir(join(skillDirectory, "stacks", "typescript"), { recursive: true });
    await writeFile(
      join(skillDirectory, "SKILL.md"),
      "---\nname: demo\nmetadata:\n  spindle:\n    version: 2.0.0\n---\n# updated\n",
    );
    await writeFile(
      join(skillDirectory, "stacks", "python", "shared-path.txt"),
      "python content\n",
    );
    await writeFile(
      join(skillDirectory, "stacks", "typescript", "shared-path.txt"),
      "typescript content\n",
    );

    await withProject(
      { config: goodConfig, skills: { demo: skill("1.0.0") } },
      [],
      async (project, result) => {
        expect(result.status, result.stderr).toBe(0);
        expect(await read(project, "demo")).toMatch(/version: 2\.0\.0/);
        expect(
          await readFile(
            join(project, ".github/skills/demo/stacks/python/shared-path.txt"),
            "utf8",
          ),
        ).toBe("python content\n");
        expect(
          await readFile(
            join(project, ".github/skills/demo/stacks/typescript/shared-path.txt"),
            "utf8",
          ),
        ).toBe("typescript content\n");
      },
      blueprints,
    );
  }
});

test("all selected versions are overwritten with stored stacks and package manager", async () => {
  const configText = JSON.stringify(goodConfig, null, 4);
  await withProject(
    {
      config: configText,
      skills: {
        newer: skill("1.9.9"),
        equal: skill("1.0.0"),
        lower: skill("9.0.0"),
        missing: skill(null),
        bad: skill("v1"),
      },
    },
    [],
    async (project, result) => {
      expect(result.status, result.stderr).toBe(0);
      expect(await read(project, "newer")).toBe(
        "---\nmetadata:\n  spindle:\n    version: 2.0.0\n---\nfresh newer owner=pnpm stacks=python;typescript;\n",
      );
      expect(await read(project, "equal")).toContain("fresh equal");
      expect(await read(project, "lower")).toContain("fresh lower");
      expect(await read(project, "missing")).toContain("fresh missing");
      expect(await read(project, "bad")).toContain("fresh bad");
      await expect(readFile(join(project, ".github/skills/newer/extra.txt"))).rejects.toThrow();
      expect(await read(project, "absent")).toContain("fresh absent");
      expect(
        JSON.parse(await readFile(join(project, ".github/spindle.json"), "utf8")),
      ).toMatchObject({
        ...goodConfig,
        commit: { title_max_length: 72 },
        $schema: expect.stringMatching(/\/releases\/download\/v[^/]+\/spindle\.schema\.json$/),
      });
      expect(result.stderr).toBe("");
      expect(result.stdout).toMatch(/Added 1, updated 5, skipped 0, up to date 0 skill\(s\)/);
    },
  );
});

test("update reads a Nunjucks-rendered nested Skill version", async () => {
  const blueprints = await makeTempDir("spindle-update-nested-templated-version-");
  const skillFile = join(blueprints, "skills", "demo", "SKILL.md");
  const installed = "---\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nlocal\n";
  {
    await mkdir(join(blueprints, "skills", "demo"), { recursive: true });
    await writeFile(
      skillFile,
      [
        "---",
        "metadata:",
        "  vendor:",
        "    version: 8.0.0",
        "  spindle:",
        "    version: {{ computed.spindle_package_manager }}",
        "---",
        "rendered {{ computed.spindle_package_manager }}",
        "",
      ].join("\n"),
    );
    await withProject(
      {
        config: { stacks: ["python"], spindle_package_manager: "2.0.0" },
        skills: { demo: installed },
      },
      [],
      async (project, result) => {
        expect(result.status, result.stderr).toBe(0);
        expect(await read(project, "demo")).toBe(
          "---\nmetadata:\n  vendor:\n    version: 8.0.0\n  spindle:\n    version: 2.0.0\n---\nrendered 2.0.0\n",
        );
      },
      blueprints,
    );
  }
});

test("top-level version is not a fallback for shipped or installed Skills", async () => {
  const blueprints = await makeTempDir("spindle-update-no-version-fallback-");
  const source = join(blueprints, "skills", "demo", "SKILL.md");
  {
    await mkdir(join(blueprints, "skills", "demo"), { recursive: true });
    await writeFile(source, "---\nversion: 2.0.0\n---\nshipped\n");
    await withProject(
      { config: goodConfig, skills: { demo: skill("1.0.0") } },
      [],
      async (project, result) => {
        expect(result.status).not.toBe(0);
        expect(result.stderr).toMatch(/no valid semver version/);
        expect(await read(project, "demo")).toBe(skill("1.0.0"));
      },
      blueprints,
    );

    await writeFile(source, "---\nmetadata:\n  spindle:\n    version: 2.0.0\n---\nshipped\n");
    const legacyInstalled = "---\nversion: 9.0.0\n---\nlocal\n";
    await withProject(
      { config: goodConfig, skills: { demo: legacyInstalled } },
      [],
      async (project, result) => {
        expect(result.status, result.stderr).toBe(0);
        expect(result.stderr).toBe("");
        expect(await read(project, "demo")).toContain("shipped");
      },
      blueprints,
    );
  }
});

test("update renders a complete static Skill entry before checking an equal version", async () => {
  const blueprints = await makeTempDir("spindle-static-version-");
  const project = await makeTempDir("spindle-static-version-project-");
  const installed = join(project, ".github", "skills", "demo", "SKILL.md");
  const original = "---\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nlocal\n";
  const configText = JSON.stringify({
    stacks: ["python"],
    spindle_package_manager: "pnpm",
    variables: {},
  });
  {
    await mkdir(join(blueprints, "skills", "demo"), { recursive: true });
    await writeFile(
      join(blueprints, "skills", "demo", "SKILL.md"),
      "---\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nunused {{ variables.not_supplied }}\n",
    );
    await mkdir(join(installed, ".."), { recursive: true });
    await writeFile(installed, original);
    await writeFile(join(project, ".github", "spindle.json"), configText);

    const result = runCli(project, ["update"], process.env.PATH ?? "", {
      SPINDLE_TEST_BLUEPRINTS_DIR: blueprints,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/undefined|not_supplied/i);
    expect(await readFile(installed, "utf8")).toBe(original);
    expect(await readFile(join(project, ".github", "spindle.json"), "utf8")).toBe(configText);
  }
});

test("update overwrites malformed installed Skill YAML at selected paths", async () => {
  const blueprints = await makeTempDir("spindle-malformed-skill-blueprints-");
  const malformed =
    "---\nname: broken\nmetadata:\n  spindle:\n    version: [unterminated\n---\nlocal broken Skill\n";
  const config = JSON.stringify({ stacks: ["python"], spindle_package_manager: "pnpm" });
  {
    for (const name of ["a-outdated", "z-broken"]) {
      await mkdir(join(blueprints, "skills", name), { recursive: true });
      await writeFile(join(blueprints, "skills", name, "SKILL.md"), skill("2.0.0", "shipped"));
    }

    await withProject(
      { config, skills: { "a-outdated": skill("1.0.0", "local"), "z-broken": malformed } },
      [],
      async (project, result) => {
        expect(result.status, result.stderr).toBe(0);
        expect(await read(project, "a-outdated")).toBe(skill("2.0.0", "shipped"));
        expect(await read(project, "z-broken")).toBe(skill("2.0.0", "shipped"));
        await expect(
          readFile(join(project, ".github", "skills", "a-outdated", "extra.txt"), "utf8"),
        ).rejects.toMatchObject({ code: "ENOENT" });
        expect(
          JSON.parse(await readFile(join(project, ".github", "spindle.json"), "utf8")),
        ).toMatchObject({
          ...JSON.parse(config),
          tooling: [],
        });
      },
      blueprints,
    );
  }
});

test("updates do not require missing Variables", async () => {
  const currentSkills = {
    newer: skill("2.0.0"),
    equal: skill("1.0.0"),
    lower: skill("9.0.0"),
    missing: skill("1.0.0"),
    bad: skill("1.0.0"),
    absent: skill("1.0.0"),
  };
  await withProject(
    {
      config: { stacks: ["python"], spindle_package_manager: "pnpm", variables: {} },
      skills: currentSkills,
    },
    [],
    async (project, result) => {
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toMatch(/Added 0, updated 6, skipped 0, up to date 0 skill\(s\)/);
      expect(await read(project, "newer")).toContain("fresh newer");
    },
  );
});

test(
  "interactive updates do not prompt for missing Variables",
  { skip: process.platform !== "linux" },
  async () => {
    const currentSkills = {
      newer: skill("2.0.0"),
      equal: skill("1.0.0"),
      lower: skill("9.0.0"),
      missing: skill("1.0.0"),
      bad: skill("1.0.0"),
      absent: skill("1.0.0"),
    };
    await withProject(
      {
        config: { stacks: ["python"], spindle_package_manager: "pnpm", variables: {} },
        skills: currentSkills,
      },
      [],
      async (_project, result) => {
        expect(result.status, result.stdout).toBe(0);
        expect(result.stdout).not.toMatch(
          /owner: Team owner|lint_command: Lint command|Which new Skills/,
        );
        expect(result.stdout).toMatch(/Added 0, updated 6, skipped 0, up to date 0 skill\(s\)/);
      },
      stubs,
      (project, args, searchPath, env) => runCliInteractive(project, args, searchPath, [], env),
    );
  },
);

test(
  "legacy Variables are ignored while the configured package manager renders without rewriting Config",
  { skip: process.platform !== "linux" },
  async () => {
    const variableStubs = await makeTempDir("spindle-update-variable-stubs-");
    await cp(stubs, variableStubs, { recursive: true });
    for (const [name, version] of [
      ["newer", "2.0.0"],
      ["absent", "1.0.0"],
    ]) {
      await writeFile(
        join(variableStubs, "skills", name, "SKILL.md"),
        `---\nmetadata:\n  spindle:\n    version: ${version}\n---\nfresh ${name} manager={{ computed.spindle_package_manager }} stacks={% for s in stacks %}{{ s }};{% endfor %}\n`,
      );
    }
    const projectConfig = {
      stacks: ["python"],
      spindle_package_manager: "pnpm",
      variables: { owner: "configured" },
      unrelated: { preserve: true },
      tooling: [],
    };
    {
      await withProject(
        {
          config: projectConfig,
          skills: {
            newer: skill("1.0.0"),
            equal: skill("1.0.0"),
            lower: skill("9.0.0"),
            missing: skill("1.0.0"),
            bad: skill("1.0.0"),
          },
        },
        [],
        async (project, result) => {
          expect(result.status, result.stdout).toBe(0);
          expect(result.stdout).toMatch(/Added 1, updated 5, skipped 0, up to date 0 skill\(s\)/);
          expect(await read(project, "newer")).toMatch(/fresh newer manager=pnpm stacks=python;/);
          expect(await read(project, "absent")).toMatch(/fresh absent manager=pnpm stacks=python;/);
          expect(
            JSON.parse(await readFile(join(project, ".github/spindle.json"), "utf8")),
          ).toMatchObject(projectConfig);
        },
        variableStubs,
        (project, args, searchPath, env) =>
          runCliInteractive(
            project,
            args,
            searchPath,
            [
              { trigger: "Enter: confirm", input: "\r" },
              { trigger: "What should happen?", input: "\r" },
            ],
            env,
          ),
      );
    }
  },
);

test(
  "update preflights undefined source templates before installing any Skills",
  { skip: process.platform !== "linux" },
  async () => {
    const failureStubs = await makeTempDir("spindle-update-failure-stubs-");
    await cp(stubs, failureStubs, { recursive: true });
    const newSkills = [
      ["alpha-new", "rendered {{ variables.owner }}"],
      ["beta-new", "will fail {{ variables.undefinedValue }}"],
      ["zeta-new", "must never install"],
    ] as const;
    for (const [name, body] of newSkills) {
      await mkdir(join(failureStubs, "skills", name), { recursive: true });
      await writeFile(
        join(failureStubs, "skills", name, "SKILL.md"),
        `---\nmetadata:\n  spindle:\n    version: 1.0.0\n---\n${body}\n`,
      );
    }
    await rm(join(failureStubs, "catalog.fixture.json"), { force: true });
    const originalConfig = {
      stacks: ["python"],
      spindle_package_manager: "npm run",
      variables: { owner: "configured" },
      unrelated: { preserve: true },
      tooling: [],
    };
    const currentSkills = {
      newer: skill("2.0.0"),
      equal: skill("1.0.0"),
      lower: skill("9.0.0"),
      missing: skill("1.0.0"),
      bad: skill("1.0.0"),
    };
    {
      await withProject(
        { config: originalConfig, skills: currentSkills },
        [],
        async (project, result) => {
          expect(result.status).not.toBe(0);
          expect(`${result.stdout}\n${result.stderr}`).toMatch(/undefined|undefinedValue/i);
          await expect(
            readFile(join(project, ".github/skills/alpha-new/SKILL.md")),
          ).rejects.toThrow();
          await expect(
            readFile(join(project, ".github/skills/zeta-new/SKILL.md")),
          ).rejects.toThrow();
          expect(JSON.parse(await readFile(join(project, ".github/spindle.json"), "utf8"))).toEqual(
            originalConfig,
          );
        },
        failureStubs,
        (project, args, searchPath, env) =>
          runCliInteractive(
            project,
            args,
            searchPath,
            [{ trigger: "Enter: confirm", input: "\r" }],
            env,
          ),
      );
    }
  },
);

test(
  "update reports Config write failures and preserves the original Config",
  { skip: process.platform !== "linux" },
  async () => {
    const originalConfig = {
      stacks: ["python"],
      spindle_package_manager: "npm run",
      variables: { owner: "configured" },
      unrelated: { preserve: true },
      tooling: [],
    };
    const currentSkills = {
      newer: skill("2.0.0"),
      equal: skill("1.0.0"),
      lower: skill("9.0.0"),
      missing: skill("1.0.0"),
      bad: skill("1.0.0"),
    };
    const failureHook = join(repoRoot, "tests/Helpers/Preloads/fail-config-write.ts");
    await withProject(
      { config: originalConfig, skills: currentSkills },
      [],
      async (project, result) => {
        expect(result.status).not.toBe(0);
        expect(result.stdout + result.stderr).toMatch(/forced Config write failure/);
        expect(JSON.parse(await readFile(join(project, ".github/spindle.json"), "utf8"))).toEqual(
          originalConfig,
        );
      },
      stubs,
      (project, args, searchPath, env) =>
        runCliInteractive(project, args, searchPath, [], {
          ...env,
          SPINDLE_TEST_PRELOAD: failureHook,
        }),
    );
  },
);

test("a hand-edited package-manager command is re-resolved on each run", async () => {
  await withProject(
    {
      config: { stacks: ["php-laravel"], spindle_package_manager: "npm run" },
      skills: { newer: skill("1.0.0") },
    },
    [],
    async (project, result) => {
      expect(result.status, result.stderr).toBe(0);
      expect(await read(project, "newer")).toMatch(/owner=npm run stacks=php-laravel;/);
    },
  );
});

test("update rejects Config without a Spindle package-manager command", async () => {
  await withProject(
    {
      config: '{"stacks":["python"],"variables":{"owner":"legacy"}}',
      skills: { newer: skill("1.0.0") },
    },
    [],
    async (project, result) => {
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/Missing "spindle_package_manager"/);
      expect(await read(project, "newer")).toBe(skill("1.0.0"));
    },
  );
});

test("invalid stack ids in the config are rejected", async () => {
  await withProject(
    {
      config: {
        stacks: ["cobol"],
        spindle_package_manager: "pnpm",
        variables: goodConfig.variables,
      },
      skills: { newer: skill("1.0.0") },
    },
    [],
    async (project, result) => {
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/Invalid stack 'cobol'/);
      expect(await read(project, "newer")).toBe(skill("1.0.0"));
    },
  );
});

test("missing or malformed config reports how to recover", async () => {
  for (const config of [
    undefined,
    "{not json",
    { variables: {} },
    { stacks: ["python"], spindle_package_manager: "" },
    { stacks: ["python"], variables: null },
    { stacks: ["python"], variables: [] },
    { stacks: ["python"], variables: { owner: 42 } },
    "[]",
  ]) {
    await withProject(
      { config, skills: { newer: skill("1.0.0") } },
      [],
      async (project, result) => {
        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(
          /spindle init|Fix \.github\/spindle\.json|Missing "spindle_package_manager"/,
        );
        expect(await read(project, "newer")).toBe(skill("1.0.0"));
      },
    );
  }
});

test("update Commander help accepts -h and help update outside Git", async () => {
  const project = await makeTempDir("spindle-update-help-");
  for (const args of [
    ["update", "-h"],
    ["help", "update"],
  ]) {
    const result = runCliRaw(project, args, process.env.PATH ?? "");
    expect(result.status, `${args.join(" ")}: ${result.stderr}`).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatch(/Usage: spindle update/);
    expect(result.stdout).toMatch(/-h, --help/);
  }
  expect(await readdir(project)).toEqual([]);
});

test("update reports invalid arguments before Git discovery outside a working tree", async () => {
  const project = await makeTempDir("spindle-update-invalid-no-git-");
  const result = runCliRaw(project, ["update", "--stack", "python"], "");
  expect(result.status).not.toBe(0);
  expect(result.stdout).toBe("");
  expect(result.stderr).toMatch(/unknown option.*--stack/i);
  expect(result.stderr).not.toMatch(/Git working-tree root/i);
  expect(await readdir(project)).toEqual([]);
});

test("valid update requires Git discovery outside a working tree", async () => {
  const project = await makeTempDir("spindle-update-valid-no-git-");
  for (const searchPath of [process.env.PATH ?? "", ""]) {
    const result = runCliRaw(project, ["update"], searchPath);
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/Git working-tree root/i);
    expect(await readdir(project)).toEqual([]);
  }
});

test("update rejects inapplicable options, unexpected arguments, and invalid conflict choices", async () => {
  const invalidInvocations: [string[], RegExp][] = [
    [["--stack", "python"], /unknown option.*--stack/i],
    [["unexpected"], /too many arguments/i],
    [["--on-conflict", "prompt"], /unknown option.*--on-conflict/i],
    [["--no-interactive"], /unknown option.*--no-interactive/i],
    [["--include-new"], /unknown option.*--include-new/i],
  ];

  for (const [args, error] of invalidInvocations) {
    await withProject({}, args, (_project, result) => {
      expect(result.status, args.join(" ")).not.toBe(0);
      expect(result.stdout, args.join(" ")).toBe("");
      expect(result.stderr, args.join(" ")).toMatch(error);
    });
  }
});

test("update --help documents its flags", async () => {
  await withProject({}, ["--help"], async (_project, result) => {
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("--help");
    for (const flag of ["--on-conflict", "--include-new", "--no-interactive"]) {
      expect(result.stdout).not.toContain(flag);
    }
    expect(result.stdout).toMatch(/spindle update/);
    expect(result.stdout).toMatch(/Reads stacks and the Spindle package-manager command/);
    expect(result.stdout).toMatch(/run `spindle init` first/);
  });
});

test(
  "update refuses symlinked .github paths before removing or writing skills",
  { skip: process.platform === "win32" },
  async () => {
    const cases: { label: string; link: "github" | "skills" | "skill" }[] = [
      { label: ".github", link: "github" },
      { label: ".github/skills", link: "skills" },
      { label: ".github/skills/newer", link: "skill" },
    ];

    for (const { label, link } of cases) {
      const project = await makeTempDir();
      const outside = join(project, "outside");
      {
        await mkdir(outside, { recursive: true });
        await writeFile(join(outside, "sentinel"), "keep");
        if (link === "github") {
          await writeFile(join(outside, "spindle.json"), JSON.stringify(goodConfig));
          await mkdir(join(outside, "skills", "newer"), { recursive: true });
          await writeFile(join(outside, "skills", "newer", "SKILL.md"), skill("1.0.0"));
          await symlink(outside, join(project, ".github"), "dir");
        } else {
          await mkdir(join(project, ".github"), { recursive: true });
          await writeFile(join(project, ".github", "spindle.json"), JSON.stringify(goodConfig));
          if (link === "skills") {
            await mkdir(join(outside, "newer"), { recursive: true });
            await writeFile(join(outside, "newer", "SKILL.md"), skill("1.0.0"));
            await symlink(outside, join(project, ".github", "skills"), "dir");
          } else {
            await mkdir(join(project, ".github", "skills"), { recursive: true });
            await writeFile(join(outside, "SKILL.md"), skill("1.0.0"));
            await symlink(outside, join(project, ".github", "skills", "newer"), "dir");
          }
        }

        const result = runCli(project, ["update"], process.env.PATH ?? "", {
          SPINDLE_TEST_BLUEPRINTS_DIR: stubs,
        });
        expect(result.status, label).not.toBe(0);
        expect(result.stderr, label).toMatch(/symbolic link|must be a real directory/i);
        expect(await readFile(join(outside, "sentinel"), "utf8"), label).toBe("keep");
        if (link === "github") {
          expect(await readFile(join(outside, "skills", "newer", "SKILL.md"), "utf8")).toBe(
            skill("1.0.0"),
          );
        } else if (link === "skills") {
          expect(await readFile(join(outside, "newer", "SKILL.md"), "utf8")).toBe(skill("1.0.0"));
        } else {
          expect(await readFile(join(outside, "SKILL.md"), "utf8")).toBe(skill("1.0.0"));
        }
      }
    }
  },
);
