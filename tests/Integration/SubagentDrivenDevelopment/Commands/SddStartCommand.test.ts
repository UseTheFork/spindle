import { readFile, realpath, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { runCliRaw } from "@test/Helpers/Cli";
import { startFixture } from "@test/Helpers/SubagentDrivenDevelopment/StartFixture";
import { makeTempDir } from "@test/Helpers/TemporaryDirectories";
import { expect, test } from "vitest";

test("points ticketless features to planning and rejects a fresh start", async () => {
  const { name, workspace, worktrees, git, run } = await startFixture();
  const ledgerPath = join(workspace, "sdd.json");
  const ledgerBefore = await readFile(ledgerPath, "utf8");

  const next = run("next", "--feature", name, "--verbose");
  expect(next.status, next.stderr).toBe(0);
  expect(JSON.parse(next.stdout).data).toEqual({
    feature: name,
    actions: [],
    notices: [
      "No tickets in this feature.",
      "Run /sdd-to-tickets with the approved spec to plan tickets and tasks before starting.",
    ],
    tickets: [],
    graph: [],
  });

  const start = run("start", "--feature", name);
  expect(start.status).toBe(1);
  expect(start.stderr).toContain("has no tickets. Run /sdd-to-tickets");
  expect(await readFile(ledgerPath, "utf8")).toBe(ledgerBefore);
  expect(git("branch", "--list", `sdd/${name}/feature`)).toBe("");
  await expect(stat(join(worktrees, name, "feature"))).rejects.toMatchObject({ code: "ENOENT" });
});

test("starts the feature without changing the original checkout or committing records", async () => {
  const { repo, name, workspace, worktrees, git, run, createTicket } = await startFixture();
  createTicket();
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

test("resumes a journaled start with no tickets without discarding worktree changes", async () => {
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
  const { repo, workspace, name, git, run, createTicket } = await startFixture();
  createTicket();
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

test.each(["~", "~/source/worktrees"])(
  "expands the home directory in worktree_directory %s",
  async (directory) => {
    const { repo, workspace, name, git, createTicket } = await startFixture();
    createTicket();
    const home = await realpath(await makeTempDir());
    await writeFile(
      join(repo, ".spindle", "config.json"),
      JSON.stringify({ stacks: ["typescript"], sdd: { worktree_directory: directory } }),
    );
    const result = runCliRaw(
      repo,
      ["--json", "sdd", "start", "--feature", name],
      process.env.PATH ?? "",
      { HOME: home, USERPROFILE: home },
    );
    expect(result.status, result.stderr).toBe(0);
    const path = join(home, directory === "~" ? "" : "source/worktrees", name, "feature");
    expect(JSON.parse(result.stdout).data.worktree).toBe(path);
    expect(git("-C", path, "rev-parse", "--show-toplevel")).toBe(path);
    expect(JSON.parse(await readFile(join(workspace, "sdd.json"), "utf8"))).toMatchObject({
      featureWorktree: path,
    });
  },
);

test("refuses a home-relative worktree directory inside the original checkout", async () => {
  const { repo, workspace, name, git, createTicket } = await startFixture();
  createTicket();
  await writeFile(
    join(repo, ".spindle", "config.json"),
    JSON.stringify({ stacks: ["typescript"], sdd: { worktree_directory: "~/worktrees" } }),
  );
  const ledger = await readFile(join(workspace, "sdd.json"), "utf8");
  const result = runCliRaw(
    repo,
    ["--json", "sdd", "start", "--feature", name],
    process.env.PATH ?? "",
    { HOME: repo, USERPROFILE: repo },
  );
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("worktrees must be outside the original checkout");
  expect(git("branch", "--list", `sdd/${name}/feature`)).toBe("");
  expect(await readFile(join(workspace, "sdd.json"), "utf8")).toBe(ledger);
});
