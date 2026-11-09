import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { test, expect, vi } from "vitest";

vi.setConfig({ testTimeout: 30_000 });
import { pathToFileURL } from "node:url";

import { makeTempDir, runCliRaw, runCliWithFixtureCatalogRaw as runCli } from "../helpers.ts";
import { repoRoot } from "../helpers/TemporaryDirectories.ts";

test("init from a nested directory installs into the Git worktree root", async () => {
  const project = await makeTempDir("spindle-git-root-");
  const blueprints = await makeTempDir("spindle-git-root-blueprints-");

  execFileSync("git", ["init", "-q"], { cwd: project });
  const nested = join(project, "packages", "nested");
  await mkdir(nested, { recursive: true });
  await mkdir(join(blueprints, "skills", "demo"), { recursive: true });
  await writeFile(
    join(blueprints, "skills", "demo", "SKILL.md"),
    "---\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nDemo\n",
  );

  const env = {
    SPINDLE_TEST_BLUEPRINTS_DIR: blueprints,
  };
  const rootResult = runCli(project, ["init", "--stack", "python"], process.env.PATH ?? "", env);
  expect(rootResult.status, rootResult.stderr).toBe(0);
  const rootConfig = await readFile(join(project, ".github", "spindle.json"), "utf8");
  await rm(join(project, ".github"), { recursive: true, force: true });

  const nestedResult = runCli(nested, ["init", "--stack", "python"], process.env.PATH ?? "", env);

  expect(nestedResult.status, nestedResult.stderr).toBe(0);
  expect(nestedResult.stdout).toBe(rootResult.stdout);
  expect(await readFile(join(project, ".github", "spindle.json"), "utf8")).toMatch(
    /"stacks": \[\s*"python"\s*\]/,
  );
  expect(rootConfig).toBe(await readFile(join(project, ".github", "spindle.json"), "utf8"));
  expect(await readdir(nested)).toEqual([]);
});

test("update from a nested directory reads Config and reconciles at the Git worktree root", async () => {
  const project = await makeTempDir("spindle-git-root-update-");
  const blueprints = await makeTempDir("spindle-git-root-update-blueprints-");

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
      SPINDLE_TEST_BLUEPRINTS_DIR: blueprints,
    },
  );

  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toMatch(/updated 1/);
  expect(await readFile(join(project, ".github", "skills", "demo", "SKILL.md"), "utf8")).toMatch(
    /version: 2\.0\.0/,
  );
  expect(await readdir(nested)).toEqual([]);
});

test("workspace commands fail without Git discovery and leave the directory unchanged", async () => {
  const project = await makeTempDir("spindle-no-git-");
  for (const searchPath of [process.env.PATH ?? "", ""]) {
    const before = await readdir(project);
    const result = runCli(project, ["init", "--stack", "python"], searchPath);
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/Git working-tree root/i);
    expect(await readdir(project)).toEqual(before);
  }
});

test("setup-project and SDD status fail without Git discovery before using explicit paths", async () => {
  const invocation = await makeTempDir("spindle-command-no-git-");
  const setupTarget = await makeTempDir("spindle-command-target-");
  const workspace = await makeTempDir("spindle-command-workspace-");
  execFileSync("git", ["init", "-q"], { cwd: workspace });
  execFileSync("git", ["-C", workspace, "config", "user.name", "Fixture"]);
  execFileSync("git", ["-C", workspace, "config", "user.email", "fixture@example.invalid"]);
  await writeFile(join(workspace, "tracked.txt"), "base\n");
  execFileSync("git", ["-C", workspace, "add", "."]);
  execFileSync("git", ["-C", workspace, "commit", "-qm", "base"]);

  for (const searchPath of [process.env.PATH ?? "", ""]) {
    const setup = runCliRaw(invocation, ["setup-project", "--workspace", setupTarget], searchPath);
    expect(setup.status).not.toBe(0);
    expect(setup.stdout).toBe("");
    expect(setup.stderr).toMatch(/Git working-tree root/i);
    expect(await readdir(setupTarget)).toEqual([]);

    const sdd = runCliRaw(
      invocation,
      ["sdd", "status", "--spec", join(workspace, ".scratch/feature/spec.md")],
      searchPath,
    );
    expect(sdd.status).not.toBe(0);
    expect(sdd.stdout).toBe("");
    expect(sdd.stderr).toMatch(/Git working-tree root/i);
    expect(existsSync(join(workspace, ".scratch"))).toBe(false);
  }
});

test("help and version work outside Git when Git is unavailable", async () => {
  const project = await makeTempDir("spindle-informational-");
  for (const args of [
    ["--help"],
    ["-h"],
    ["init", "--help"],
    ["init", "-h"],
    ["update", "--help"],
    ["sdd", "--help"],
    ["sdd", "-h"],
    ["sdd", "status", "-h"],
    ["help", "sdd"],
    ["help", "sdd", "status"],
    ["setup-project", "--help"],
    ["setup-project", "-h"],
    ["help", "setup-project"],
    ["--version"],
  ]) {
    const result = runCliRaw(project, args, "");
    expect(result.status, `${args.join(" ")}: ${result.stderr}`).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout.trim()).not.toBe("");
    if (args[0] === "--version") expect(result.stdout).toBe("0.0.1\n");
    await expect(readFile(join(project, ".github", "spindle.json"))).rejects.toThrow();
  }
  expect(await readdir(project)).toEqual([]);
});

test("CLI argument errors take precedence over Git-root discovery", async () => {
  const project = await makeTempDir("spindle-invalid-args-no-git-");

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
    expect(result.status, args.join(" ")).not.toBe(0);
    expect(result.stdout, args.join(" ")).toBe("");
    expect(result.stderr.trim(), args.join(" ")).not.toBe("");
    expect(result.stderr, args.join(" ")).not.toMatch(/Git working-tree root/i);
  }
  expect(await readdir(project)).toEqual([]);
});

test("importing the executable bootstrap does not dispatch the CLI", async () => {
  const project = await makeTempDir("spindle-import-bootstrap-");
  const bootstrap = pathToFileURL(join(repoRoot, "src", "index.ts")).href;
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
      env: {
        ...process.env,
        TSX_TSCONFIG_PATH: join(repoRoot, "tsconfig.json"),
        GIT_CEILING_DIRECTORIES: repoRoot,
        PATH: "",
        Path: "",
      },
    },
  );
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toBe("");
  expect(result.stderr).toBe("");
  expect(await readdir(project)).toEqual([]);
  expect(await readdir(project)).toEqual([]);
});
