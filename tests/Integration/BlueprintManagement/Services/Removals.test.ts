import { lstat, mkdir, readFile, symlink, writeFile as fsWriteFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { expect, test } from "vitest";

import type { BlueprintCatalogDefinition } from "@/BlueprintManagement/Catalog/BlueprintCatalog";

import { writeCatalogFixture } from "../../../Helpers/CatalogFixtures.ts";
import { runCliWithFixtureCatalog as runCli } from "../../../Helpers/Cli.ts";
import { makeTempDir, repoRoot } from "../../../Helpers/TemporaryDirectories.ts";

const versioned = (name: string, body: string) =>
  `---\nname: ${name}\nmetadata:\n  spindle:\n    version: 1.0.0\n---\n${body}\n`;

async function writeFile(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true });
  await fsWriteFile(path, content);
}

async function assertMissing(path: string) {
  await expect(lstat(path)).rejects.toMatchObject({ code: "ENOENT" });
}

test("update deletes newly inapplicable entries, retains multi-Stack matches, and infers no old paths", async () => {
  const blueprints = await makeTempDir("spindle-stack-transition-blueprints-");
  const project = await makeTempDir("spindle-stack-transition-project-");
  const github = join(project, ".github");
  const catalogForTransition = {
    agents: {
      multi: {
        path: "multi.agent.md",
        stacks: ["python", "typescript"],
      },
      "python-only": {
        path: "python-only.agent.md",
        stacks: ["python"],
      },
      renamed: {
        path: "new.agent.md",
        stacks: [],
      },
    },
    instructions: {},
    skills: {},
  } satisfies BlueprintCatalogDefinition;
  {
    writeCatalogFixture(blueprints, catalogForTransition);
    for (const name of ["multi", "python-only", "new"]) {
      await writeFile(
        join(blueprints, "agents", `${name}.agent.md`),
        versioned(name, `shipped ${name}`),
      );
      await writeFile(
        join(github, "agents", `${name}.agent.md`),
        versioned(name, `installed ${name}`),
      );
    }
    await writeFile(join(github, "agents", "old.agent.md"), "old path content\n");
    await writeFile(join(github, "agents", "unlisted.agent.md"), "unlisted content\n");
    const configPath = join(github, "spindle.json");
    await writeFile(
      configPath,
      JSON.stringify({ stacks: ["python"], spindle_package_manager: "pnpm" }),
    );

    const env = { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints };
    const args = ["update"];
    const pythonResult = runCli(project, args, process.env.PATH ?? "", env);
    expect(pythonResult.status, pythonResult.stderr).toBe(0);
    expect(await readFile(join(github, "agents", "python-only.agent.md"), "utf8")).toBe(
      versioned("python-only", "shipped python-only"),
    );

    await writeFile(
      configPath,
      JSON.stringify({ stacks: ["typescript"], spindle_package_manager: "pnpm" }),
    );
    const typescriptResult = runCli(project, args, process.env.PATH ?? "", env);
    expect(typescriptResult.status, typescriptResult.stderr).toBe(0);
    await assertMissing(join(github, "agents", "python-only.agent.md"));
    expect(await readFile(join(github, "agents", "multi.agent.md"), "utf8")).toBe(
      versioned("multi", "shipped multi"),
    );
    expect(await readFile(join(github, "agents", "old.agent.md"), "utf8")).toBe(
      "old path content\n",
    );
    expect(await readFile(join(github, "agents", "unlisted.agent.md"), "utf8")).toBe(
      "unlisted content\n",
    );
    expect(typescriptResult.stdout).toMatch(/Removed agent 'python-only\.agent\.md'/);
    expect(typescriptResult.stdout).not.toMatch(/Removed agent '(?:multi|old|unlisted)/);
  }
});

test("update rejects unsafe deletion targets before changing any target or outside content", async () => {
  const blueprints = await makeTempDir("spindle-unsafe-removal-blueprints-");
  const project = await makeTempDir("spindle-unsafe-removal-project-");
  const github = join(project, ".github");
  const outside = join(project, "outside.txt");
  const firstTarget = join(github, "agents", "first.agent.md");
  const secondTarget = join(github, "agents", "second.agent.md");
  {
    writeCatalogFixture(blueprints, {
      agents: {},
      instructions: {},
      skills: {},
    } satisfies BlueprintCatalogDefinition);
    await writeFile(firstTarget, "first target must remain\n");
    await writeFile(outside, "outside target must remain\n");
    await symlink(outside, secondTarget);
    await writeFile(
      join(github, "spindle.json"),
      JSON.stringify({ stacks: ["python"], spindle_package_manager: "pnpm" }),
    );

    const result = runCli(project, ["update"], process.env.PATH ?? "", {
      SPINDLE_TEST_BLUEPRINTS_DIR: blueprints,
    });

    expect(result.status, result.stdout).not.toBe(0);
    expect(result.stderr).toMatch(/symbolic link/i);
    expect(await readFile(firstTarget, "utf8")).toBe("first target must remain\n");
    expect(await readFile(outside, "utf8")).toBe("outside target must remain\n");
    expect((await lstat(secondTarget)).isSymbolicLink()).toBe(true);
  }
});

test("update reports a failed removal and already completed deletions", async () => {
  const blueprints = await makeTempDir("spindle-remove-failure-blueprints-");
  const project = await makeTempDir("spindle-remove-failure-project-");
  const github = join(project, ".github");
  const firstTarget = join(github, "agents", "first.agent.md");
  const secondTarget = join(github, "agents", "second.agent.md");
  {
    writeCatalogFixture(blueprints, {
      agents: {},
      instructions: {},
      skills: {},
    } satisfies BlueprintCatalogDefinition);
    await writeFile(firstTarget, versioned("first", "first target"));
    await writeFile(secondTarget, versioned("second", "second target"));
    await writeFile(
      join(github, "spindle.json"),
      JSON.stringify({ stacks: ["python"], spindle_package_manager: "pnpm" }),
    );

    const result = runCli(project, ["update"], process.env.PATH ?? "", {
      SPINDLE_TEST_BLUEPRINTS_DIR: blueprints,
      SPINDLE_TEST_PRELOAD: join(repoRoot, "tests/Helpers/Preloads/fail-removal.ts"),
      SPINDLE_TEST_FAIL_REMOVE_TARGET: secondTarget,
    });

    expect(result.status, result.stdout).not.toBe(0);
    expect(result.stderr).toMatch(/Failed to remove Agent 'second\.agent\.md'/);
    expect(result.stderr).toMatch(/forced removal failure/);
    expect(result.stderr).toMatch(/Completed changes: removed Agent 'first\.agent\.md'/);
    await assertMissing(firstTarget);
    expect(await readFile(secondTarget, "utf8")).toBe(versioned("second", "second target"));
  }
});
