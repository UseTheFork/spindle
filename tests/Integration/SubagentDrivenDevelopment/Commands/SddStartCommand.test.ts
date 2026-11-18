import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { startFixture } from "@test/Helpers/SubagentDrivenDevelopment/StartFixture";
import { expect, test } from "vitest";

test("starts the feature without changing the original checkout or committing records", async () => {
  const { repo, name, workspace, worktrees, git, run } = await startFixture();
  const branch = `sdd/${name}/feature`;
  const path = join(worktrees, name, "feature");
  const commit = git("rev-parse", "HEAD");
  const next = run("next", "--feature", name);
  expect(JSON.parse(next.stdout).data.actions).toEqual([`spindle sdd start --feature ${name}`]);

  const started = run("start", "--feature", workspace);
  expect(started.status, started.stderr).toBe(0);
  expect(JSON.parse(started.stdout).data).toEqual({ feature: name, branch, worktree: path });
  expect(git("symbolic-ref", "--short", "HEAD")).toBe("main");
  expect(git("rev-parse", "HEAD")).toBe(commit);
  expect(git("-C", path, "rev-parse", "HEAD")).toBe(commit);
  expect(git("status", "--short")).toContain("?? .spindle/");
  await expect(
    readFile(join(path, ".spindle", "features", name, "sdd.json")),
  ).rejects.toMatchObject({ code: "ENOENT" });
  expect(JSON.parse(await readFile(join(workspace, "sdd.json"), "utf8"))).toMatchObject({
    originalBranch: "main",
    featureBranch: branch,
    featureWorktree: path,
  });
  expect(git("rev-parse", "--show-toplevel")).toBe(repo);
});

test("resumes a journaled start after Git created the worktree without discarding changes", async () => {
  const { name, workspace, worktrees, git, run } = await startFixture();
  const branch = `sdd/${name}/feature`;
  const path = join(worktrees, name, "feature");
  const commit = git("rev-parse", "HEAD");
  const ledgerPath = join(workspace, "sdd.json");
  const ledger = JSON.parse(await readFile(ledgerPath, "utf8"));
  await writeFile(
    ledgerPath,
    JSON.stringify({
      ...ledger,
      pendingStart: { kind: "feature", originalBranch: "main", branch, worktree: path, commit },
    }),
  );
  git("worktree", "add", "-b", branch, path, commit);
  await writeFile(join(path, "preserve.txt"), "uncommitted");
  const next = run("next", "--feature", name);
  expect(JSON.parse(next.stdout).data.actions).toEqual([`spindle sdd start --feature ${name}`]);
  const resumed = run("start", "--feature", name);
  expect(resumed.status, resumed.stderr).toBe(0);
  expect(git("worktree", "list", "--porcelain").match(/^worktree /gm)).toHaveLength(2);
  expect(await readFile(join(path, "preserve.txt"), "utf8")).toBe("uncommitted");
  expect(JSON.parse(await readFile(ledgerPath, "utf8"))).not.toHaveProperty("pendingStart");
});

test("refuses a worktree directory that resolves inside the original checkout", async () => {
  const { repo, workspace, name, git, run } = await startFixture();
  await writeFile(
    join(repo, ".spindle", "config.json"),
    JSON.stringify({ stacks: ["typescript"], sdd: { worktree_directory: ".spindle/worktrees" } }),
  );
  const result = run("start", "--feature", name);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("worktrees must be outside the original checkout");
  expect(git("branch", "--list", `sdd/${name}/feature`)).toBe("");
  expect(JSON.parse(await readFile(join(workspace, "sdd.json"), "utf8"))).not.toHaveProperty(
    "pendingStart",
  );
});
