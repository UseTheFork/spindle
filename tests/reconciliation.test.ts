import assert from "node:assert/strict";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { reconcileBlueprints } from "../src/blueprints/lifecycle.ts";
import { skillHandler } from "../src/blueprints/skills/handler.ts";
import { makeTempDir } from "./helpers.ts";

async function writeSkill(root: string, name: string, version: string | null, body = "") {
  const directory = join(root, name);
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "SKILL.md"),
    `---\n${version === null ? "" : `version: ${version}\n`}---\n${body}`,
  );
}

const handlerFor = (stubRoot: string) => ({
  ...skillHandler,
  sourceDirectory: () => join(stubRoot, "skills"),
});

test("init reconciliation returns outcomes, replaces selected conflicts, and installs every Stub", async () => {
  const project = await makeTempDir("spindle-reconcile-project-");
  const stubRoot = await makeTempDir("spindle-reconcile-stubs-");
  const githubDirectory = join(project, ".github");
  try {
    for (const name of ["demo", "new-skill"]) {
      await mkdir(join(stubRoot, "skills", name), { recursive: true });
      await writeFile(
        join(stubRoot, "skills", name, "SKILL.md"),
        `---\nname: ${name}\nversion: 1.0.0\n---\n`,
      );
    }
    await mkdir(join(githubDirectory, "skills", "demo"), { recursive: true });
    await writeFile(join(githubDirectory, "skills", "demo", "SKILL.md"), "existing");
    await writeFile(join(githubDirectory, "skills", "demo", "stale.txt"), "remove me");

    const conflicts: string[] = [];
    const outcomes = await reconcileBlueprints([handlerFor(stubRoot)], {
      mode: "init",
      githubDirectory,
      context: { stacks: ["python"], variables: {} },
      config: { stacks: ["python"], variables: {} },
      chooseConflict: async (name) => {
        conflicts.push(name);
        return "overwrite";
      },
    });

    assert.deepEqual(conflicts, ["demo"]);
    assert.deepEqual(outcomes, [
      { name: "demo", status: "installed" },
      { name: "new-skill", status: "installed" },
    ]);
    assert.deepEqual(await readdir(join(githubDirectory, "skills", "demo")), ["SKILL.md"]);
    assert.match(
      await readFile(join(githubDirectory, "skills", "demo", "SKILL.md"), "utf8"),
      /version: 1\.0\.0/,
    );
    assert.deepEqual(JSON.parse(await readFile(join(githubDirectory, "spindle.json"), "utf8")), {
      stacks: ["python"],
      variables: {},
    });
  } finally {
    await rm(project, { recursive: true, force: true });
    await rm(stubRoot, { recursive: true, force: true });
  }
});

test("init reconciliation leaves skipped conflicts alone and still writes Config", async () => {
  const project = await makeTempDir("spindle-reconcile-project-");
  const stubRoot = await makeTempDir("spindle-reconcile-stubs-");
  const githubDirectory = join(project, ".github");
  const config = { stacks: ["typescript"], variables: { owner: "team" } };
  try {
    await writeSkill(join(stubRoot, "skills"), "demo", "1.0.0", "shipped");
    await writeSkill(join(githubDirectory, "skills"), "demo", "9.0.0", "existing");

    const outcomes = await reconcileBlueprints([handlerFor(stubRoot)], {
      mode: "init",
      githubDirectory,
      context: { stacks: config.stacks, variables: config.variables },
      config,
      chooseConflict: async () => "skip",
    });

    assert.deepEqual(outcomes, [{ name: "demo", status: "skipped" }]);
    assert.equal(
      await readFile(join(githubDirectory, "skills", "demo", "SKILL.md"), "utf8"),
      "---\nversion: 9.0.0\n---\nexisting",
    );
    assert.deepEqual(
      JSON.parse(await readFile(join(githubDirectory, "spindle.json"), "utf8")),
      config,
    );
  } finally {
    await rm(project, { recursive: true, force: true });
    await rm(stubRoot, { recursive: true, force: true });
  }
});

test("update reconciliation returns per-Skill version outcomes and skips uninstalled Stubs", async () => {
  const project = await makeTempDir("spindle-reconcile-project-");
  const stubRoot = await makeTempDir("spindle-reconcile-stubs-");
  const githubDirectory = join(project, ".github");
  try {
    await writeSkill(join(stubRoot, "skills"), "newer", "2.0.0", "shipped");
    await writeSkill(join(stubRoot, "skills"), "equal", "1.0.0", "shipped");
    await writeSkill(join(stubRoot, "skills"), "older", "1.0.0", "shipped");
    await writeSkill(join(stubRoot, "skills"), "missing-version", "1.0.0", "shipped");
    await writeSkill(join(stubRoot, "skills"), "invalid-version", "1.0.0", "shipped");
    await writeSkill(join(githubDirectory, "skills"), "newer", "1.0.0", "old");
    await writeSkill(join(githubDirectory, "skills"), "equal", "1.0.0", "unchanged");
    await writeSkill(join(githubDirectory, "skills"), "older", "2.0.0", "unchanged");
    await writeSkill(join(githubDirectory, "skills"), "missing-version", null, "uncertain");
    await writeSkill(join(githubDirectory, "skills"), "invalid-version", "v1", "uncertain");

    const outcomes = await reconcileBlueprints([handlerFor(stubRoot)], {
      mode: "update",
      githubDirectory,
      context: { stacks: ["python"], variables: {} },
      conflictPolicy: "overwrite",
    });

    assert.deepEqual(outcomes, [
      { name: "equal", status: "up-to-date" },
      {
        name: "invalid-version",
        status: "skipped",
        warning: "Skipping 'invalid-version': installed SKILL.md has non-semver version 'v1'.",
      },
      {
        name: "missing-version",
        status: "skipped",
        warning: "Skipping 'missing-version': installed SKILL.md has no version.",
      },
      { name: "newer", status: "updated" },
      { name: "older", status: "up-to-date" },
    ]);
    assert.match(
      await readFile(join(githubDirectory, "skills", "newer", "SKILL.md"), "utf8"),
      /version: 2\.0\.0/,
    );
    await assert.rejects(readFile(join(githubDirectory, "skills", "not-installed", "SKILL.md")));
    assert.equal(
      await readFile(join(githubDirectory, "skills", "invalid-version", "SKILL.md"), "utf8"),
      "---\nversion: v1\n---\nuncertain",
    );
  } finally {
    await rm(project, { recursive: true, force: true });
    await rm(stubRoot, { recursive: true, force: true });
  }
});

test("update reconciliation rejects an invalid shipped version before overwriting an installed Skill", async () => {
  const project = await makeTempDir("spindle-reconcile-project-");
  const stubRoot = await makeTempDir("spindle-reconcile-stubs-");
  const githubDirectory = join(project, ".github");
  try {
    await writeSkill(join(stubRoot, "skills"), "demo", "v2", "shipped");
    await writeSkill(join(githubDirectory, "skills"), "demo", "1.0.0", "existing");

    await assert.rejects(
      reconcileBlueprints([handlerFor(stubRoot)], {
        mode: "update",
        githubDirectory,
        context: { stacks: ["python"], variables: {} },
        conflictPolicy: "overwrite",
      }),
      /shipped skill Blueprint 'demo' has no valid semver version/,
    );
    assert.equal(
      await readFile(join(githubDirectory, "skills", "demo", "SKILL.md"), "utf8"),
      "---\nversion: 1.0.0\n---\nexisting",
    );
  } finally {
    await rm(project, { recursive: true, force: true });
    await rm(stubRoot, { recursive: true, force: true });
  }
});
