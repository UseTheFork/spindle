import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
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
      `---\nmeta:\n  spindle:\n    version: ${version}\n---\nfresh ${name} owner={{ variables.owner }} stacks={% for s in stacks %}{{ s }};{% endfor %}\n`,
    );
  }
});

after(async () => {
  await rm(justDirectory, { recursive: true, force: true });
  await rm(stubs, { recursive: true, force: true });
});

const skill = (version: string | null, body = "old") =>
  `---\n${version === null ? "" : `meta:\n  spindle:\n    version: ${version}\n`}---\n${body}\n`;

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

test("update regenerates shipped Just Modules and installs newly shipped modules", async () => {
  const blueprints = await makeTempDir("spindle-update-just-blueprints-");
  const project = await makeTempDir();
  const moduleOutput = join(blueprints, "just");
  try {
    for (const [name, content] of [
      ["quality", "shared recipe\n"],
      ["fresh", "newly shipped recipe\n"],
    ]) {
      await mkdir(join(moduleOutput, name), { recursive: true });
      await writeFile(join(moduleOutput, name, "JUSTMODULE.just"), content);
    }
    await mkdir(join(moduleOutput, "quality", "stacks", "python"), { recursive: true });
    await mkdir(join(moduleOutput, "quality", "stacks", "typescript"), { recursive: true });
    await writeFile(
      join(moduleOutput, "quality", "stacks", "python", "JUSTMODULE.just"),
      "python recipe\n",
    );
    await writeFile(
      join(moduleOutput, "quality", "stacks", "typescript", "JUSTMODULE.just"),
      "typescript recipe\n",
    );
    const installed = join(project, ".github/scripts/just-modules");
    await mkdir(installed, { recursive: true });
    await writeFile(join(installed, "quality.just"), "stale generated content\n");
    await mkdir(join(project, ".github"), { recursive: true });
    await writeFile(
      join(project, ".github/spindle.json"),
      JSON.stringify({ stacks: ["python"], variables: {} }),
    );

    const result = runCli(project, ["update", "--no-interactive"], pathWith(justDirectory), {
      SPINDLE_BLUEPRINTS_DIR: blueprints,
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      await readFile(join(installed, "quality.just"), "utf8"),
      "shared recipe\n\npython recipe\n",
    );
    assert.equal(await readFile(join(installed, "fresh.just"), "utf8"), "newly shipped recipe\n");
    assert.equal(
      await readFile(join(project, "justfile"), "utf8"),
      [
        "mod fresh '.github/scripts/just-modules/fresh.just'",
        "mod quality '.github/scripts/just-modules/quality.just'",
        "",
      ].join("\n"),
    );
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("update cleans obsolete direct modules and reconciles imports deterministically", async () => {
  const blueprints = await makeTempDir("spindle-update-just-reconcile-blueprints-");
  const project = await makeTempDir();
  const modules = join(blueprints, "just");
  const installed = join(project, ".github/scripts/just-modules");
  const originalJustfile = [
    "# User-owned header",
    "mod local '.github/other.just'",
    "",
    "# Keep this recipe",
    "ready:",
    "  @echo ready",
    "mod zeta '.github/scripts/just-modules/zeta.just'",
    "mod retired '.github/scripts/just-modules/retired.just'",
    "mod alpha '.github/scripts/just-modules/alpha.just'",
    "mod zeta '.github/scripts/just-modules/zeta.just'",
  ].join("\r\n");
  try {
    for (const [name, content] of [
      ["zeta", "new zeta recipe\n"],
      ["alpha", "new alpha recipe\n"],
    ]) {
      await mkdir(join(modules, name), { recursive: true });
      await writeFile(join(modules, name, "JUSTMODULE.just"), content);
    }
    await mkdir(installed, { recursive: true });
    await mkdir(join(installed, "nested"), { recursive: true });
    await writeFile(join(installed, "retired.just"), "obsolete\n");
    await writeFile(join(installed, "notes.txt"), "preserve non-module file\n");
    await writeFile(join(installed, "nested", "retired.just"), "preserve nested file\n");
    await writeFile(join(project, ".github/spindle.json"), JSON.stringify(goodConfig));
    await writeFile(join(project, "justfile"), originalJustfile);

    const update = () =>
      runCli(project, ["update", "--no-interactive"], pathWith(justDirectory), {
        SPINDLE_BLUEPRINTS_DIR: blueprints,
      });
    const first = update();
    assert.equal(first.status, 0, first.stderr);
    const reconciledJustfile = [
      "# User-owned header",
      "mod local '.github/other.just'",
      "",
      "# Keep this recipe",
      "ready:",
      "  @echo ready",
      "",
      "mod alpha '.github/scripts/just-modules/alpha.just'",
      "mod zeta '.github/scripts/just-modules/zeta.just'",
    ].join("\r\n");
    assert.equal(await readFile(join(project, "justfile"), "utf8"), reconciledJustfile);
    assert.equal(await readFile(join(installed, "alpha.just"), "utf8"), "new alpha recipe\n");
    assert.equal(await readFile(join(installed, "zeta.just"), "utf8"), "new zeta recipe\n");
    await assert.rejects(readFile(join(installed, "retired.just")));
    assert.equal(
      await readFile(join(installed, "notes.txt"), "utf8"),
      "preserve non-module file\n",
    );
    assert.equal(
      await readFile(join(installed, "nested", "retired.just"), "utf8"),
      "preserve nested file\n",
    );

    const second = update();
    assert.equal(second.status, 0, second.stderr);
    assert.equal(await readFile(join(project, "justfile"), "utf8"), reconciledJustfile);
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("update removes obsolete Just Modules and imports when the shipped catalog is empty", async () => {
  const blueprints = await makeTempDir("spindle-update-empty-just-blueprints-");
  const project = await makeTempDir();
  const installed = join(project, ".github/scripts/just-modules");
  const unrelatedJustfile = [
    "# User-owned header",
    "mod local '.github/other.just'",
    "",
    "ready:",
    "  @echo ready",
  ].join("\r\n");
  try {
    await mkdir(join(blueprints, "just"));
    await mkdir(join(installed, "nested"), { recursive: true });
    await writeFile(join(installed, "retired.just"), "obsolete\n");
    await writeFile(join(installed, "old.just"), "also obsolete\n");
    await writeFile(join(installed, "notes.txt"), "preserve non-module file\n");
    await writeFile(join(installed, "nested", "retired.just"), "preserve nested file\n");
    await writeFile(join(project, ".github/spindle.json"), JSON.stringify(goodConfig));
    await writeFile(
      join(project, "justfile"),
      [
        "mod retired '.github/scripts/just-modules/retired.just'",
        "mod old '.github/scripts/just-modules/old.just'",
        unrelatedJustfile,
      ].join("\r\n"),
    );

    const result = runCli(project, ["update", "--no-interactive"], pathWith(justDirectory), {
      SPINDLE_BLUEPRINTS_DIR: blueprints,
    });

    assert.equal(result.status, 0, result.stderr);
    await assert.rejects(readFile(join(installed, "retired.just")), { code: "ENOENT" });
    await assert.rejects(readFile(join(installed, "old.just")), { code: "ENOENT" });
    assert.equal(await readFile(join(project, "justfile"), "utf8"), unrelatedJustfile);
    assert.equal(
      await readFile(join(installed, "notes.txt"), "utf8"),
      "preserve non-module file\n",
    );
    assert.equal(
      await readFile(join(installed, "nested", "retired.just"), "utf8"),
      "preserve nested file\n",
    );
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("update rejects Just Module import conflicts before changing generated outputs", async () => {
  const blueprints = await makeTempDir("spindle-update-just-conflict-blueprints-");
  const project = await makeTempDir();
  try {
    const source = join(blueprints, "just", "quality");
    const installed = join(project, ".github/scripts/just-modules");
    const originalJustfile = "mod quality '.github/custom/quality.just'\n";
    await mkdir(source, { recursive: true });
    await writeFile(join(source, "JUSTMODULE.just"), "new generated content\n");
    await mkdir(installed, { recursive: true });
    await writeFile(join(installed, "quality.just"), "keep existing generated content\n");
    await writeFile(join(installed, "obsolete.just"), "keep obsolete generated content\n");
    await writeFile(join(project, ".github/spindle.json"), JSON.stringify(goodConfig));
    await writeFile(join(project, "justfile"), originalJustfile);

    const result = runCli(project, ["update", "--no-interactive"], pathWith(justDirectory), {
      SPINDLE_BLUEPRINTS_DIR: blueprints,
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Just Module import conflict.*quality/i);
    assert.equal(
      await readFile(join(installed, "quality.just"), "utf8"),
      "keep existing generated content\n",
    );
    assert.equal(
      await readFile(join(installed, "obsolete.just"), "utf8"),
      "keep obsolete generated content\n",
    );
    assert.equal(await readFile(join(project, "justfile"), "utf8"), originalJustfile);
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("update combines shared files and selected Stack overlays only", async () => {
  const blueprints = await makeTempDir("spindle-update-overlay-blueprints-");
  const skillDirectory = join(blueprints, "skills", "demo");
  try {
    await mkdir(join(skillDirectory, "stacks", "python"), { recursive: true });
    await mkdir(join(skillDirectory, "stacks", "typescript"), { recursive: true });
    await mkdir(join(skillDirectory, "stacks", "php-laravel"), { recursive: true });
    await writeFile(
      join(skillDirectory, "SKILL.md"),
      "---\nname: demo\nmeta:\n  spindle:\n    version: 2.0.0\n---\n# updated\n",
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
          await readFile(join(project, ".github/skills/demo/typescript.txt"), "utf8"),
          "typescript content\n",
        );
        await assert.rejects(readFile(join(project, ".github/skills/demo/php.txt")));
      },
      blueprints,
    );
  } finally {
    await rm(blueprints, { recursive: true, force: true });
  }
});

test("update reads Skill metadata from a selected overlay when no shared SKILL.md exists", async () => {
  const blueprints = await makeTempDir("spindle-update-overlay-skill-blueprints-");
  const skillDirectory = join(blueprints, "skills", "demo");
  try {
    await mkdir(join(skillDirectory, "stacks", "python"), { recursive: true });
    await writeFile(join(skillDirectory, "stacks", "python", "SKILL.md"), skill("2.0.0", "new"));

    await withProject(
      { config: { stacks: ["python"], variables: {} }, skills: { demo: skill("1.0.0") } },
      ["--no-interactive", "--on-conflict", "overwrite"],
      async (project, result) => {
        assert.equal(result.status, 0, result.stderr);
        assert.equal(await read(project, "demo"), skill("2.0.0", "new"));
      },
      blueprints,
    );
  } finally {
    await rm(blueprints, { recursive: true, force: true });
  }
});

test("update rejects colliding selected overlays before replacing an installed Skill", async () => {
  const blueprints = await makeTempDir("spindle-update-collision-blueprints-");
  const skillDirectory = join(blueprints, "skills", "demo");
  try {
    await mkdir(join(skillDirectory, "stacks", "python"), { recursive: true });
    await mkdir(join(skillDirectory, "stacks", "typescript"), { recursive: true });
    await writeFile(
      join(skillDirectory, "SKILL.md"),
      "---\nname: demo\nmeta:\n  spindle:\n    version: 2.0.0\n---\n# updated\n",
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
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /duplicate blueprint output path 'shared-path\.txt'/i);
        assert.match(result.stderr, /stacks[\\/]python[\\/]shared-path\.txt/i);
        assert.match(result.stderr, /stacks[\\/]typescript[\\/]shared-path\.txt/i);
        assert.equal(await read(project, "demo"), skill("1.0.0"));
        await assert.rejects(readFile(join(project, ".github/skills/demo/shared-path.txt")));
      },
      blueprints,
    );
  } finally {
    await rm(blueprints, { recursive: true, force: true });
  }
});

test("update rejects file directory prefix collisions before replacing an installed Skill", async () => {
  const blueprints = await makeTempDir("spindle-update-prefix-collision-blueprints-");
  const skillDirectory = join(blueprints, "skills", "demo");
  try {
    await mkdir(join(skillDirectory, "stacks", "python", "docs"), { recursive: true });
    await writeFile(
      join(skillDirectory, "SKILL.md"),
      "---\nname: demo\nmeta:\n  spindle:\n    version: 2.0.0\n---\n# updated\n",
    );
    await writeFile(join(skillDirectory, "docs"), "shared file\n");
    await writeFile(
      join(skillDirectory, "stacks", "python", "docs", "readme.md"),
      "overlay child file\n",
    );

    await withProject(
      { config: goodConfig, skills: { demo: skill("1.0.0") } },
      ["--no-interactive", "--on-conflict", "overwrite"],
      async (project, result) => {
        assert.notEqual(result.status, 0);
        assert.equal(await read(project, "demo"), skill("1.0.0"));
        assert.equal(
          await readFile(join(project, ".github/skills/demo/extra.txt"), "utf8"),
          "stale",
        );
        assert.match(result.stderr, /file.directory prefix conflict/i);
        assert.match(result.stderr, /'docs'.*'docs[\\/]readme\.md'/i);
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
      assert.equal(result.status, 0, result.stderr);
      assert.equal(
        await read(project, "newer"),
        "---\nmeta:\n  spindle:\n    version: 2.0.0\n---\nfresh newer owner=core stacks=python;typescript;\n",
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

test("update reads a Nunjucks-rendered nested Skill version", async () => {
  const blueprints = await makeTempDir("spindle-update-nested-templated-version-");
  const skillFile = join(blueprints, "skills", "demo", "SKILL.md");
  const installed = "---\nmeta:\n  spindle:\n    version: 1.0.0\n---\nlocal\n";
  try {
    await mkdir(join(blueprints, "skills", "demo"), { recursive: true });
    await writeFile(
      skillFile,
      [
        "---",
        "meta:",
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
        assert.equal(result.status, 0, result.stderr);
        assert.equal(
          await read(project, "demo"),
          "---\nmeta:\n  vendor:\n    version: 8.0.0\n  spindle:\n    version: 2.0.0\n---\nrendered 2.0.0\n",
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
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /no valid semver version/);
        assert.equal(await read(project, "demo"), skill("1.0.0"));
      },
      blueprints,
    );

    await writeFile(source, "---\nmeta:\n  spindle:\n    version: 2.0.0\n---\nshipped\n");
    const legacyInstalled = "---\nversion: 9.0.0\n---\nlocal\n";
    await withProject(
      { config: goodConfig, skills: { demo: legacyInstalled } },
      ["--no-interactive", "--on-conflict", "overwrite"],
      async (project, result) => {
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stderr, /Skill 'demo'.*no version/);
        assert.equal(await read(project, "demo"), legacyInstalled);
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
  const original = "---\nmeta:\n  spindle:\n    version: 1.0.0\n---\nlocal\n";
  const configText = JSON.stringify({ stacks: ["python"], variables: {} });
  try {
    await mkdir(join(blueprints, "skills", "demo"), { recursive: true });
    await writeFile(
      join(blueprints, "skills", "demo", "SKILL.md"),
      "---\nmeta:\n  spindle:\n    version: 1.0.0\n---\nunused {{ variables.not_supplied }}\n",
    );
    await mkdir(join(installed, ".."), { recursive: true });
    await writeFile(installed, original);
    await writeFile(join(project, ".github", "spindle.json"), configText);

    const result = runCli(project, ["update", "--no-interactive"], pathWith(justDirectory), {
      SPINDLE_BLUEPRINTS_DIR: blueprints,
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /undefined|not_supplied/i);
    assert.equal(await readFile(installed, "utf8"), original);
    assert.equal(await readFile(join(project, ".github", "spindle.json"), "utf8"), configText);
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
  const original = "---\nmeta:\n  spindle:\n    version: 1.0.0\n---\nlocal\n";
  const changedSource = "---\nmeta:\n  spindle:\n    version: 3.0.0\n---\nchanged after planning\n";
  try {
    await mkdir(join(blueprints, "skills", "demo"), { recursive: true });
    await writeFile(source, "---\nmeta:\n  spindle:\n    version: 2.0.0\n---\nshipped\n");
    await mkdir(join(installed, ".."), { recursive: true });
    await writeFile(installed, original);
    await writeFile(
      join(project, ".github", "spindle.json"),
      JSON.stringify({ stacks: ["python"], variables: { owner: "team" } }),
    );

    const result = await runCliInteractive(
      project,
      ["update"],
      pathWith(justDirectory),
      [
        {
          trigger: "What should happen?",
          input: "\r",
          beforeInput: () => writeFileSync(source, changedSource),
        },
      ],
      { SPINDLE_BLUEPRINTS_DIR: blueprints },
    );

    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /changed while planning/);
    assert.equal(await readFile(installed, "utf8"), original);
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("update aborts on malformed installed Skill YAML before replacing another Skill", async () => {
  const blueprints = await makeTempDir("spindle-malformed-skill-blueprints-");
  const malformed =
    "---\nname: broken\nmeta:\n  spindle:\n    version: [unterminated\n---\nlocal broken Skill\n";
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
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /flow collection|end of the stream|YAML/i);
        assert.equal(await read(project, "a-outdated"), skill("1.0.0", "local"));
        assert.equal(await read(project, "z-broken"), malformed);
        assert.equal(
          await readFile(join(project, ".github", "skills", "a-outdated", "extra.txt"), "utf8"),
          "stale",
        );
        assert.equal(await readFile(join(project, ".github", "spindle.json"), "utf8"), config);
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
        assert.doesNotMatch(
          result.stdout,
          /owner: Team owner|lint_command: Lint command|Which new Skills/,
        );
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
        `---\nmeta:\n  spindle:\n    version: ${version}\n---\nfresh ${name} owner={{ variables.owner }} lint={{ variables.lint_command }} stacks={% for s in stacks %}{{ s }};{% endfor %}\n`,
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
            /fresh newer owner=configured lint=just lint stacks=python;/,
          );
          assert.match(
            await read(project, "absent"),
            /fresh absent owner=configured lint=just lint stacks=python;/,
          );
          assert.deepEqual(
            JSON.parse(await readFile(join(project, ".github/spindle.json"), "utf8")),
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
        `---\nmeta:\n  spindle:\n    version: 1.0.0\n---\n${body}\n`,
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
          assert.match(`${result.stdout}\n${result.stderr}`, /undefined|undefinedValue/i);
          await assert.rejects(readFile(join(project, ".github/skills/alpha-new/SKILL.md")));
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
        assert.equal(result.status, 0, result.stdout);
        assert.doesNotMatch(result.stdout, /forced Config write failure/);
        assert.match(await read(project, "absent"), /fresh absent owner=configured/);
        assert.deepEqual(
          JSON.parse(await readFile(join(project, ".github/spindle.json"), "utf8")),
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
      config: { stacks: ["php-laravel"], variables: { owner: "edited" } },
      skills: { newer: skill("1.0.0") },
    },
    ["--no-interactive", "--on-conflict", "overwrite"],
    async (project, result) => {
      assert.equal(result.status, 0, result.stderr);
      assert.match(await read(project, "newer"), /owner=edited stacks=php-laravel;/);
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
      assert.equal(result.status, 0, result.stderr);
      assert.match(await read(project, "newer"), /owner=nobody/);
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
            SPINDLE_BLUEPRINTS_DIR: stubs,
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
