import { cp, mkdir, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { expect, test } from "vitest";

import { blueprintCatalog as assetCatalog } from "@/Assets/Blueprints/Catalog";
import {
  blueprintCatalog,
  validateBlueprintCatalog,
  type BlueprintCatalogDefinition,
} from "@/BlueprintManagement/Catalog/BlueprintCatalog";

import { writeCatalogFixture } from "../../../Helpers/CatalogFixtures.ts";
import { runCli as runBundledCli, runCliWithCatalog as runCli } from "../../../Helpers/Cli.ts";
import { makeTempDir, repoRoot } from "../../../Helpers/TemporaryDirectories.ts";

test("the management catalog validates shipped asset metadata without changing reviewer selections", () => {
  expect(blueprintCatalog).toBe(assetCatalog);
  const validated = validateBlueprintCatalog(assetCatalog);
  expect(validated.agents.filter((entry) => entry.canReview).map((entry) => entry.key)).toEqual([
    "sdd-code-reviewer",
    "sdd-reviewer",
    "sdd-task-reviewer",
  ]);
  expect(validated.instructions.find((entry) => entry.key === "code-commenting")).toEqual({
    key: "code-commenting",
    path: "code-commenting.instructions.md",
    directory: false,
    stacks: [],
  });
  expect(validated.instructions.find((entry) => entry.key === "source-architecture")).toEqual({
    key: "source-architecture",
    path: "source-architecture.instructions.md",
    directory: false,
    stacks: [],
  });
});

test.each([
  { stacks: ["php-laravel"], installed: true },
  { stacks: ["php-laravel", "typescript"], installed: true },
  { stacks: ["python"], installed: false },
  { stacks: ["typescript"], installed: false },
])("the shipped Saloon skill selection matches $stacks", async ({ stacks, installed }) => {
  const project = await makeTempDir("spindle-catalog-saloon-project-");
  const result = runBundledCli(
    project,
    ["init", ...stacks.flatMap((stack) => ["--stack", stack]), "--spindle-package-manager", "pnpm"],
    process.env.PATH ?? "",
  );
  expect(result.status, result.stderr).toBe(0);

  const destination = join(project, ".github", "skills", "ref-php-laravel-saloon-api-integrations");
  if (!installed) {
    await expect(readdir(destination)).rejects.toMatchObject({ code: "ENOENT" });
    return;
  }

  const content = await readFile(join(destination, "SKILL.md"), "utf8");
  expect(content).toMatch(/name: ref-php-laravel-saloon-api-integrations/);
  expect(content).toMatch(/metadata:\n  spindle:\n    version: 1\.0\.0/);
  const references = [
    "connectors.md",
    "requests.md",
    "sending-requests.md",
    "responses.md",
    "handling-failures.md",
    "testing.md",
    "concurrency-and-pools.md",
    "data-transfer-objects.md",
  ];
  expect((await readdir(join(destination, "references"))).sort()).toEqual(references.sort());
  for (const reference of references) {
    expect(content).toContain(`references/${reference}`);
    expect(await readFile(join(destination, "references", reference), "utf8")).toBe(
      await readFile(
        join(
          repoRoot,
          "assets",
          "Blueprints",
          "skills",
          "ref-php-laravel-saloon-api-integrations",
          "references",
          reference,
        ),
        "utf8",
      ),
    );
  }
});

test("init selects supported catalog entries and preserves their source paths", async () => {
  const blueprints = await makeTempDir("spindle-catalog-blueprints-");
  const project = await makeTempDir("spindle-catalog-project-");
  const env = { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints };
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
  {
    writeCatalogFixture(blueprints, {
      agents: {
        shared: {
          path: "grouped/reviewer.agent.md",
          stacks: ["python"],
        },
      },
      instructions: {
        shared: {
          path: "grouped/",
          stacks: [],
        },
      },
      skills: {
        shared: {
          path: "authoring/",
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

    expect(result.status, result.stderr).toBe(0);
    expect(
      await readFile(join(project, ".github", "agents", "grouped", "reviewer.agent.md"), "utf8"),
    ).toBe(agent);
    expect(
      await readFile(
        join(project, ".github", "instructions", "grouped", "stacks", "nested.instructions.md"),
        "utf8",
      ),
    ).toBe(instruction);
    expect(
      await readFile(
        join(project, ".github", "instructions", "grouped", "assets", "attachment.bin"),
      ),
    ).toEqual(instructionAsset);
    expect(
      await readFile(
        join(project, ".github", "skills", "authoring", "stacks", "notes.txt"),
        "utf8",
      ),
    ).toBe("ordinary nested directory\n");
    expect(
      await readFile(join(project, ".github", "skills", "authoring", "assets", "logo.png")),
    ).toEqual(asset);
    expect(await readdir(join(project, ".github", "skills"))).toEqual(["authoring"]);
    await expect(
      readFile(join(project, ".github", "agents", "retired.agent.md")),
    ).rejects.toThrow();
  }
});

test("init selects a catalog entry scoped to the php-laravel Stack", async () => {
  const blueprints = await makeTempDir("spindle-catalog-php-laravel-blueprints-");
  const project = await makeTempDir("spindle-catalog-php-laravel-project-");
  const env = { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints };
  const agent = (name: string) =>
    `---\nname: ${name}\ndescription: ${name} agent\nmetadata:\n  spindle:\n    version: 1.0.0\n---\n${name}\n`;
  {
    writeCatalogFixture(blueprints, {
      agents: {
        laravel: {
          path: "laravel.agent.md",
          stacks: ["php-laravel"],
        },
        python: {
          path: "python.agent.md",
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

    expect(result.status, result.stderr).toBe(0);
    expect(await readFile(join(project, ".github", "agents", "laravel.agent.md"), "utf8")).toBe(
      agent("laravel"),
    );
    await expect(readFile(join(project, ".github", "agents", "python.agent.md"))).rejects.toThrow();
  }
});

test("init validates symlinks in active nonmatching catalog directories before project changes", async () => {
  const blueprints = await makeTempDir("spindle-catalog-invalid-blueprints-");
  const project = await makeTempDir("spindle-catalog-invalid-project-");
  const outside = await makeTempDir("spindle-catalog-outside-");
  const env = { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints };
  {
    writeCatalogFixture(blueprints, {
      agents: {},
      instructions: {},
      skills: {
        collection: {
          path: "collection/",
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

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/symbolic link/i);
    await expect(readdir(join(project, ".github"))).rejects.toThrow();
  }
});

test("init rejects a nested destination symlink before writing outside the GitHub root", async () => {
  const blueprints = await makeTempDir("spindle-catalog-destination-link-blueprints-");
  const project = await makeTempDir("spindle-catalog-destination-link-project-");
  const outside = await makeTempDir("spindle-catalog-destination-link-outside-");
  const target = join(outside, "agent.agent.md");
  {
    writeCatalogFixture(blueprints, {
      agents: {
        nested: {
          path: "group/agent.agent.md",
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
      SPINDLE_TEST_BLUEPRINTS_DIR: blueprints,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/symbolic link/i);
    await expect(readFile(target)).rejects.toThrow();
  }
});

test("writing guidance updates consolidate mechanics and preserve skill invocation pointers", async () => {
  const blueprints = await makeTempDir("spindle-writing-guidance-blueprints-");
  const project = await makeTempDir("spindle-writing-guidance-project-");
  const names = ["int-writing-for-agents", "int-writing-skills", "int-testing-agent-guidance"];
  const installedSkills = join(project, ".github", "skills");
  const oldMechanics = join(installedSkills, "int-writing-for-agents", "SKILL-MECHANICS.md");
  const disclosedMechanics = join(
    installedSkills,
    "int-writing-for-agents",
    "references",
    "skill-mechanics.md",
  );
  const env = { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints };
  {
    writeCatalogFixture(blueprints, {
      agents: {},
      instructions: {},
      skills: Object.fromEntries(names.map((name) => [name, { path: `${name}/`, stacks: [] }])),
    } satisfies BlueprintCatalogDefinition);
    for (const name of names) {
      await cp(
        resolve(repoRoot, "assets", "Blueprints", "skills", name),
        join(blueprints, "skills", name),
        {
          recursive: true,
        },
      );
    }
    const init = runCli(project, ["init", "--stack", "python"], process.env.PATH ?? "", env);
    expect(init.status, init.stderr).toBe(0);
    for (const [name, version] of [
      ["int-writing-for-agents", "1.1.0"],
      ["int-writing-skills", "1.2.1"],
    ]) {
      await mkdir(join(installedSkills, name), { recursive: true });
      await writeFile(
        join(installedSkills, name, "SKILL.md"),
        `---\nname: ${name}\nmetadata:\n  spindle:\n    version: ${version}\n---\nRead SKILL-MECHANICS.md.\n`,
      );
    }
    await writeFile(oldMechanics, "Old invocation guidance\n");
    await mkdir(dirname(disclosedMechanics), { recursive: true });
    await writeFile(disclosedMechanics, "Previously disclosed invocation guidance\n");

    const result = runCli(project, ["update"], process.env.PATH ?? "", env);
    expect(result.status, result.stderr).toBe(0);
    await expect(readFile(oldMechanics)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(disclosedMechanics)).rejects.toMatchObject({ code: "ENOENT" });

    for (const relative of ["int-writing-for-agents/SKILL.md", "int-writing-skills/SKILL.md"]) {
      const file = join(installedSkills, relative);
      const content = await readFile(file, "utf8");
      expect(content).not.toMatch(/skill-mechanics\.md|SKILL-MECHANICS\.md|{{|{%/);
      if (relative.endsWith("SKILL.md")) {
        const source = await readFile(join(blueprints, "skills", relative), "utf8");
        const version = source.match(/version: (\S+)/)?.[1];
        expect(version).toBeTruthy();
        expect(content.includes(`version: ${version}`)).toBeTruthy();
        expect(content).toMatch(/description: "This is an internal skill/);
        expect(content).not.toMatch(/\[[^\]]+\]\([^)]*\/SKILL\.md\)/);
        if (relative === "int-writing-for-agents/SKILL.md") {
          expect(content.includes("use the `int-writing-skills` skill")).toBeTruthy();
          expect(content.includes("use the `int-testing-agent-guidance` skill")).toBeTruthy();
        } else {
          expect(content.includes("**Invocation:**")).toBeTruthy();
          expect(content.includes("**Routers:**")).toBeTruthy();
          expect(content.includes("`description` is required in every case")).toBeTruthy();
        }
      }
      for (const [, target] of content.matchAll(/\[[^\]]+\]\((\.[^)]+)\)/g)) {
        const path = target.split("#")[0];
        expect(
          (await readFile(resolve(dirname(file), path), "utf8")).length > 0,
          `${relative}: ${target}`,
        ).toBeTruthy();
      }
    }
  }
});

test("invalid catalogs fail with actionable diagnostics before creating the project installation", async () => {
  const cases: {
    label: string;
    source: BlueprintCatalogDefinition;
    diagnostic: RegExp;
  }[] = [
    {
      label: "unsafe traversal path",
      source: {
        agents: {
          selected: {
            path: "../selected.agent.md",
            stacks: [],
          },
        },
        instructions: {},
        skills: {},
      },
      diagnostic: /unsafe.*relative path/i,
    },
    {
      label: "glob selection path",
      source: {
        agents: {
          selected: {
            path: "*.agent.md",
            stacks: [],
          },
        },
        instructions: {},
        skills: {},
      },
      diagnostic: /unsafe.*glob syntax/i,
    },
    {
      label: "overlapping selections",
      source: {
        agents: {
          group: {
            path: "group/",
            stacks: [],
          },
          nested: {
            path: "group/nested.agent.md",
            stacks: [],
          },
        },
        instructions: {},
        skills: {},
      },
      diagnostic: /Overlapping Blueprint Catalog paths/i,
    },
    {
      label: "missing nonmatching active source",
      source: {
        agents: {
          selected: {
            path: "missing.agent.md",
            stacks: ["typescript"],
          },
        },
        instructions: {},
        skills: {},
      },
      diagnostic: /missing source 'missing.agent.md'/,
    },
  ];

  for (const { label, source, diagnostic } of cases) {
    const blueprints = await makeTempDir(`spindle-catalog-${label.replaceAll(" ", "-")}-`);
    const project = await makeTempDir("spindle-catalog-invalid-project-");
    {
      writeCatalogFixture(blueprints, source);
      const result = runCli(project, ["init", "--stack", "python"], process.env.PATH ?? "", {
        SPINDLE_TEST_BLUEPRINTS_DIR: blueprints,
      });
      expect(result.status, label).not.toBe(0);
      expect(result.stderr, label).toMatch(diagnostic);
      await expect(readdir(join(project, ".github"))).rejects.toMatchObject({ code: "ENOENT" });
    }
  }
});

test("the compiled catalog ignores external catalog files", async () => {
  const blueprints = await makeTempDir("spindle-static-catalog-assets-");
  const project = await makeTempDir("spindle-static-catalog-project-");
  {
    const catalog = validateBlueprintCatalog(blueprintCatalog);
    for (const kind of ["agents", "instructions", "skills"] as const) {
      for (const entry of catalog[kind]) {
        const destination = join(blueprints, kind, entry.path);
        await mkdir(dirname(destination), { recursive: true });
        await cp(resolve(repoRoot, "assets/Blueprints", kind, entry.path), destination, {
          recursive: true,
        });
      }
    }
    await mkdir(join(blueprints, "skills", "unlisted"), { recursive: true });
    await writeFile(join(blueprints, "skills", "unlisted", "SKILL.md"), "not selected\n");
    const args = ["init", "--stack", "python", "--spindle-package-manager", "pnpm"];
    const env = { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints };

    const withoutCatalog = runBundledCli(project, args, process.env.PATH ?? "", env);
    expect(withoutCatalog.status, withoutCatalog.stderr).toBe(0);
    await expect(readdir(join(project, ".github", "skills", "unlisted"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect((await readdir(join(project, ".github", "skills"))).sort()).toEqual(
      catalog.skills
        .filter((entry) => entry.stacks.length === 0 || entry.stacks.includes("python"))
        .map((entry) => entry.path)
        .sort(),
    );

    await writeFile(join(blueprints, "catalog.fixture.json"), "invalid external JSON");
    const withExternalCatalog = runBundledCli(project, ["update"], process.env.PATH ?? "", env);
    expect(withExternalCatalog.status, withExternalCatalog.stderr).toBe(0);
  }
});

test("the shipped Blueprint collection initializes through the compiled catalog", async () => {
  const project = await makeTempDir("spindle-catalog-shipped-project-");
  {
    const result = runCli(project, ["init", "--stack", "python"], process.env.PATH ?? "");
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/^✔ Installed /);

    const earsSkill = await readFile(
      join(project, ".github", "skills", "int-ref-ears", "SKILL.md"),
      "utf8",
    );
    expect(earsSkill).toContain("name: int-ref-ears");
    expect(earsSkill).toContain(
      'description: "This is an internal skill do not load it unless explicitly required by the user or another skill."',
    );
    expect(earsSkill).toContain("user-invocable: false");
    expect(earsSkill).toMatch(/metadata:\n  spindle:\n    version: 1\.0\.0/);
    expect(earsSkill).toContain(
      "While `<state>`, when `<trigger>`, the system shall `<response>`.",
    );
    expect(earsSkill).toContain(
      "For ticket acceptance criteria with a single behavior and a clear condition, trigger, and response, prefer the matching EARS pattern.",
    );
    for (const skillName of ["sdd-to-spec", "sdd-to-tickets"]) {
      const skill = await readFile(
        join(project, ".github", "skills", skillName, "SKILL.md"),
        "utf8",
      );
      expect(skill).toContain("- **REQUIRED:** `int-ref-ears`");
    }
  }
});
