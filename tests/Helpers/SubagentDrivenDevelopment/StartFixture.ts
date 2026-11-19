import { execFileSync } from "node:child_process";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { runCliRaw } from "@test/Helpers/Cli";
import { makeTempDir } from "@test/Helpers/TemporaryDirectories";
import { expect } from "vitest";

export async function startFixture(checkout = "repo") {
  const root = await realpath(await makeTempDir());
  const repo = join(root, checkout);
  const worktrees = join(root, "worktrees");
  const setup = "touch setup-must-not-run";
  await mkdir(join(repo, ".spindle"), { recursive: true });
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
  git("init", "--initial-branch=main");
  git(
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.com",
    "commit",
    "--allow-empty",
    "-m",
    "Initial",
  );
  await writeFile(
    join(repo, ".spindle", "config.json"),
    JSON.stringify({
      stacks: ["typescript"],
      sdd: { worktree_directory: "../worktrees", setup_command: [setup] },
    }),
  );
  const run = (...args: string[]) =>
    runCliRaw(repo, ["--json", "sdd", ...args], process.env.PATH ?? "");
  const name = "0001-example";
  const workspace = join(repo, ".spindle", "features", name);
  const created = run("create", "--slug", "example");
  expect(created.status, created.stderr).toBe(0);
  await writeFile(join(workspace, "spec.md"), "Feature requirements.");
  return { repo, workspace, worktrees, name, setup, git, run };
}
