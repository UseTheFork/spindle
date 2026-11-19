import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { startFixture } from "@test/Helpers/SubagentDrivenDevelopment/StartFixture";
import { expect, test } from "vitest";

test("starts only ready tickets at the feature tip and returns setup without running it", async () => {
  const { repo, name, workspace, worktrees, setup, git, run, createTicket } = await startFixture();
  const instruction = "Instruction: Copy .env from the original checkout to the ticket worktree.";
  await writeFile(
    join(repo, ".spindle", "config.json"),
    JSON.stringify({
      stacks: ["typescript"],
      sdd: { worktree_directory: "../worktrees", setup_command: [instruction, setup] },
    }),
  );
  const featureFlag = ["--feature", name];
  const ticketFlag = ["--ticket", "T-0001"];
  const invoke = (...args: string[]) => {
    const result = run(...args);
    expect(result.status, result.stderr).toBe(0);
    return JSON.parse(result.stdout).data;
  };
  createTicket();
  invoke("start", ...featureFlag);
  expect(run("ticket", "start", ...featureFlag, ...ticketFlag).stderr).toContain("not ready");
  invoke(
    "task",
    "create",
    ...featureFlag,
    ...ticketFlag,
    "--instructions",
    "Edit the schema",
    "--write-scope",
    "src/schema.ts",
  );
  const action = `spindle sdd ticket start --feature ${name} --ticket T-0001`;
  expect(invoke("next", ...featureFlag).actions).toEqual([action]);

  const featureTree = join(worktrees, name, "feature");
  git(
    "-C",
    featureTree,
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.com",
    "commit",
    "--allow-empty",
    "-m",
    "Feature progress",
  );
  const worktree = join(worktrees, name, "T-0001");
  const branch = `sdd/${name}/T-0001`;
  expect(invoke("ticket", "start", ...featureFlag, ...ticketFlag)).toEqual({
    feature: name,
    ticket: "T-0001",
    branch,
    worktree,
    setupCommands: [instruction, setup],
  });
  expect(git("-C", worktree, "rev-parse", "HEAD")).toBe(
    git("-C", featureTree, "rev-parse", "HEAD"),
  );
  expect(git("-C", worktree, "rev-parse", "HEAD")).not.toBe(git("rev-parse", "HEAD"));
  await expect(stat(join(worktree, "setup-must-not-run"))).rejects.toMatchObject({
    code: "ENOENT",
  });
  expect(JSON.parse(await readFile(join(workspace, "sdd.json"), "utf8")).tickets[0]).toMatchObject({
    branch,
    worktree,
  });
  expect(invoke("next", ...featureFlag).actions).toEqual([
    `spindle sdd dispatch --feature ${name} --task T-0001.1`,
  ]);
});
