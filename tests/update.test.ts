import assert from "node:assert/strict";
import { cp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { makeJustStubDir, makeTempDir, pathWith, runCli, runCliInteractive } from "./helpers.ts";

let justDirectory: string;
let stubs: string;

before(async () => {
  justDirectory = await makeJustStubDir();
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
      `---\nversion: ${version}\n---\nfresh ${name} owner={{ variables.owner }} stacks={% for s in stacks %}{{ s }};{% endfor %}\n`,
    );
  }
  await writeFile(
    join(stubs, "variables.json"),
    JSON.stringify([
      { name: "owner", description: "Owner", default: "nobody" },
      { name: "needed", description: "Needed" },
    ]),
  );
});

after(async () => {
  await rm(justDirectory, { recursive: true, force: true });
  await rm(stubs, { recursive: true, force: true });
});

const skill = (version: string | null, body = "old") =>
  `---\n${version === null ? "" : `version: ${version}\n`}---\n${body}\n`;

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
  check: (project: string, result: CliResult) => Promise<void>,
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
    const result = await runner(project, ["update", ...args], pathWith(justDirectory), {
      SPINDLE_STUBS_DIR: stubsDir,
    });
    await check(project, result);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
}

const read = (project: string, name: string) =>
  readFile(join(project, ".github/skills", name, "SKILL.md"), "utf8");

const goodConfig = { stacks: ["python", "typescript"], variables: { owner: "core", needed: "x" } };

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
      assert.equal(result.status, 0, result.stderr);
      assert.equal(
        await read(project, "newer"),
        "---\nversion: 2.0.0\n---\nfresh newer owner=core stacks=python;typescript;\n",
      );
      assert.equal(await read(project, "equal"), skill("1.0.0"));
      assert.equal(await read(project, "lower"), skill("9.0.0"));
      assert.equal(await read(project, "missing"), skill(null));
      assert.equal(await read(project, "bad"), skill("v1"));
      await assert.rejects(readFile(join(project, ".github/skills/newer/extra.txt")));
      await assert.rejects(read(project, "absent"));
      assert.equal(await readFile(join(project, ".github/spindle.json"), "utf8"), configText);
      assert.match(result.stderr, /missing.*no version/);
      assert.match(result.stderr, /bad.*non-semver version 'v1'/);
      assert.match(result.stdout, /Added 0, updated 1, skipped 3, up to date 2 skill\(s\)/);
    },
  );
});

test("--on-conflict skip leaves outdated skills untouched", async () => {
  await withProject(
    { config: goodConfig, skills: { newer: skill("1.0.0") } },
    ["--no-interactive", "--on-conflict", "skip"],
    async (project, result) => {
      assert.equal(result.status, 0, result.stderr);
      assert.equal(await read(project, "newer"), skill("1.0.0"));
      assert.match(result.stdout, /Added 0, updated 0, skipped 6, up to date 0 skill\(s\)/);
    },
  );
});

test("non-interactive without a policy errors naming the flag and writes nothing", async () => {
  await withProject(
    { config: goodConfig, skills: { newer: skill("1.0.0") } },
    ["--no-interactive"],
    async (project, result) => {
      assert.equal(result.status, 1);
      assert.match(result.stderr, /--on-conflict/);
      assert.equal(await read(project, "newer"), skill("1.0.0"));
    },
  );
});

test("--include-new does not waive the outdated-Skill conflict policy", async () => {
  await withProject(
    { config: goodConfig, skills: { newer: skill("1.0.0") } },
    ["--no-interactive", "--include-new"],
    async (project, result) => {
      assert.equal(result.status, 1);
      assert.match(result.stderr, /--on-conflict/);
      assert.equal(await read(project, "newer"), skill("1.0.0"));
      await assert.rejects(read(project, "absent"));
    },
  );
});

test("nothing outdated needs no policy", async () => {
  await withProject(
    { config: goodConfig, skills: { equal: skill("1.0.0") } },
    ["--no-interactive"],
    async (_project, result) => {
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /Added 0, updated 0, skipped 5, up to date 1 skill\(s\)/);
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
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /Added 0, updated 0, skipped 1, up to date 5 skill\(s\)/);
      assert.equal(await read(project, "newer"), skill("2.0.0"));
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
        assert.equal(result.status, 0, result.stdout);
        assert.doesNotMatch(result.stdout, /needed: Needed|Which new Skills/);
        assert.match(result.stdout, /Added 0, updated 0, skipped 0, up to date 6 skill\(s\)/);
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
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stderr, /missing.*no version/);
      assert.match(result.stderr, /bad.*non-semver version 'v1'/);
      assert.match(result.stdout, /Added 0, updated 0, skipped 4, up to date 2 skill\(s\)/);
      assert.equal(await read(project, "newer"), skill("1.0.0"));
      await assert.rejects(read(project, "absent"));
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
      assert.equal(result.status, 0, result.stderr);
      assert.match(
        await read(project, "absent"),
        /fresh absent owner=core stacks=python;typescript;/,
      );
      assert.match(result.stdout, /Added 1, updated 0, skipped 0, up to date 5 skill\(s\)/);
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
      assert.equal(result.status, 0, result.stderr);
      await assert.rejects(read(project, "absent"));
      assert.match(result.stdout, /Added 0, updated 0, skipped 1, up to date 5 skill\(s\)/);
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
          assert.equal(result.status, 0, result.stdout);
          assert.equal(
            await readFile(join(project, ".github/skills/absent/SKILL.md"), "utf8").then(
              () => true,
              () => false,
            ),
            selected,
            result.stdout,
          );
          assert.match(
            result.stdout,
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
  "prompted Variables render every changed Skill and merge into Config after success",
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
        `---\nversion: ${version}\n---\nfresh ${name} owner={{ variables.owner }} needed={{ variables.needed }} stacks={% for s in stacks %}{{ s }};{% endfor %}\n`,
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
          assert.equal(result.status, 0, result.stdout);
          assert.match(result.stdout, /Added 1, updated 1, skipped 0, up to date 4 skill\(s\)/);
          assert.match(
            await read(project, "newer"),
            /fresh newer owner=configured needed=shared-answer stacks=python;/,
          );
          assert.match(
            await read(project, "absent"),
            /fresh absent owner=configured needed=shared-answer stacks=python;/,
          );
          assert.deepEqual(
            JSON.parse(await readFile(join(project, ".github/spindle.json"), "utf8")),
            {
              ...projectConfig,
              variables: { owner: "configured", needed: "shared-answer" },
            },
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
              { trigger: "needed: Needed", input: "shared-answer\r" },
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
  "installation failure stops later Skills and does not persist prompted Variables",
  { skip: process.platform !== "linux" },
  async () => {
    const failureStubs = await makeTempDir("spindle-update-failure-stubs-");
    await cp(stubs, failureStubs, { recursive: true });
    const newSkills = [
      ["alpha-new", "rendered {{ variables.needed }}"],
      ["beta-new", "will fail {{ variables.undefinedValue }}"],
      ["zeta-new", "must never install"],
    ] as const;
    for (const [name, body] of newSkills) {
      await mkdir(join(failureStubs, "skills", name), { recursive: true });
      await writeFile(
        join(failureStubs, "skills", name, "SKILL.md"),
        `---\nversion: 1.0.0\n---\n${body}\n`,
      );
    }
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
          assert.notEqual(result.status, 0);
          assert.equal(
            await readFile(join(project, ".github/skills/alpha-new/SKILL.md"), "utf8"),
            "---\nversion: 1.0.0\n---\nrendered shared-answer\n",
          );
          await assert.rejects(readFile(join(project, ".github/skills/zeta-new/SKILL.md")));
          assert.deepEqual(
            JSON.parse(await readFile(join(project, ".github/spindle.json"), "utf8")),
            originalConfig,
          );
        },
        failureStubs,
        (project, args, searchPath, env) =>
          runCliInteractive(
            project,
            args,
            searchPath,
            [
              { trigger: "Enter: confirm", input: "\r" },
              { trigger: "needed: Needed", input: "shared-answer\r" },
            ],
            env,
          ),
      );
    } finally {
      await rm(failureStubs, { recursive: true, force: true });
    }
  },
);

test(
  "Config write failure is reported without rolling back installed Skills",
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
        assert.equal(result.status, 1);
        assert.match(result.stdout, /forced Config write failure/);
        assert.match(await read(project, "absent"), /fresh absent owner=configured/);
        assert.deepEqual(
          JSON.parse(await readFile(join(project, ".github/spindle.json"), "utf8")),
          originalConfig,
        );
      },
      stubs,
      (project, args, searchPath, env) =>
        runCliInteractive(
          project,
          args,
          searchPath,
          [{ trigger: "needed: Needed", input: "shared-answer\r" }],
          { ...env, NODE_OPTIONS: `--import=${failureHook}` },
        ),
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
        assert.notEqual(result.status, 0);
        assert.equal(await read(project, "newer"), skill("1.0.0"));
        await assert.rejects(read(project, "absent"));
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
      config: { stacks: ["php-laravel"], variables: { owner: "edited", needed: "x" } },
      skills: { newer: skill("1.0.0") },
    },
    ["--no-interactive", "--on-conflict", "overwrite"],
    async (project, result) => {
      assert.equal(result.status, 0, result.stderr);
      assert.match(await read(project, "newer"), /owner=edited stacks=php-laravel;/);
    },
  );
});

test("variables missing from the config fall back to the default; required ones error", async () => {
  await withProject(
    {
      config: { stacks: ["python"], variables: { needed: "x" } },
      skills: { newer: skill("1.0.0") },
    },
    ["--no-interactive", "--on-conflict", "overwrite"],
    async (project, result) => {
      assert.equal(result.status, 0, result.stderr);
      assert.match(await read(project, "newer"), /owner=nobody/);
    },
  );
  await withProject(
    { config: { stacks: ["python"], variables: {} }, skills: { newer: skill("1.0.0") } },
    ["--no-interactive", "--on-conflict", "overwrite"],
    async (project, result) => {
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Variable 'needed'/);
      assert.equal(await read(project, "newer"), skill("1.0.0"));
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
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Invalid stack 'cobol'/);
      assert.equal(await read(project, "newer"), skill("1.0.0"));
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
        assert.equal(result.status, 1);
        assert.match(result.stderr, /spindle init/);
        assert.equal(await read(project, "newer"), skill("1.0.0"));
      },
    );
  }
});

test("update still requires just", async () => {
  const project = await makeTempDir();
  try {
    const result = runCli(project, ["update", "--no-interactive"], "/nonexistent");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /just/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("update --help documents its flags", async () => {
  await withProject({}, ["--help"], async (_project, result) => {
    assert.equal(result.status, 0);
    for (const flag of ["--on-conflict", "--include-new", "--no-interactive", "--help"]) {
      assert.ok(result.stdout.includes(flag), flag);
    }
    assert.match(result.stdout, /spindle update/);
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
          pathWith(justDirectory),
          {
            SPINDLE_STUBS_DIR: stubs,
          },
        );
        assert.notEqual(result.status, 0, label);
        assert.match(result.stderr, /symbolic link/i, label);
        assert.equal(await readFile(join(outside, "sentinel"), "utf8"), "keep", label);
        if (link === "github") {
          assert.equal(
            await readFile(join(outside, "skills", "newer", "SKILL.md"), "utf8"),
            skill("1.0.0"),
          );
        } else if (link === "skills") {
          assert.equal(await readFile(join(outside, "newer", "SKILL.md"), "utf8"), skill("1.0.0"));
        } else {
          assert.equal(await readFile(join(outside, "SKILL.md"), "utf8"), skill("1.0.0"));
        }
      } finally {
        await rm(project, { recursive: true, force: true });
      }
    }
  },
);
