import { writeFileSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterAll, beforeAll, test, expect, vi } from "vitest";

vi.setConfig({ testTimeout: 30_000 });

import {
  makeTempDir,
  runCliRaw,
  runCliWithFixtureCatalog as runCli,
  runCliInteractiveWithFixtureCatalog as runCliInteractive,
} from "./helpers.ts";

let stubs: string;

beforeAll(async () => {
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
      `---\nmetadata:\n  spindle:\n    version: ${version}\n---\nfresh ${name} owner={{ variables.owner }} stacks={% for s in stacks %}{{ s }};{% endfor %}\n`,
    );
  }
});

afterAll(async () => {
  await rm(stubs, { recursive: true, force: true });
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
  try {
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
      SPINDLE_BLUEPRINTS_DIR: stubsDir,
    });
    await check(project, result);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
}

const read = (project: string, name: string) =>
  readFile(join(project, ".github/skills", name, "SKILL.md"), "utf8");

const goodConfig = { stacks: ["python", "typescript"], variables: { owner: "core" } };

test("update copies a Skill's stacks directory as ordinary recursive content", async () => {
  const blueprints = await makeTempDir("spindle-update-stacks-content-blueprints-");
  const skillDirectory = join(blueprints, "skills", "demo");
  try {
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
      ["--no-interactive", "--on-conflict", "overwrite"],
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
  } finally {
    await rm(blueprints, { recursive: true, force: true });
  }
});

test("update reads Skill metadata from its catalog-selected root entry", async () => {
  const blueprints = await makeTempDir("spindle-update-catalog-skill-blueprints-");
  const skillDirectory = join(blueprints, "skills", "demo");
  try {
    await mkdir(skillDirectory, { recursive: true });
    await writeFile(join(skillDirectory, "SKILL.md"), skill("2.0.0", "new"));

    await withProject(
      { config: { stacks: ["python"], variables: {} }, skills: { demo: skill("1.0.0") } },
      ["--no-interactive", "--on-conflict", "overwrite"],
      async (project, result) => {
        expect(result.status, result.stderr).toBe(0);
        expect(await read(project, "demo")).toBe(skill("2.0.0", "new"));
      },
      blueprints,
    );
  } finally {
    await rm(blueprints, { recursive: true, force: true });
  }
});

test("update preserves paths for duplicate basenames in a Skill's stacks directory", async () => {
  const blueprints = await makeTempDir("spindle-update-stacks-blueprints-");
  const skillDirectory = join(blueprints, "skills", "demo");
  try {
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
      ["--no-interactive", "--on-conflict", "overwrite"],
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
  } finally {
    await rm(blueprints, { recursive: true, force: true });
  }
});

test("newer is overwritten with stored stacks and variables; equal, lower, non-semver and absent are not", async () => {
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
    ["--no-interactive", "--on-conflict", "overwrite"],
    async (project, result) => {
      expect(result.status, result.stderr).toBe(0);
      expect(await read(project, "newer")).toBe(
        "---\nmetadata:\n  spindle:\n    version: 2.0.0\n---\nfresh newer owner=core stacks=python;typescript;\n",
      );
      expect(await read(project, "equal")).toBe(skill("1.0.0"));
      expect(await read(project, "lower")).toBe(skill("9.0.0"));
      expect(await read(project, "missing")).toBe(skill(null));
      expect(await read(project, "bad")).toBe(skill("v1"));
      await expect(readFile(join(project, ".github/skills/newer/extra.txt"))).rejects.toThrow();
      await expect(read(project, "absent")).rejects.toThrow();
      expect(await readFile(join(project, ".github/spindle.json"), "utf8")).toBe(configText);
      expect(result.stderr).toMatch(/missing.*no version/);
      expect(result.stderr).toMatch(/bad.*non-semver version 'v1'/);
      expect(result.stdout).toMatch(/Added 0, updated 1, skipped 3, up to date 2 skill\(s\)/);
    },
  );
});

test("update reads a Nunjucks-rendered nested Skill version", async () => {
  const blueprints = await makeTempDir("spindle-update-nested-templated-version-");
  const skillFile = join(blueprints, "skills", "demo", "SKILL.md");
  const installed = "---\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nlocal\n";
  try {
    await mkdir(join(blueprints, "skills", "demo"), { recursive: true });
    await writeFile(
      skillFile,
      [
        "---",
        "metadata:",
        "  vendor:",
        "    version: 8.0.0",
        "  spindle:",
        "    version: {{ variables.owner }}",
        "---",
        "rendered {{ variables.owner }}",
        "",
      ].join("\n"),
    );
    await withProject(
      {
        config: { stacks: ["python"], variables: { owner: "2.0.0" } },
        skills: { demo: installed },
      },
      ["--no-interactive", "--on-conflict", "overwrite"],
      async (project, result) => {
        expect(result.status, result.stderr).toBe(0);
        expect(await read(project, "demo")).toBe(
          "---\nmetadata:\n  vendor:\n    version: 8.0.0\n  spindle:\n    version: 2.0.0\n---\nrendered 2.0.0\n",
        );
      },
      blueprints,
    );
  } finally {
    await rm(blueprints, { recursive: true, force: true });
  }
});

test("top-level version is not a fallback for shipped or installed Skills", async () => {
  const blueprints = await makeTempDir("spindle-update-no-version-fallback-");
  const source = join(blueprints, "skills", "demo", "SKILL.md");
  try {
    await mkdir(join(blueprints, "skills", "demo"), { recursive: true });
    await writeFile(source, "---\nversion: 2.0.0\n---\nshipped\n");
    await withProject(
      { config: goodConfig, skills: { demo: skill("1.0.0") } },
      ["--no-interactive", "--on-conflict", "overwrite"],
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
      ["--no-interactive", "--on-conflict", "overwrite"],
      async (project, result) => {
        expect(result.status, result.stderr).toBe(0);
        expect(result.stderr).toMatch(/Skill 'demo'.*no version/);
        expect(await read(project, "demo")).toBe(legacyInstalled);
      },
      blueprints,
    );
  } finally {
    await rm(blueprints, { recursive: true, force: true });
  }
});

test("update renders a complete static Skill entry before checking an equal version", async () => {
  const blueprints = await makeTempDir("spindle-static-version-");
  const project = await makeTempDir("spindle-static-version-project-");
  const installed = join(project, ".github", "skills", "demo", "SKILL.md");
  const original = "---\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nlocal\n";
  const configText = JSON.stringify({ stacks: ["python"], variables: {} });
  try {
    await mkdir(join(blueprints, "skills", "demo"), { recursive: true });
    await writeFile(
      join(blueprints, "skills", "demo", "SKILL.md"),
      "---\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nunused {{ variables.not_supplied }}\n",
    );
    await mkdir(join(installed, ".."), { recursive: true });
    await writeFile(installed, original);
    await writeFile(join(project, ".github", "spindle.json"), configText);

    const result = runCli(project, ["update", "--no-interactive"], process.env.PATH ?? "", {
      SPINDLE_BLUEPRINTS_DIR: blueprints,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/undefined|not_supplied/i);
    expect(await readFile(installed, "utf8")).toBe(original);
    expect(await readFile(join(project, ".github", "spindle.json"), "utf8")).toBe(configText);
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("update refuses to install a Skill entry changed after version planning", async () => {
  const blueprints = await makeTempDir("spindle-update-changed-entry-blueprints-");
  const project = await makeTempDir("spindle-update-changed-entry-project-");
  const source = join(blueprints, "skills", "demo", "SKILL.md");
  const installed = join(project, ".github", "skills", "demo", "SKILL.md");
  const original = "---\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nlocal\n";
  const changedSource =
    "---\nmetadata:\n  spindle:\n    version: 3.0.0\n---\nchanged after planning\n";
  try {
    await mkdir(join(blueprints, "skills", "demo"), { recursive: true });
    await writeFile(source, "---\nmetadata:\n  spindle:\n    version: 2.0.0\n---\nshipped\n");
    await mkdir(join(installed, ".."), { recursive: true });
    await writeFile(installed, original);
    await writeFile(
      join(project, ".github", "spindle.json"),
      JSON.stringify({ stacks: ["python"], variables: { owner: "team" } }),
    );

    const result = await runCliInteractive(
      project,
      ["update"],
      process.env.PATH ?? "",
      [
        {
          trigger: "What should happen?",
          input: "\r",
          beforeInput: () => writeFileSync(source, changedSource),
        },
      ],
      { SPINDLE_BLUEPRINTS_DIR: blueprints },
    );

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/changed while planning/);
    expect(await readFile(installed, "utf8")).toBe(original);
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("update aborts on malformed installed Skill YAML before replacing another Skill", async () => {
  const blueprints = await makeTempDir("spindle-malformed-skill-blueprints-");
  const malformed =
    "---\nname: broken\nmetadata:\n  spindle:\n    version: [unterminated\n---\nlocal broken Skill\n";
  const config = JSON.stringify({ stacks: ["python"], variables: {} });
  try {
    for (const name of ["a-outdated", "z-broken"]) {
      await mkdir(join(blueprints, "skills", name), { recursive: true });
      await writeFile(join(blueprints, "skills", name, "SKILL.md"), skill("2.0.0", "shipped"));
    }

    await withProject(
      { config, skills: { "a-outdated": skill("1.0.0", "local"), "z-broken": malformed } },
      ["--no-interactive", "--on-conflict", "overwrite"],
      async (project, result) => {
        expect(result.status).not.toBe(0);
        expect(result.stderr).toMatch(/flow collection|end of the stream|YAML/i);
        expect(await read(project, "a-outdated")).toBe(skill("1.0.0", "local"));
        expect(await read(project, "z-broken")).toBe(malformed);
        expect(
          await readFile(join(project, ".github", "skills", "a-outdated", "extra.txt"), "utf8"),
        ).toBe("stale");
        expect(await readFile(join(project, ".github", "spindle.json"), "utf8")).toBe(config);
      },
      blueprints,
    );
  } finally {
    await rm(blueprints, { recursive: true, force: true });
  }
});

test("--on-conflict skip leaves outdated skills untouched", async () => {
  await withProject(
    { config: goodConfig, skills: { newer: skill("1.0.0") } },
    ["--no-interactive", "--on-conflict", "skip"],
    async (project, result) => {
      expect(result.status, result.stderr).toBe(0);
      expect(await read(project, "newer")).toBe(skill("1.0.0"));
      expect(result.stdout).toMatch(/Added 0, updated 0, skipped 6, up to date 0 skill\(s\)/);
    },
  );
});

test("non-interactive without a policy errors naming the flag and writes nothing", async () => {
  await withProject(
    { config: goodConfig, skills: { newer: skill("1.0.0") } },
    ["--no-interactive"],
    async (project, result) => {
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/--on-conflict/);
      expect(await read(project, "newer")).toBe(skill("1.0.0"));
    },
  );
});

test("--include-new does not waive the outdated-Skill conflict policy", async () => {
  await withProject(
    { config: goodConfig, skills: { newer: skill("1.0.0") } },
    ["--no-interactive", "--include-new"],
    async (project, result) => {
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/--on-conflict/);
      expect(await read(project, "newer")).toBe(skill("1.0.0"));
      await expect(read(project, "absent")).rejects.toThrow();
    },
  );
});

test("nothing outdated needs no policy", async () => {
  await withProject(
    { config: goodConfig, skills: { equal: skill("1.0.0") } },
    ["--no-interactive"],
    async (_project, result) => {
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toMatch(/Added 0, updated 0, skipped 5, up to date 1 skill\(s\)/);
    },
  );
});

test("no-op updates do not require missing Variables", async () => {
  const currentSkills = {
    newer: skill("2.0.0"),
    equal: skill("1.0.0"),
    lower: skill("9.0.0"),
    missing: skill("1.0.0"),
    bad: skill("1.0.0"),
  };
  await withProject(
    { config: { stacks: ["python"], variables: {} }, skills: currentSkills },
    ["--no-interactive"],
    async (project, result) => {
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toMatch(/Added 0, updated 0, skipped 1, up to date 5 skill\(s\)/);
      expect(await read(project, "newer")).toBe(skill("2.0.0"));
    },
  );
});

test(
  "interactive no-op updates do not prompt for missing Variables",
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
      { config: { stacks: ["python"], variables: {} }, skills: currentSkills },
      [],
      async (_project, result) => {
        expect(result.status, result.stdout).toBe(0);
        expect(result.stdout).not.toMatch(
          /owner: Team owner|lint_command: Lint command|Which new Skills/,
        );
        expect(result.stdout).toMatch(/Added 0, updated 0, skipped 0, up to date 6 skill\(s\)/);
      },
      stubs,
      (project, args, searchPath, env) => runCliInteractive(project, args, searchPath, [], env),
    );
  },
);

test("one skipped total includes conflict, invalid-version, and unselected new Skills", async () => {
  await withProject(
    {
      config: goodConfig,
      skills: {
        newer: skill("1.0.0"),
        equal: skill("1.0.0"),
        lower: skill("9.0.0"),
        missing: skill(null),
        bad: skill("v1"),
      },
    },
    ["--no-interactive", "--on-conflict", "skip"],
    async (project, result) => {
      expect(result.status, result.stderr).toBe(0);
      expect(result.stderr).toMatch(/missing.*no version/);
      expect(result.stderr).toMatch(/bad.*non-semver version 'v1'/);
      expect(result.stdout).toMatch(/Added 0, updated 0, skipped 4, up to date 2 skill\(s\)/);
      expect(await read(project, "newer")).toBe(skill("1.0.0"));
      await expect(read(project, "absent")).rejects.toThrow();
    },
  );
});

test("--include-new installs new Skills and reports them separately from updates", async () => {
  const currentSkills = {
    newer: skill("2.0.0"),
    equal: skill("1.0.0"),
    lower: skill("9.0.0"),
    missing: skill("1.0.0"),
    bad: skill("1.0.0"),
  };
  await withProject(
    { config: goodConfig, skills: currentSkills },
    ["--no-interactive", "--include-new"],
    async (project, result) => {
      expect(result.status, result.stderr).toBe(0);
      expect(await read(project, "absent")).toMatch(
        /fresh absent owner=core stacks=python;typescript;/,
      );
      expect(result.stdout).toMatch(/Added 1, updated 0, skipped 0, up to date 5 skill\(s\)/);
    },
  );
});

test("non-interactive update skips new Skills by default and counts them as skipped", async () => {
  const currentSkills = {
    newer: skill("2.0.0"),
    equal: skill("1.0.0"),
    lower: skill("9.0.0"),
    missing: skill("1.0.0"),
    bad: skill("1.0.0"),
  };
  await withProject(
    { config: goodConfig, skills: currentSkills },
    ["--no-interactive"],
    async (project, result) => {
      expect(result.status, result.stderr).toBe(0);
      await expect(read(project, "absent")).rejects.toThrow();
      expect(result.stdout).toMatch(/Added 0, updated 0, skipped 1, up to date 5 skill\(s\)/);
    },
  );
});

test(
  "interactive new-Skill selection defaults to all and permits selecting none",
  { skip: process.platform !== "linux" },
  async () => {
    const currentSkills = {
      newer: skill("2.0.0"),
      equal: skill("1.0.0"),
      lower: skill("9.0.0"),
      missing: skill("1.0.0"),
      bad: skill("1.0.0"),
    };
    for (const [input, selected] of [
      ["\r", true],
      [" \r", false],
    ] as const) {
      await withProject(
        { config: goodConfig, skills: currentSkills },
        [],
        async (project, result) => {
          expect(result.status, result.stdout).toBe(0);
          expect(
            await readFile(join(project, ".github/skills/absent/SKILL.md"), "utf8").then(
              () => true,
              () => false,
            ),
            result.stdout,
          ).toBe(selected);
          expect(result.stdout).toMatch(
            selected
              ? /Added 1, updated 0, skipped 0, up to date 5 skill\(s\)/
              : /Added 0, updated 0, skipped 1, up to date 5 skill\(s\)/,
          );
        },
        stubs,
        (project, args, searchPath, env) =>
          runCliInteractive(project, args, searchPath, [{ trigger: "Enter: confirm", input }], env),
      );
    }
  },
);

test(
  "shared Variable defaults render every changed Skill without rewriting Config",
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
        `---\nmetadata:\n  spindle:\n    version: ${version}\n---\nfresh ${name} owner={{ variables.owner }} lint={{ variables.lint_command }} stacks={% for s in stacks %}{{ s }};{% endfor %}\n`,
      );
    }
    const projectConfig = {
      stacks: ["python"],
      variables: { owner: "configured" },
      unrelated: { preserve: true },
    };
    try {
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
          expect(result.stdout).toMatch(/Added 1, updated 1, skipped 0, up to date 4 skill\(s\)/);
          expect(await read(project, "newer")).toMatch(
            /fresh newer owner=configured lint=just lint stacks=python;/,
          );
          expect(await read(project, "absent")).toMatch(
            /fresh absent owner=configured lint=just lint stacks=python;/,
          );
          expect(JSON.parse(await readFile(join(project, ".github/spindle.json"), "utf8"))).toEqual(
            projectConfig,
          );
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
    } finally {
      await rm(variableStubs, { recursive: true, force: true });
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
    await rm(join(failureStubs, "catalog.fixture.json"));
    const originalConfig = {
      stacks: ["python"],
      variables: { owner: "configured" },
      unrelated: { preserve: true },
    };
    const currentSkills = {
      newer: skill("2.0.0"),
      equal: skill("1.0.0"),
      lower: skill("9.0.0"),
      missing: skill("1.0.0"),
      bad: skill("1.0.0"),
    };
    try {
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
    } finally {
      await rm(failureStubs, { recursive: true, force: true });
    }
  },
);

test(
  "update does not attempt a Config write when using shared Variable defaults",
  { skip: process.platform !== "linux" },
  async () => {
    const originalConfig = {
      stacks: ["python"],
      variables: { owner: "configured" },
      unrelated: { preserve: true },
    };
    const currentSkills = {
      newer: skill("2.0.0"),
      equal: skill("1.0.0"),
      lower: skill("9.0.0"),
      missing: skill("1.0.0"),
      bad: skill("1.0.0"),
    };
    const failureHook = join(process.cwd(), "tests", "fail-config-write.mjs");
    await withProject(
      { config: originalConfig, skills: currentSkills },
      ["--include-new"],
      async (project, result) => {
        expect(result.status, result.stdout).toBe(0);
        expect(result.stdout).not.toMatch(/forced Config write failure/);
        expect(await read(project, "absent")).toMatch(/fresh absent owner=configured/);
        expect(JSON.parse(await readFile(join(project, ".github/spindle.json"), "utf8"))).toEqual(
          originalConfig,
        );
      },
      stubs,
      (project, args, searchPath, env) =>
        runCliInteractive(project, args, searchPath, [], {
          ...env,
          NODE_OPTIONS: `--import=${failureHook}`,
        }),
    );
  },
);

test(
  "cancelling an outdated-Skill decision after selecting new Skills writes nothing",
  { skip: process.platform !== "linux" },
  async () => {
    const currentSkills = {
      newer: skill("1.0.0"),
      equal: skill("1.0.0"),
      lower: skill("9.0.0"),
      missing: skill("1.0.0"),
      bad: skill("1.0.0"),
    };
    await withProject(
      { config: goodConfig, skills: currentSkills },
      [],
      async (project, result) => {
        expect(result.status).not.toBe(0);
        expect(await read(project, "newer")).toBe(skill("1.0.0"));
        await expect(read(project, "absent")).rejects.toThrow();
      },
      stubs,
      (project, args, searchPath, env) =>
        runCliInteractive(
          project,
          args,
          searchPath,
          [
            { trigger: "Enter: confirm", input: "\r" },
            { trigger: "is outdated", input: "\x03" },
          ],
          env,
        ),
    );
  },
);

test("a hand-edited spindle.json is re-resolved on each run", async () => {
  await withProject(
    {
      config: { stacks: ["php-laravel"], variables: { owner: "edited" } },
      skills: { newer: skill("1.0.0") },
    },
    ["--no-interactive", "--on-conflict", "overwrite"],
    async (project, result) => {
      expect(result.status, result.stderr).toBe(0);
      expect(await read(project, "newer")).toMatch(/owner=edited stacks=php-laravel;/);
    },
  );
});

test("variables missing from the config fall back to product defaults", async () => {
  await withProject(
    {
      config: { stacks: ["python"], variables: {} },
      skills: { newer: skill("1.0.0") },
    },
    ["--no-interactive", "--on-conflict", "overwrite"],
    async (project, result) => {
      expect(result.status, result.stderr).toBe(0);
      expect(await read(project, "newer")).toMatch(/owner=nobody/);
    },
  );
});

test("invalid stack ids in the config are rejected", async () => {
  await withProject(
    {
      config: { stacks: ["cobol"], variables: goodConfig.variables },
      skills: { newer: skill("1.0.0") },
    },
    ["--no-interactive", "--on-conflict", "overwrite"],
    async (project, result) => {
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/Invalid stack 'cobol'/);
      expect(await read(project, "newer")).toBe(skill("1.0.0"));
    },
  );
});

test("missing or malformed config points to init", async () => {
  for (const config of [
    undefined,
    "{not json",
    { variables: {} },
    { stacks: ["python"] },
    { stacks: ["python"], variables: null },
    { stacks: ["python"], variables: [] },
    { stacks: ["python"], variables: { owner: 42 } },
    "[]",
  ]) {
    await withProject(
      { config, skills: { newer: skill("1.0.0") } },
      ["--no-interactive"],
      async (project, result) => {
        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/spindle init/);
        expect(await read(project, "newer")).toBe(skill("1.0.0"));
      },
    );
  }
});

test("update Commander help accepts -h and help update outside Git", async () => {
  const project = await mkdtemp(join(process.cwd(), "spindle-update-help-"));
  try {
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
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("update reports invalid arguments before Git discovery outside a working tree", async () => {
  const project = await mkdtemp(join(process.cwd(), "spindle-update-invalid-no-git-"));
  try {
    const result = runCliRaw(project, ["update", "--stack", "python"], "");
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/unknown option.*--stack/i);
    expect(result.stderr).not.toMatch(/Git working-tree root/i);
    expect(await readdir(project)).toEqual([]);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("valid update requires Git discovery outside a working tree", async () => {
  const project = await mkdtemp(join(process.cwd(), "spindle-update-valid-no-git-"));
  try {
    for (const searchPath of [process.env.PATH ?? "", ""]) {
      const result = runCliRaw(project, ["update", "--no-interactive"], searchPath);
      expect(result.status).not.toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toMatch(/Git working-tree root/i);
      expect(await readdir(project)).toEqual([]);
    }
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("update rejects inapplicable options, unexpected arguments, and invalid conflict choices", async () => {
  const invalidInvocations: [string[], RegExp][] = [
    [["--stack", "python"], /unknown option.*--stack/i],
    [["unexpected"], /too many arguments/i],
    [["--on-conflict", "prompt"], /allowed choices.*overwrite.*skip/i],
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
    for (const flag of ["--on-conflict", "--include-new", "--no-interactive", "--help"]) {
      expect(result.stdout.includes(flag), flag).toBeTruthy();
    }
    expect(result.stdout).toMatch(/spindle update/);
    expect(result.stdout).toMatch(/Reads stacks and variables from \.github\/spindle\.json/);
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
      try {
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

        const result = runCli(
          project,
          ["update", "--no-interactive", "--on-conflict", "overwrite"],
          process.env.PATH ?? "",
          {
            SPINDLE_BLUEPRINTS_DIR: stubs,
          },
        );
        expect(result.status, label).not.toBe(0);
        expect(result.stderr, label).toMatch(/symbolic link/i);
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
      } finally {
        await rm(project, { recursive: true, force: true });
      }
    }
  },
);
