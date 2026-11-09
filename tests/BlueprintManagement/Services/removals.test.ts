import { lstat, mkdir, readFile, rm, symlink, writeFile as fsWriteFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { expect, test } from "vitest";

import type { BlueprintCatalogDefinition } from "@/BlueprintManagement/Catalog/BlueprintCatalog";

import {
  writeCatalogFixture,
  makeTempDir,
  runCliWithFixtureCatalog as runCli,
} from "../../helpers.ts";

const versioned = (name: string, body: string) =>
  `---\nname: ${name}\nmetadata:\n  spindle:\n    version: 1.0.0\n---\n${body}\n`;

async function writeFile(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true });
  await fsWriteFile(path, content);
}

async function assertMissing(path: string) {
  await expect(lstat(path)).rejects.toMatchObject({ code: "ENOENT" });
}

const removalCatalog = {
  agents: {
    baseline: {
      path: "baseline.agent.md",
      status: "active",
      stacks: [],
    },
    retired: {
      path: "retired.agent.md",
      status: "removed",
      stacks: [],
    },
    absent: {
      path: "absent.agent.md",
      status: "removed",
      stacks: [],
    },
    "typescript-only": {
      path: "typescript.agent.md",
      status: "active",
      stacks: ["typescript"],
    },
  },
  instructions: {
    baseline: {
      path: "baseline.instructions.md",
      status: "active",
      stacks: [],
    },
    retired: {
      path: "retired/",
      status: "removed",
      stacks: [],
    },
    "typescript-only": {
      path: "typescript/",
      status: "active",
      stacks: ["typescript"],
    },
  },
  skills: {
    baseline: {
      path: "baseline/",
      status: "active",
      stacks: [],
    },
    retired: {
      path: "retired/",
      status: "removed",
      stacks: [],
    },
    "typescript-only": {
      path: "typescript/",
      status: "active",
      stacks: ["typescript"],
    },
  },
} satisfies BlueprintCatalogDefinition;

for (const mode of ["init", "update"] as const) {
  test(`${mode} removes retired and Stack-inapplicable catalog targets`, async () => {
    const blueprints = await makeTempDir(`spindle-${mode}-removal-blueprints-`);
    const project = await makeTempDir(`spindle-${mode}-removal-project-`);
    const github = join(project, ".github");
    const outside = join(project, "unrelated.txt");
    try {
      writeCatalogFixture(blueprints, removalCatalog);
      await writeFile(
        join(blueprints, "agents", "baseline.agent.md"),
        versioned("baseline", "baseline Agent"),
      );
      await writeFile(
        join(blueprints, "agents", "typescript.agent.md"),
        versioned("typescript-only", "inapplicable Agent"),
      );
      await writeFile(
        join(blueprints, "instructions", "baseline.instructions.md"),
        versioned("baseline", "baseline Instruction"),
      );
      await writeFile(
        join(blueprints, "instructions", "typescript", "guide.instructions.md"),
        versioned("typescript-only", "inapplicable Instruction"),
      );
      await writeFile(
        join(blueprints, "skills", "baseline", "SKILL.md"),
        versioned("baseline", "baseline Skill"),
      );
      await writeFile(
        join(blueprints, "skills", "typescript", "SKILL.md"),
        versioned("typescript-only", "inapplicable Skill"),
      );

      await writeFile(join(github, "agents", "baseline.agent.md"), versioned("baseline", "local"));
      await writeFile(join(github, "agents", "retired.agent.md"), "edited retired Agent\n");
      await writeFile(join(github, "agents", "typescript.agent.md"), "edited inapplicable Agent\n");
      await writeFile(
        join(github, "instructions", "baseline.instructions.md"),
        versioned("baseline", "local"),
      );
      await writeFile(
        join(github, "instructions", "retired", "guide.instructions.md"),
        "edited retired Instruction\n",
      );
      await writeFile(
        join(github, "instructions", "retired", "nested", "local-addition.txt"),
        "local nested addition\n",
      );
      await writeFile(
        join(github, "instructions", "typescript", "guide.instructions.md"),
        "edited inapplicable Instruction\n",
      );
      await writeFile(
        join(github, "instructions", "typescript", "nested", "local-addition.txt"),
        "inapplicable nested addition\n",
      );
      await writeFile(
        join(github, "skills", "baseline", "SKILL.md"),
        versioned("baseline", "local"),
      );
      await writeFile(join(github, "skills", "retired", "SKILL.md"), "edited retired Skill\n");
      await writeFile(
        join(github, "skills", "retired", "nested", "local-addition.txt"),
        "local nested addition\n",
      );
      await writeFile(
        join(github, "skills", "typescript", "SKILL.md"),
        "edited inapplicable Skill\n",
      );
      await writeFile(
        join(github, "skills", "typescript", "nested", "local-addition.txt"),
        "inapplicable nested addition\n",
      );
      await writeFile(outside, "unrelated project content\n");
      if (mode === "update") {
        await writeFile(
          join(github, "spindle.json"),
          JSON.stringify({ stacks: ["python"], variables: {} }),
        );
      }

      const args =
        mode === "init"
          ? ["init", "--stack", "python", "--no-interactive", "--on-conflict", "skip"]
          : ["update", "--no-interactive", "--on-conflict", "skip", "--include-new"];
      const env = { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints };
      const result = runCli(project, args, process.env.PATH ?? "", env);

      expect(result.status, result.stderr).toBe(0);
      for (const path of [
        join(github, "agents", "retired.agent.md"),
        join(github, "agents", "typescript.agent.md"),
        join(github, "instructions", "retired"),
        join(github, "instructions", "typescript"),
        join(github, "skills", "retired"),
        join(github, "skills", "typescript"),
      ]) {
        await assertMissing(path);
      }
      expect(await readFile(outside, "utf8")).toBe("unrelated project content\n");
      expect(await readFile(join(github, "agents", "baseline.agent.md"), "utf8")).toBe(
        versioned("baseline", "local"),
      );
      expect((result.stdout.match(/Removed /g) ?? []).length, result.stdout).toBe(6);
      expect(result.stdout.includes("absent.agent.md")).toBe(false);
      if (mode === "update") {
        const repeated = runCli(project, args, process.env.PATH ?? "", env);
        expect(repeated.status, repeated.stderr).toBe(0);
        expect(repeated.stdout).not.toMatch(/Removed /);
      }
    } finally {
      await rm(blueprints, { recursive: true, force: true });
      await rm(project, { recursive: true, force: true });
    }
  });
}

test("update deletes newly inapplicable entries, retains multi-Stack matches, and infers no old paths", async () => {
  const blueprints = await makeTempDir("spindle-stack-transition-blueprints-");
  const project = await makeTempDir("spindle-stack-transition-project-");
  const github = join(project, ".github");
  const catalogForTransition = {
    agents: {
      multi: {
        path: "multi.agent.md",
        status: "active",
        stacks: ["python", "typescript"],
      },
      "python-only": {
        path: "python-only.agent.md",
        status: "active",
        stacks: ["python"],
      },
      renamed: {
        path: "new.agent.md",
        status: "active",
        stacks: [],
      },
    },
    instructions: {},
    skills: {},
  } satisfies BlueprintCatalogDefinition;
  try {
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
    await writeFile(configPath, JSON.stringify({ stacks: ["python"], variables: {} }));

    const env = { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints };
    const args = ["update", "--no-interactive", "--on-conflict", "skip"];
    const pythonResult = runCli(project, args, process.env.PATH ?? "", env);
    expect(pythonResult.status, pythonResult.stderr).toBe(0);
    expect(await readFile(join(github, "agents", "python-only.agent.md"), "utf8")).toBe(
      versioned("python-only", "installed python-only"),
    );

    await writeFile(configPath, JSON.stringify({ stacks: ["typescript"], variables: {} }));
    const typescriptResult = runCli(project, args, process.env.PATH ?? "", env);
    expect(typescriptResult.status, typescriptResult.stderr).toBe(0);
    await assertMissing(join(github, "agents", "python-only.agent.md"));
    expect(await readFile(join(github, "agents", "multi.agent.md"), "utf8")).toBe(
      versioned("multi", "installed multi"),
    );
    expect(await readFile(join(github, "agents", "old.agent.md"), "utf8")).toBe(
      "old path content\n",
    );
    expect(await readFile(join(github, "agents", "unlisted.agent.md"), "utf8")).toBe(
      "unlisted content\n",
    );
    expect(typescriptResult.stdout).toMatch(/Removed agent 'python-only\.agent\.md'/);
    expect(typescriptResult.stdout).not.toMatch(/Removed agent '(?:multi|old|unlisted)/);
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("update rejects unsafe deletion targets before changing any target or outside content", async () => {
  const blueprints = await makeTempDir("spindle-unsafe-removal-blueprints-");
  const project = await makeTempDir("spindle-unsafe-removal-project-");
  const github = join(project, ".github");
  const outside = join(project, "outside.txt");
  const firstTarget = join(github, "agents", "first.agent.md");
  const secondTarget = join(github, "agents", "second.agent.md");
  try {
    writeCatalogFixture(blueprints, {
      agents: {
        first: {
          path: "first.agent.md",
          status: "removed",
          stacks: [],
        },
        second: {
          path: "second.agent.md",
          status: "removed",
          stacks: [],
        },
      },
      instructions: {},
      skills: {},
    } satisfies BlueprintCatalogDefinition);
    await writeFile(firstTarget, "first target must remain\n");
    await writeFile(outside, "outside target must remain\n");
    await symlink(outside, secondTarget);
    await writeFile(
      join(github, "spindle.json"),
      JSON.stringify({ stacks: ["python"], variables: {} }),
    );

    const result = runCli(project, ["update", "--no-interactive"], process.env.PATH ?? "", {
      SPINDLE_TEST_BLUEPRINTS_DIR: blueprints,
    });

    expect(result.status, result.stdout).not.toBe(0);
    expect(result.stderr).toMatch(/symbolic link/i);
    expect(await readFile(firstTarget, "utf8")).toBe("first target must remain\n");
    expect(await readFile(outside, "utf8")).toBe("outside target must remain\n");
    expect((await lstat(secondTarget)).isSymbolicLink()).toBe(true);
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("update rejects a directory at a file-removal target before deleting other targets", async () => {
  const blueprints = await makeTempDir("spindle-wrong-target-blueprints-");
  const project = await makeTempDir("spindle-wrong-target-project-");
  const github = join(project, ".github");
  const firstTarget = join(github, "agents", "first.agent.md");
  const wrongTarget = join(github, "agents", "second.agent.md");
  const child = join(wrongTarget, "keep.txt");
  try {
    writeCatalogFixture(blueprints, {
      agents: {
        first: {
          path: "first.agent.md",
          status: "removed",
          stacks: [],
        },
        second: {
          path: "second.agent.md",
          status: "removed",
          stacks: [],
        },
      },
      instructions: {},
      skills: {},
    } satisfies BlueprintCatalogDefinition);
    await writeFile(firstTarget, "first target must remain\n");
    await writeFile(child, "directory content must remain\n");
    await writeFile(
      join(github, "spindle.json"),
      JSON.stringify({ stacks: ["python"], variables: {} }),
    );

    const result = runCli(project, ["update", "--no-interactive"], process.env.PATH ?? "", {
      SPINDLE_TEST_BLUEPRINTS_DIR: blueprints,
    });

    expect(result.status, result.stdout).not.toBe(0);
    expect(result.stderr).toMatch(/expected a regular file/i);
    expect(await readFile(firstTarget, "utf8")).toBe("first target must remain\n");
    expect(await readFile(child, "utf8")).toBe("directory content must remain\n");
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("update reports a failed removal and already completed deletions", async () => {
  const blueprints = await makeTempDir("spindle-remove-failure-blueprints-");
  const project = await makeTempDir("spindle-remove-failure-project-");
  const github = join(project, ".github");
  const firstTarget = join(github, "agents", "first.agent.md");
  const secondTarget = join(github, "agents", "second.agent.md");
  try {
    writeCatalogFixture(blueprints, {
      agents: {
        first: {
          path: "first.agent.md",
          status: "removed",
          stacks: [],
        },
        second: {
          path: "second.agent.md",
          status: "removed",
          stacks: [],
        },
      },
      instructions: {},
      skills: {},
    } satisfies BlueprintCatalogDefinition);
    await writeFile(firstTarget, "first target\n");
    await writeFile(secondTarget, "second target\n");
    await writeFile(
      join(github, "spindle.json"),
      JSON.stringify({ stacks: ["python"], variables: {} }),
    );

    const result = runCli(project, ["update", "--no-interactive"], process.env.PATH ?? "", {
      SPINDLE_TEST_BLUEPRINTS_DIR: blueprints,
      SPINDLE_TEST_PRELOAD: resolve(process.cwd(), "tests/helpers/preloads/fail-removal.ts"),
      SPINDLE_TEST_FAIL_REMOVE_TARGET: secondTarget,
    });

    expect(result.status, result.stdout).not.toBe(0);
    expect(result.stderr).toMatch(/Failed to remove Agent 'second\.agent\.md'/);
    expect(result.stderr).toMatch(/forced removal failure/);
    expect(result.stderr).toMatch(/Completed changes: removed Agent 'first\.agent\.md'/);
    await assertMissing(firstTarget);
    expect(await readFile(secondTarget, "utf8")).toBe("second target\n");
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});
