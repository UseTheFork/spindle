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

test("update cleans selected directory membership without changing version decisions", async () => {
  const blueprints = await makeTempDir("spindle-directory-membership-blueprints-");
  const project = await makeProject();
  const github = join(project, ".github");
  const agentDir = join(github, "agents", "grouped");
  const instructionDir = join(github, "instructions", "grouped");
  const skills = join(github, "skills");
  {
    writeCatalogFixture(blueprints, catalog);

    await put(join(blueprints, "agents/grouped/current.agent.md"), versioned("1.0.0", "source"));
    await put(join(blueprints, "agents/grouped/outdated.agent.md"), versioned("2.0.0", "source"));
    await put(join(blueprints, "agents/grouped/fresh.agent.md"), versioned("1.0.0", "new"));
    await put(join(blueprints, "agents/grouped/unknown.agent.md"), versioned("2.0.0", "source"));
    await put(join(blueprints, "agents/grouped/stacks/example.txt"), "source asset\n");
    await put(
      join(blueprints, "instructions/grouped/current.instructions.md"),
      versioned("1.0.0", "source"),
    );
    await put(
      join(blueprints, "instructions/grouped/outdated.instructions.md"),
      versioned("2.0.0", "source"),
    );
    await put(
      join(blueprints, "instructions/grouped/fresh.instructions.md"),
      versioned("1.0.0", "new"),
    );
    await put(
      join(blueprints, "instructions/grouped/unknown.instructions.md"),
      versioned("2.0.0", "source"),
    );

    await put(join(blueprints, "skills/current/SKILL.md"), versioned("1.0.0", "current"));
    await put(join(blueprints, "skills/current/retained.txt"), "source current asset\n");
    await put(join(blueprints, "skills/current/new-support.txt"), "new source asset\n");
    await put(join(blueprints, "skills/skipped/SKILL.md"), versioned("2.0.0", "updated"));
    await put(join(blueprints, "skills/skipped/retained.txt"), "new source asset\n");
    await put(join(blueprints, "skills/accepted/SKILL.md"), versioned("2.0.0", "updated"));
    await put(join(blueprints, "skills/accepted/new-support.txt"), "accepted new asset\n");

    await put(join(agentDir, "current.agent.md"), versioned("1.0.0", "installed current"));
    await put(join(agentDir, "outdated.agent.md"), versioned("1.0.0", "installed outdated"));
    await put(join(agentDir, "unknown.agent.md"), "installed without version metadata\n");
    await put(join(agentDir, "vanished/nested.txt"), "stale upstream file\n");
    await put(join(agentDir, "local/nested.txt"), "local addition\n");
    await put(join(agentDir, "stacks/example.txt"), "installed stack asset\n");
    await put(join(github, "agents", "neighbor.agent.md"), "outside selected directory\n");

    await put(
      join(instructionDir, "current.instructions.md"),
      versioned("1.0.0", "installed current"),
    );
    await put(
      join(instructionDir, "outdated.instructions.md"),
      versioned("1.0.0", "installed outdated"),
    );
    await put(
      join(instructionDir, "unknown.instructions.md"),
      "installed without version metadata\n",
    );
    await put(join(instructionDir, "vanished/nested.txt"), "stale upstream file\n");
    await put(join(instructionDir, "local/nested.txt"), "local addition\n");
    await put(
      join(github, "instructions", "neighbor.instructions.md"),
      "outside selected directory\n",
    );

    await put(join(skills, "current/SKILL.md"), versioned("1.0.0", "installed current"));
    await put(join(skills, "current/retained.txt"), "user-modified surviving asset\n");
    await put(join(skills, "current/vanished/nested.txt"), "stale upstream file\n");
    await put(join(skills, "current/local/nested.txt"), "local addition\n");
    await put(join(skills, "skipped/SKILL.md"), versioned("1.0.0", "installed old version"));
    await put(join(skills, "skipped/retained.txt"), "user-modified surviving asset\n");
    await put(join(skills, "skipped/vanished/nested.txt"), "stale upstream file\n");
    await put(join(skills, "skipped/local/nested.txt"), "local addition\n");
    await put(join(skills, "accepted/SKILL.md"), versioned("1.0.0", "installed old version"));
    await put(join(skills, "accepted/local.txt"), "old local content\n");
    await put(join(skills, "neighbor/SKILL.md"), "unrelated skill\n");

    const result = runCli(project, ["update"], process.env.PATH ?? "", {
      SPINDLE_TEST_BLUEPRINTS_DIR: blueprints,
    });

    expect(result.status, result.stderr).toBe(0);
    for (const directory of [agentDir, instructionDir]) {
      expect(await readFile(join(directory, "vanished/nested.txt"), "utf8")).toBe(
        "stale upstream file\n",
      );
      expect(await readFile(join(directory, "local/nested.txt"), "utf8")).toBe("local addition\n");
    }
    expect(await readFile(join(agentDir, "fresh.agent.md"), "utf8")).toBe(
      versioned("1.0.0", "new"),
    );
    expect(await readFile(join(instructionDir, "fresh.instructions.md"), "utf8")).toBe(
      versioned("1.0.0", "new"),
    );
    expect(await readFile(join(agentDir, "outdated.agent.md"), "utf8")).toBe(
      versioned("2.0.0", "source"),
    );
    expect(await readFile(join(instructionDir, "outdated.instructions.md"), "utf8")).toBe(
      versioned("2.0.0", "source"),
    );
    expect(await readFile(join(agentDir, "unknown.agent.md"), "utf8")).toBe(
      "installed without version metadata\n",
    );
    expect(await readFile(join(instructionDir, "unknown.instructions.md"), "utf8")).toBe(
      "installed without version metadata\n",
    );
    expect(await readFile(join(skills, "current/SKILL.md"), "utf8")).toBe(
      versioned("1.0.0", "installed current"),
    );
    expect(await readFile(join(skills, "current/retained.txt"), "utf8")).toBe(
      "user-modified surviving asset\n",
    );
    await absent(join(skills, "current/local/nested.txt"));
    await absent(join(skills, "current/new-support.txt"));
    for (const name of ["skipped", "accepted"]) {
      expect(await readFile(join(skills, name, "SKILL.md"), "utf8")).toBe(
        versioned("2.0.0", "updated"),
      );
      await absent(join(skills, name, name === "skipped" ? "local/nested.txt" : "local.txt"));
    }
    expect(await readFile(join(skills, "neighbor/SKILL.md"), "utf8")).toBe("unrelated skill\n");
    expect(result.stderr).toMatch(/not managed/);
  }
});

test("a selected file does not authorize cleanup of neighboring files", async () => {
  const blueprints = await makeTempDir("spindle-file-membership-blueprints-");
  const project = await makeProject();
  const github = join(project, ".github");
  {
    writeCatalogFixture(blueprints, {
      agents: {
        selected: {
          path: "selected.agent.md",
          stacks: [],
        },
      },
      instructions: {},
      skills: {},
    } satisfies BlueprintCatalogDefinition);
    await put(
      join(blueprints, "agents/selected.agent.md"),
      versioned("1.0.0", "shipped selected file"),
    );
    await put(
      join(github, "agents/selected.agent.md"),
      versioned("1.0.0", "installed selected file"),
    );
    await put(join(github, "agents/neighbor.agent.md"), "user-owned neighbor\n");

    const result = runCli(project, ["update"], process.env.PATH ?? "", {
      SPINDLE_TEST_BLUEPRINTS_DIR: blueprints,
    });

    expect(result.status, result.stderr).toBe(0);
    expect(await readFile(join(github, "agents/selected.agent.md"), "utf8")).toBe(
      versioned("1.0.0", "installed selected file"),
    );
    expect(await readFile(join(github, "agents/neighbor.agent.md"), "utf8")).toBe(
      "user-owned neighbor\n",
    );
    expect(result.stdout).not.toMatch(/Removed agent/);
  }
});

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
