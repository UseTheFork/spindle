import assert from "node:assert/strict";
import { cp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";

import {
  blueprintCatalog,
  validateBlueprintCatalog,
  type BlueprintCatalogDefinition,
} from "../src/blueprints/catalog.ts";
import {
  makeTempDir,
  runCli as runBundledCli,
  runCliWithCatalog as runCli,
  writeCatalogFixture,
} from "./helpers.ts";

test("catalog validation preserves schema and path diagnostics for static definitions", () => {
  const entry = { path: "selected.agent.md", status: "active", stacks: [] };
  const definition = (value: unknown) => ({
    agents: { selected: value },
    instructions: {},
    skills: {},
  });
  const cases: { data: unknown; diagnostic: RegExp }[] = [
    { data: null, diagnostic: /must be an object/ },
    { data: { agents: {}, instructions: {} }, diagnostic: /missing required 'skills'/ },
    { data: { ...definition(entry), other: {} }, diagnostic: /Unknown Blueprint Catalog kind/ },
    { data: { ...definition(entry), agents: [] }, diagnostic: /must be a mapping/ },
    { data: definition(null), diagnostic: /must be an entry mapping/ },
    { data: definition({ ...entry, extra: true }), diagnostic: /Unknown field 'extra'/ },
    {
      data: definition({ path: entry.path, status: "active" }),
      diagnostic: /missing required 'stacks'/,
    },
    { data: definition({ ...entry, status: "retired" }), diagnostic: /Invalid status/ },
    {
      data: definition({ ...entry, stacks: "python" }),
      diagnostic: /must be a list of Stack names/,
    },
    { data: definition({ ...entry, stacks: ["ruby"] }), diagnostic: /Invalid Stack 'ruby'/ },
    {
      data: { agents: {}, instructions: {}, skills: { selected: entry } },
      diagnostic: /must select a directory/,
    },
  ];
  for (const path of [
    "",
    "/",
    "../escape",
    "/absolute",
    "C:/absolute",
    "a\\b",
    "a//b",
    "./a",
    "*.md",
  ]) {
    cases.push({
      data: definition({ ...entry, path }),
      diagnostic: /non-empty relative path|unsafe/,
    });
  }
  for (const { data, diagnostic } of cases) {
    assert.throws(() => validateBlueprintCatalog(data), diagnostic);
  }
});

test("static catalog normalization preserves logical keys, directories, and Stack selection data", () => {
  assert.deepEqual(
    validateBlueprintCatalog({
      agents: {
        reviewer: {
          path: "group/reviewer.agent.md",
          status: "active",
          stacks: ["python", "typescript"],
        },
      },
      instructions: {},
      skills: { retired: { path: "retired/", status: "removed", stacks: [] } },
    }),
    {
      agents: [
        {
          key: "reviewer",
          path: "group/reviewer.agent.md",
          directory: false,
          status: "active",
          stacks: ["python", "typescript"],
        },
      ],
      instructions: [],
      skills: [{ key: "retired", path: "retired", directory: true, status: "removed", stacks: [] }],
    },
  );
});

test("init selects supported catalog entries and preserves their source paths", async () => {
  const blueprints = await makeTempDir("spindle-catalog-blueprints-");
  const project = await makeTempDir("spindle-catalog-project-");
  const env = { SPINDLE_BLUEPRINTS_DIR: blueprints };
  const agent = [
    "---",
    "name: reviewer",
    "description: Catalog-selected reviewer",
    "metadata:",
    "  spindle:",
    "    version: 1.0.0",
    "---",
    "Agent body",
    "",
  ].join("\n");
  const instruction = [
    "---",
    "name: checks",
    "description: Catalog-selected instruction",
    "metadata:",
    "  spindle:",
    "    version: 1.0.0",
    "---",
    "Instruction body",
    "",
  ].join("\n");
  try {
    writeCatalogFixture(blueprints, {
      agents: {
        shared: {
          path: "grouped/reviewer.agent.md",
          status: "active",
          stacks: ["python"],
        },
        retired: {
          path: "retired.agent.md",
          status: "removed",
          stacks: [],
        },
      },
      instructions: {
        shared: {
          path: "grouped/",
          status: "active",
          stacks: [],
        },
      },
      skills: {
        shared: {
          path: "authoring/",
          status: "active",
          stacks: [],
        },
      },
    } satisfies BlueprintCatalogDefinition);
    await mkdir(join(blueprints, "agents", "grouped"), { recursive: true });
    await writeFile(join(blueprints, "agents", "grouped", "reviewer.agent.md"), agent);
    await mkdir(join(blueprints, "instructions", "grouped", "stacks"), { recursive: true });
    await writeFile(
      join(blueprints, "instructions", "grouped", "checks.instructions.md"),
      instruction,
    );
    await writeFile(
      join(blueprints, "instructions", "grouped", "stacks", "nested.instructions.md"),
      instruction,
    );
    const instructionAsset = Buffer.from([0x00, 0x7f, 0xfe, 0x41]);
    await mkdir(join(blueprints, "instructions", "grouped", "assets"), { recursive: true });
    await writeFile(
      join(blueprints, "instructions", "grouped", "assets", "attachment.bin"),
      instructionAsset,
    );
    await mkdir(join(blueprints, "skills", "authoring", "stacks"), { recursive: true });
    await writeFile(
      join(blueprints, "skills", "authoring", "SKILL.md"),
      "---\nname: authoring\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nSkill body\n",
    );
    await writeFile(
      join(blueprints, "skills", "authoring", "stacks", "notes.txt"),
      "ordinary nested directory\n",
    );
    const asset = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]);
    await mkdir(join(blueprints, "skills", "authoring", "assets"), { recursive: true });
    await writeFile(join(blueprints, "skills", "authoring", "assets", "logo.png"), asset);
    await mkdir(join(blueprints, "skills", "unlisted"), { recursive: true });
    await writeFile(
      join(blueprints, "skills", "unlisted", "SKILL.md"),
      "---\nname: unlisted\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nNot selected\n",
    );
    const result = runCli(
      project,
      ["init", "--stack", "python", "--stack", "typescript"],
      process.env.PATH ?? "",
      env,
    );

    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      await readFile(join(project, ".github", "agents", "grouped", "reviewer.agent.md"), "utf8"),
      agent,
    );
    assert.equal(
      await readFile(
        join(project, ".github", "instructions", "grouped", "stacks", "nested.instructions.md"),
        "utf8",
      ),
      instruction,
    );
    assert.deepEqual(
      await readFile(
        join(project, ".github", "instructions", "grouped", "assets", "attachment.bin"),
      ),
      instructionAsset,
    );
    assert.equal(
      await readFile(
        join(project, ".github", "skills", "authoring", "stacks", "notes.txt"),
        "utf8",
      ),
      "ordinary nested directory\n",
    );
    assert.deepEqual(
      await readFile(join(project, ".github", "skills", "authoring", "assets", "logo.png")),
      asset,
    );
    assert.deepEqual(await readdir(join(project, ".github", "skills")), ["authoring"]);
    await assert.rejects(readFile(join(project, ".github", "agents", "retired.agent.md")));
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("init selects a catalog entry scoped to the php-laravel Stack", async () => {
  const blueprints = await makeTempDir("spindle-catalog-php-laravel-blueprints-");
  const project = await makeTempDir("spindle-catalog-php-laravel-project-");
  const env = { SPINDLE_BLUEPRINTS_DIR: blueprints };
  const agent = (name: string) =>
    `---\nname: ${name}\ndescription: ${name} agent\nmetadata:\n  spindle:\n    version: 1.0.0\n---\n${name}\n`;
  try {
    writeCatalogFixture(blueprints, {
      agents: {
        laravel: {
          path: "laravel.agent.md",
          status: "active",
          stacks: ["php-laravel"],
        },
        python: {
          path: "python.agent.md",
          status: "active",
          stacks: ["python"],
        },
      },
      instructions: {},
      skills: {},
    } satisfies BlueprintCatalogDefinition);
    await mkdir(join(blueprints, "agents"), { recursive: true });
    await writeFile(join(blueprints, "agents", "laravel.agent.md"), agent("laravel"));
    await writeFile(join(blueprints, "agents", "python.agent.md"), agent("python"));

    const result = runCli(project, ["init", "--stack", "php-laravel"], process.env.PATH ?? "", env);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      await readFile(join(project, ".github", "agents", "laravel.agent.md"), "utf8"),
      agent("laravel"),
    );
    await assert.rejects(readFile(join(project, ".github", "agents", "python.agent.md")));
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("init validates symlinks in active nonmatching catalog directories before project changes", async () => {
  const blueprints = await makeTempDir("spindle-catalog-invalid-blueprints-");
  const project = await makeTempDir("spindle-catalog-invalid-project-");
  const outside = await makeTempDir("spindle-catalog-outside-");
  const env = { SPINDLE_BLUEPRINTS_DIR: blueprints };
  try {
    writeCatalogFixture(blueprints, {
      agents: {},
      instructions: {},
      skills: {
        collection: {
          path: "collection/",
          status: "active",
          stacks: ["typescript"],
        },
      },
    } satisfies BlueprintCatalogDefinition);
    await mkdir(join(blueprints, "skills", "collection"), { recursive: true });
    await writeFile(
      join(blueprints, "skills", "collection", "SKILL.md"),
      "---\nname: collection\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nSkill\n",
    );
    await writeFile(join(outside, "outside.txt"), "outside\n");
    await symlink(
      join(outside, "outside.txt"),
      join(blueprints, "skills", "collection", "linked.txt"),
    );

    const result = runCli(project, ["init", "--stack", "python"], process.env.PATH ?? "", env);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /symbolic link/i);
    await assert.rejects(readdir(join(project, ".github")));
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("update applies version decisions independently to grouped Agents and Instructions", async () => {
  const blueprints = await makeTempDir("spindle-catalog-versioned-blueprints-");
  const project = await makeTempDir("spindle-catalog-versioned-project-");
  const env = { SPINDLE_BLUEPRINTS_DIR: blueprints };
  const versioned = (name: string, version: string, body: string) =>
    `---\nname: ${name}\nmetadata:\n  spindle:\n    version: ${version}\n---\n${body}\n`;
  const writeVersioned = async (kind: string, file: string, content: string) => {
    const path = join(blueprints, kind, "group", file);
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, content);
  };
  try {
    writeCatalogFixture(blueprints, {
      agents: {
        "review-group": {
          path: "group/",
          status: "active",
          stacks: [],
        },
      },
      instructions: {
        "instruction-group": {
          path: "group/",
          status: "active",
          stacks: [],
        },
      },
      skills: {},
    } satisfies BlueprintCatalogDefinition);
    await writeVersioned("agents", "first.agent.md", versioned("first", "1.0.0", "original one"));
    await writeVersioned("agents", "second.agent.md", versioned("second", "1.0.0", "original two"));
    await writeVersioned(
      "instructions",
      "first.instructions.md",
      versioned("first instruction", "1.0.0", "original instruction one"),
    );
    await writeVersioned(
      "instructions",
      "second.instructions.md",
      versioned("second instruction", "1.0.0", "original instruction two"),
    );

    const init = runCli(project, ["init", "--stack", "python"], process.env.PATH ?? "", env);
    assert.equal(init.status, 0, init.stderr);

    await writeVersioned("agents", "first.agent.md", versioned("first", "2.0.0", "updated one"));
    await writeVersioned(
      "agents",
      "second.agent.md",
      versioned("second", "1.0.0", "changed without bump"),
    );
    await writeVersioned("agents", "new.agent.md", versioned("new", "1.0.0", "new Agent"));
    await writeVersioned(
      "instructions",
      "first.instructions.md",
      versioned("first instruction", "2.0.0", "updated instruction"),
    );
    await writeVersioned(
      "instructions",
      "second.instructions.md",
      versioned("second instruction", "1.0.0", "changed without bump"),
    );
    await writeVersioned(
      "instructions",
      "new.instructions.md",
      versioned("new instruction", "1.0.0", "new Instruction"),
    );

    const update = runCli(
      project,
      ["update", "--no-interactive", "--on-conflict", "overwrite", "--include-new"],
      process.env.PATH ?? "",
      env,
    );

    assert.equal(update.status, 0, update.stderr);
    assert.equal(
      await readFile(join(project, ".github", "agents", "group", "first.agent.md"), "utf8"),
      versioned("first", "2.0.0", "updated one"),
    );
    assert.equal(
      await readFile(join(project, ".github", "agents", "group", "second.agent.md"), "utf8"),
      versioned("second", "1.0.0", "original two"),
    );
    assert.equal(
      await readFile(join(project, ".github", "agents", "group", "new.agent.md"), "utf8"),
      versioned("new", "1.0.0", "new Agent"),
    );
    assert.equal(
      await readFile(
        join(project, ".github", "instructions", "group", "first.instructions.md"),
        "utf8",
      ),
      versioned("first instruction", "2.0.0", "updated instruction"),
    );
    assert.equal(
      await readFile(
        join(project, ".github", "instructions", "group", "second.instructions.md"),
        "utf8",
      ),
      versioned("second instruction", "1.0.0", "original instruction two"),
    );
    assert.equal(
      await readFile(
        join(project, ".github", "instructions", "group", "new.instructions.md"),
        "utf8",
      ),
      versioned("new instruction", "1.0.0", "new Instruction"),
    );
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("init rejects a nested destination symlink before writing outside the GitHub root", async () => {
  const blueprints = await makeTempDir("spindle-catalog-destination-link-blueprints-");
  const project = await makeTempDir("spindle-catalog-destination-link-project-");
  const outside = await makeTempDir("spindle-catalog-destination-link-outside-");
  const target = join(outside, "agent.agent.md");
  try {
    writeCatalogFixture(blueprints, {
      agents: {
        nested: {
          path: "group/agent.agent.md",
          status: "active",
          stacks: [],
        },
      },
      instructions: {},
      skills: {},
    } satisfies BlueprintCatalogDefinition);
    await mkdir(join(blueprints, "agents", "group"), { recursive: true });
    await writeFile(
      join(blueprints, "agents", "group", "agent.agent.md"),
      "---\nname: agent\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nAgent\n",
    );
    await mkdir(join(project, ".github", "agents"), { recursive: true });
    await symlink(outside, join(project, ".github", "agents", "group"));

    const result = runCli(project, ["init", "--stack", "python"], process.env.PATH ?? "", {
      SPINDLE_BLUEPRINTS_DIR: blueprints,
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /symbolic link/i);
    await assert.rejects(readFile(target));
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("a current Skill receives new supporting content only after its version increases", async () => {
  const blueprints = await makeTempDir("spindle-catalog-skill-version-blueprints-");
  const project = await makeTempDir("spindle-catalog-skill-version-project-");
  const env = { SPINDLE_BLUEPRINTS_DIR: blueprints };
  const skill = (version: string) =>
    `---\nname: authoring\nmetadata:\n  spindle:\n    version: ${version}\n---\nSkill ${version}\n`;
  try {
    writeCatalogFixture(blueprints, {
      agents: {},
      instructions: {},
      skills: {
        "authoring-key": {
          path: "authoring/",
          status: "active",
          stacks: [],
        },
      },
    } satisfies BlueprintCatalogDefinition);
    await mkdir(join(blueprints, "skills", "authoring"), { recursive: true });
    await writeFile(join(blueprints, "skills", "authoring", "SKILL.md"), skill("1.0.0"));
    await writeFile(join(blueprints, "skills", "authoring", "existing.txt"), "existing\n");

    const init = runCli(project, ["init", "--stack", "python"], process.env.PATH ?? "", env);
    assert.equal(init.status, 0, init.stderr);

    await writeFile(join(blueprints, "skills", "authoring", "new.txt"), "new after bump\n");
    const current = runCli(
      project,
      ["update", "--no-interactive", "--on-conflict", "overwrite"],
      process.env.PATH ?? "",
      env,
    );
    assert.equal(current.status, 0, current.stderr);
    await assert.rejects(readFile(join(project, ".github", "skills", "authoring", "new.txt")));

    await writeFile(join(blueprints, "skills", "authoring", "SKILL.md"), skill("2.0.0"));
    const bumped = runCli(
      project,
      ["update", "--no-interactive", "--on-conflict", "overwrite"],
      process.env.PATH ?? "",
      env,
    );
    assert.equal(bumped.status, 0, bumped.stderr);
    assert.equal(
      await readFile(join(project, ".github", "skills", "authoring", "new.txt"), "utf8"),
      "new after bump\n",
    );
    assert.equal(
      await readFile(join(project, ".github", "skills", "authoring", "SKILL.md"), "utf8"),
      skill("2.0.0"),
    );
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("invalid catalogs fail with actionable diagnostics before creating the project installation", async () => {
  const cases = [
    {
      label: "unsafe traversal path",
      source: {
        agents: {
          selected: {
            path: "../selected.agent.md",
            status: "active",
            stacks: [],
          },
        },
        instructions: {},
        skills: {},
      } satisfies BlueprintCatalogDefinition,
      diagnostic: /unsafe.*relative path/i,
    },
    {
      label: "glob selection path",
      source: {
        agents: {
          selected: {
            path: "*.agent.md",
            status: "active",
            stacks: [],
          },
        },
        instructions: {},
        skills: {},
      } satisfies BlueprintCatalogDefinition,
      diagnostic: /unsafe.*glob syntax/i,
    },
    {
      label: "overlapping selections",
      source: {
        agents: {
          group: {
            path: "group/",
            status: "active",
            stacks: [],
          },
          nested: {
            path: "group/nested.agent.md",
            status: "active",
            stacks: [],
          },
        },
        instructions: {},
        skills: {},
      } satisfies BlueprintCatalogDefinition,
      diagnostic: /Overlapping Blueprint Catalog paths/i,
    },
    {
      label: "missing nonmatching active source",
      source: {
        agents: {
          selected: {
            path: "missing.agent.md",
            status: "active",
            stacks: ["typescript"],
          },
        },
        instructions: {},
        skills: {},
      } satisfies BlueprintCatalogDefinition,
      diagnostic: /missing source 'missing.agent.md'/,
    },
  ];

  for (const { label, source, diagnostic } of cases) {
    const blueprints = await makeTempDir(`spindle-catalog-${label.replaceAll(" ", "-")}-`);
    const project = await makeTempDir("spindle-catalog-invalid-project-");
    try {
      writeCatalogFixture(blueprints, source);
      const result = runCli(project, ["init", "--stack", "python"], process.env.PATH ?? "", {
        SPINDLE_BLUEPRINTS_DIR: blueprints,
      });
      assert.notEqual(result.status, 0, label);
      assert.match(result.stderr, diagnostic, label);
      await assert.rejects(readdir(join(project, ".github")), label);
    } finally {
      await rm(blueprints, { recursive: true, force: true });
      await rm(project, { recursive: true, force: true });
    }
  }
});

test("the asset override uses the compiled catalog without loading external catalogs", async () => {
  const blueprints = await makeTempDir("spindle-static-catalog-assets-");
  const project = await makeTempDir("spindle-static-catalog-project-");
  try {
    const catalog = validateBlueprintCatalog(blueprintCatalog);
    for (const kind of ["agents", "instructions", "skills"] as const) {
      for (const entry of catalog[kind]) {
        if (entry.status !== "active") continue;
        const destination = join(blueprints, kind, entry.path);
        await mkdir(dirname(destination), { recursive: true });
        await cp(resolve("src/blueprints", kind, entry.path), destination, { recursive: true });
      }
    }
    const retired = join(project, ".github", "skills", "int-grilling");
    await mkdir(retired, { recursive: true });
    await writeFile(join(retired, "local.txt"), "retired content\n");
    await mkdir(join(blueprints, "skills", "unlisted"), { recursive: true });
    await writeFile(join(blueprints, "skills", "unlisted", "SKILL.md"), "not selected\n");
    const args = ["init", "--stack", "python"];
    const env = { SPINDLE_BLUEPRINTS_DIR: blueprints };

    const withoutCatalog = runBundledCli(project, args, process.env.PATH ?? "", env);
    assert.equal(withoutCatalog.status, 0, withoutCatalog.stderr);
    await assert.rejects(readFile(join(retired, "local.txt")), { code: "ENOENT" });
    await assert.rejects(readdir(join(project, ".github", "skills", "unlisted")), {
      code: "ENOENT",
    });
    assert.equal((await readdir(join(project, ".github", "skills"))).length, 30);

    await writeFile(join(blueprints, "catalog.yaml"), "agents: [\n");
    await writeFile(join(blueprints, "catalog.fixture.json"), "invalid external JSON");
    const withExternalCatalogs = runBundledCli(
      project,
      ["update", "--no-interactive"],
      process.env.PATH ?? "",
      env,
    );
    assert.equal(withExternalCatalogs.status, 0, withExternalCatalogs.stderr);
    assert.equal((await readdir(join(project, ".github", "agents"))).length, 11);
    assert.equal((await readdir(join(project, ".github", "skills"))).length, 30);
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("the shipped Blueprint collection installs its flattened catalog sources", async () => {
  const project = await makeTempDir("spindle-catalog-shipped-project-");
  try {
    const result = runCli(project, ["init", "--stack", "python"], process.env.PATH ?? "");
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(await readdir(join(project, ".github", "agents")), [
      "general.agent.md",
      "sdd-code-reviewer.agent.md",
      "sdd-code-slop-reviewer.agent.md",
      "sdd-implementer.agent.md",
      "sdd-orchestrator.agent.md",
      "sdd-re-review.agent.md",
      "sdd-task-reviewer.agent.md",
      "shared-explore.agent.md",
      "shared-r.agent.md",
      "shared-rw.agent.md",
      "shared-rwx.agent.md",
    ]);
    assert.equal((await readdir(join(project, ".github", "skills"))).length, 30);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});
