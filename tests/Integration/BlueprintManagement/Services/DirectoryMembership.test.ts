import { lstat, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { expect, test } from "vitest";

import type { BlueprintCatalogDefinition } from "@/BlueprintManagement/Catalog/BlueprintCatalog";

import { writeCatalogFixture } from "../../../Helpers/CatalogFixtures.ts";
import { runCliWithCatalog as runCli } from "../../../Helpers/Cli.ts";
import { makeTempDir } from "../../../Helpers/TemporaryDirectories.ts";

const versioned = (version: string, body: string) =>
  `---\nmetadata:\n  spindle:\n    version: ${version}\n---\n${body}\n`;

const catalog = {
  agents: {
    grouped: {
      path: "grouped/",
      stacks: [],
    },
  },
  instructions: {
    grouped: {
      path: "grouped/",
      stacks: [],
    },
  },
  skills: {
    current: {
      path: "current/",
      stacks: [],
    },
    skipped: {
      path: "skipped/",
      stacks: [],
    },
    accepted: {
      path: "accepted/",
      stacks: [],
    },
  },
} satisfies BlueprintCatalogDefinition;

async function put(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

async function absent(path: string) {
  await expect(lstat(path)).rejects.toMatchObject({ code: "ENOENT" });
}

async function makeProject() {
  const project = await makeTempDir("spindle-directory-membership-");
  await put(
    join(project, ".github", "spindle.json"),
    JSON.stringify({ stacks: ["python"], spindle_package_manager: "pnpm" }),
  );
  return project;
}

test("init removes destination-only files within selected directories only", async () => {
  const blueprints = await makeTempDir("spindle-init-directory-membership-blueprints-");
  const project = await makeProject();
  const github = join(project, ".github");
  const target = join(github, "agents", "grouped");
  {
    await rm(join(github, "spindle.json"));
    writeCatalogFixture(blueprints, catalog);
    await put(join(blueprints, "agents/grouped/keep.agent.md"), versioned("1.0.0", "source"));
    await put(
      join(blueprints, "instructions/grouped/keep.instructions.md"),
      versioned("1.0.0", "source"),
    );
    await put(join(target, "keep.agent.md"), versioned("1.0.0", "installed bytes"));
    await put(join(target, "vanished/deep/local.txt"), "local data\n");
    await put(join(github, "agents/neighbor.agent.md"), "neighbor\n");
    await put(join(blueprints, "skills/current/SKILL.md"), versioned("1.0.0", "current"));
    await put(join(blueprints, "skills/skipped/SKILL.md"), versioned("1.0.0", "current"));
    await put(join(blueprints, "skills/accepted/SKILL.md"), versioned("1.0.0", "current"));

    const result = runCli(
      project,
      ["init", "--stack", "python", "--no-interactive", "--on-conflict", "skip"],
      process.env.PATH ?? "",
      { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints },
    );

    expect(result.status, result.stderr).toBe(0);
    await absent(join(target, "vanished/deep/local.txt"));
    expect(await readFile(join(target, "keep.agent.md"), "utf8")).toBe(
      versioned("1.0.0", "installed bytes"),
    );
    expect(await readFile(join(github, "agents/neighbor.agent.md"), "utf8")).toBe("neighbor\n");
    expect(result.stdout).toMatch(/Removed agent 'grouped\/vanished\/deep\/local\.txt'/);
  }
});

test("update rejects unsafe nested symlinks before membership cleanup", async () => {
  const blueprints = await makeTempDir("spindle-unsafe-directory-blueprints-");
  const project = await makeProject();
  const github = join(project, ".github");
  const target = join(github, "agents", "grouped");
  const outside = join(project, "outside.txt");
  {
    writeCatalogFixture(blueprints, catalog);
    await put(join(blueprints, "agents/grouped/current.agent.md"), versioned("1.0.0", "source"));
    await put(
      join(blueprints, "instructions/grouped/current.instructions.md"),
      versioned("1.0.0", "source"),
    );
    await put(join(target, "current.agent.md"), versioned("1.0.0", "installed"));
    await put(join(target, "stale.txt"), "must remain on validation failure\n");
    await put(outside, "outside content\n");
    await mkdir(target, { recursive: true });
    await symlink(outside, join(target, "unsafe-link"));
    await put(join(blueprints, "skills/current/SKILL.md"), versioned("1.0.0", "current"));
    await put(join(blueprints, "skills/skipped/SKILL.md"), versioned("1.0.0", "current"));
    await put(join(blueprints, "skills/accepted/SKILL.md"), versioned("1.0.0", "current"));

    const result = runCli(project, ["update"], process.env.PATH ?? "", {
      SPINDLE_TEST_BLUEPRINTS_DIR: blueprints,
    });

    expect(result.status, result.stdout).not.toBe(0);
    expect(result.stderr).toMatch(/symbolic link/i);
    expect(await readFile(outside, "utf8")).toBe("outside content\n");
    expect(await readFile(join(target, "stale.txt"), "utf8")).toBe(
      "must remain on validation failure\n",
    );
  }
});
