import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import { makeTempDir, runCliRaw, runCliWithFixtureCatalogRaw as runCli } from "./helpers.ts";

test("init from a nested directory installs into the Git worktree root", async () => {
  const project = await makeTempDir("spindle-git-root-");
  const blueprints = await makeTempDir("spindle-git-root-blueprints-");

  try {
    execFileSync("git", ["init", "-q"], { cwd: project });
    const nested = join(project, "packages", "nested");
    await mkdir(nested, { recursive: true });
    await mkdir(join(blueprints, "skills", "demo"), { recursive: true });
    await writeFile(
      join(blueprints, "skills", "demo", "SKILL.md"),
      "---\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nDemo\n",
    );

    const env = {
      SPINDLE_BLUEPRINTS_DIR: blueprints,
    };
    const rootResult = runCli(project, ["init", "--stack", "python"], process.env.PATH ?? "", env);
    assert.equal(rootResult.status, 0, rootResult.stderr);
    const rootConfig = await readFile(join(project, ".github", "spindle.json"), "utf8");
    await rm(join(project, ".github"), { recursive: true, force: true });

    const nestedResult = runCli(nested, ["init", "--stack", "python"], process.env.PATH ?? "", env);

    assert.equal(nestedResult.status, 0, nestedResult.stderr);
    assert.equal(nestedResult.stdout, rootResult.stdout);
    assert.match(
      await readFile(join(project, ".github", "spindle.json"), "utf8"),
      /"stacks": \[\s*"python"\s*\]/,
    );
    assert.equal(rootConfig, await readFile(join(project, ".github", "spindle.json"), "utf8"));
    assert.deepEqual(await readdir(nested), []);
  } finally {
    await rm(project, { recursive: true, force: true });
    await rm(blueprints, { recursive: true, force: true });
  }
});

test("update from a nested directory reads Config and reconciles at the Git worktree root", async () => {
  const project = await makeTempDir("spindle-git-root-update-");
  const blueprints = await makeTempDir("spindle-git-root-update-blueprints-");

  try {
    execFileSync("git", ["init", "-q"], { cwd: project });
    const nested = join(project, "packages", "nested");
    const skill = join(blueprints, "skills", "demo");
    await mkdir(nested, { recursive: true });
    await mkdir(skill, { recursive: true });
    await writeFile(
      join(skill, "SKILL.md"),
      "---\nmetadata:\n  spindle:\n    version: 2.0.0\n---\nUpdated\n",
    );
    await mkdir(join(project, ".github", "skills", "demo"), { recursive: true });
    await writeFile(
      join(project, ".github", "spindle.json"),
      JSON.stringify({ stacks: ["python"], variables: {} }),
    );
    await writeFile(
      join(project, ".github", "skills", "demo", "SKILL.md"),
      "---\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nInstalled\n",
    );

    const result = runCli(
      nested,
      ["update", "--no-interactive", "--on-conflict", "overwrite"],
      process.env.PATH ?? "",
      {
        SPINDLE_BLUEPRINTS_DIR: blueprints,
      },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /updated 1/);
    assert.match(
      await readFile(join(project, ".github", "skills", "demo", "SKILL.md"), "utf8"),
      /version: 2\.0\.0/,
    );
    assert.deepEqual(await readdir(nested), []);
  } finally {
    await rm(project, { recursive: true, force: true });
    await rm(blueprints, { recursive: true, force: true });
  }
});

test("workspace commands fail without Git discovery and leave the directory unchanged", async () => {
  const project = await mkdtemp(join(tmpdir(), "spindle-no-git-"));
  try {
    for (const searchPath of [process.env.PATH ?? "", ""]) {
      const before = await readdir(project);
      const result = runCli(project, ["init", "--stack", "python"], searchPath);
      assert.notEqual(result.status, 0);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /Git working-tree root/i);
      assert.deepEqual(await readdir(project), before);
    }
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("setup-project and SDD workspace fail without Git discovery before using explicit paths", async (t) => {
  const invocation = await mkdtemp(join(tmpdir(), "spindle-command-no-git-"));
  const setupTarget = await mkdtemp(join(tmpdir(), "spindle-command-target-"));
  const workspace = await makeTempDir("spindle-command-workspace-");
  t.after(async () => {
    await rm(invocation, { recursive: true, force: true });
    await rm(setupTarget, { recursive: true, force: true });
    await rm(workspace, { recursive: true, force: true });
  });
  execFileSync("git", ["init", "-q"], { cwd: workspace });
  execFileSync("git", ["-C", workspace, "config", "user.name", "Fixture"]);
  execFileSync("git", ["-C", workspace, "config", "user.email", "fixture@example.invalid"]);
  await writeFile(join(workspace, "tracked.txt"), "base\n");
  execFileSync("git", ["-C", workspace, "add", "."]);
  execFileSync("git", ["-C", workspace, "commit", "-qm", "base"]);

  for (const searchPath of [process.env.PATH ?? "", ""]) {
    const setup = runCliRaw(invocation, ["setup-project", "--workspace", setupTarget], searchPath);
    assert.notEqual(setup.status, 0);
    assert.equal(setup.stdout, "");
    assert.match(setup.stderr, /Git working-tree root/i);
    assert.deepEqual(await readdir(setupTarget), []);

    const sdd = runCliRaw(
      invocation,
      [
        "sdd",
        "workspace",
        "--workspace",
        workspace,
        "--reports-dir",
        ".scratch/feature/reports",
        "--ticket",
        "03",
      ],
      searchPath,
    );
    assert.notEqual(sdd.status, 0);
    assert.equal(sdd.stdout, "");
    assert.match(sdd.stderr, /Git working-tree root/i);
    assert.equal(existsSync(join(workspace, ".scratch")), false);
  }
});

test("help and version work outside Git when Git is unavailable", async () => {
  const project = await mkdtemp(join(tmpdir(), "spindle-informational-"));
  try {
    for (const args of [
      ["--help"],
      ["-h"],
      ["init", "--help"],
      ["init", "-h"],
      ["update", "--help"],
      ["sdd", "--help"],
      ["sdd", "-h"],
      ["sdd", "workspace", "-h"],
      ["help", "sdd"],
      ["help", "sdd", "workspace"],
      ["setup-project", "--help"],
      ["setup-project", "-h"],
      ["help", "setup-project"],
      ["--version"],
    ]) {
      const result = runCliRaw(project, args, "");
      assert.equal(result.status, 0, `${args.join(" ")}: ${result.stderr}`);
      assert.equal(result.stderr, "");
      assert.notEqual(result.stdout.trim(), "");
      if (args[0] === "--version") assert.equal(result.stdout, "0.0.1\n");
      await assert.rejects(readFile(join(project, ".github", "spindle.json")));
    }
    assert.deepEqual(await readdir(project), []);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("CLI argument errors take precedence over Git-root discovery", async (t) => {
  const project = await mkdtemp(join(tmpdir(), "spindle-invalid-args-no-git-"));
  t.after(() => rm(project, { recursive: true, force: true }));

  const invalidInvocations = [
    [
      "sdd",
      "workspace",
      "--workspace",
      join(project, "target"),
      "--reports-dir",
      ".scratch/reports",
      "--ticket",
      "invalid",
    ],
    [
      "sdd",
      "workspace",
      "--workspace",
      join(project, "target"),
      "--reports-dir",
      ".scratch/reports",
      "--ticket",
      "03",
      "unexpected",
    ],
    ["setup-project", "--workspace", "relative"],
    ["setup-project", "--workspace", join(project, "target"), "unexpected"],
    [
      "setup-project",
      "--workspace",
      join(project, "target"),
      "--workspace",
      join(project, "target"),
    ],
  ];

  for (const args of invalidInvocations) {
    const result = runCliRaw(project, args, "");
    assert.notEqual(result.status, 0, args.join(" "));
    assert.equal(result.stdout, "", args.join(" "));
    assert.notEqual(result.stderr.trim(), "", args.join(" "));
    assert.doesNotMatch(result.stderr, /Git working-tree root/i, args.join(" "));
  }
  assert.deepEqual(await readdir(project), []);
});

test("importing the executable bootstrap does not dispatch the CLI", async () => {
  const project = await mkdtemp(join(tmpdir(), "spindle-import-bootstrap-"));
  try {
    const bootstrap = pathToFileURL(join(process.cwd(), "src", "index.ts")).href;
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        import.meta.resolve("tsx"),
        "--input-type=module",
        "-e",
        `await import(${JSON.stringify(bootstrap)})`,
      ],
      {
        cwd: project,
        encoding: "utf8",
        env: { ...process.env, PATH: "", Path: "" },
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "");
    assert.deepEqual(await readdir(project), []);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});
