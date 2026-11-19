import { spawnSync } from "node:child_process";
import * as fs from "node:fs/promises";
import { join } from "node:path";

import { dispatchFixture } from "@test/Helpers/SubagentDrivenDevelopment/DispatchFixture";
import { expect, test } from "vitest";

test(
  "requires acceptance and records an agent-owned ticket merge in two phases",
  { timeout: 40_000 },
  async () => {
    const { featureFlag, invoke, git, run, startTicket, task, workspace, name, worktrees, repo } =
      await dispatchFixture();
    const taskId = task("first.ts");
    const { worktree: ticketWorktree } = startTicket();
    const featureWorktree = join(worktrees, name, "feature");
    const ticketBranch = `sdd/${name}/T-0001`;
    git("config", "user.name", "Test");
    git("config", "user.email", "test@example.com");
    invoke("dispatch", ...featureFlag, "--task", taskId);
    await fs.writeFile(join(ticketWorktree, "first.ts"), "first\n");
    invoke("task", "submit", ...featureFlag, "--task", taskId, "--attempt", "1");
    invoke("ticket", "commit", ...featureFlag, "--ticket", "T-0001", "--message", "Implement");
    expect(run("integrate", ...featureFlag, "--ticket", "T-0001").stderr).toContain(
      "is not accepted",
    );
    const review = invoke("review", ...featureFlag, "--ticket", "T-0001");
    invoke(
      "review",
      "submit",
      ...featureFlag,
      "--review",
      review.review,
      "--recommendation",
      "pass",
    );

    const started = invoke("integrate", ...featureFlag, "--ticket", "T-0001");
    expect(started).toMatchObject({ type: "ticket-integration", phase: "merge" });
    const assignment = invoke("assignment", "--feature", workspace, "--merge", started.operationId);
    expect(assignment).toMatchObject({
      role: "merge-agent",
      type: "ticket-integration",
      source: { branch: ticketBranch, worktree: ticketWorktree },
      target: {
        branch: `sdd/${name}/feature`,
        worktree: featureWorktree,
      },
    });
    expect(assignment).not.toHaveProperty("sourceCommit");
    expect(assignment).not.toHaveProperty("targetCommit");
    expect(
      spawnSync(
        "git",
        ["-C", featureWorktree, "merge-base", "--is-ancestor", ticketBranch, `sdd/${name}/feature`],
        { cwd: repo },
      ).status,
    ).toBe(1);
    expect(run("merge", "record", ...featureFlag, "--merge", started.operationId).stderr).toContain(
      "is not included in target branch",
    );
    expect(await fs.stat(ticketWorktree)).toBeDefined();

    git("-C", featureWorktree, "merge", "--no-ff", "--no-edit", ticketBranch);
    expect(invoke("merge", "record", ...featureFlag, "--merge", started.operationId)).toMatchObject(
      { phase: "cleanup" },
    );
    const cleanupAssignment = invoke(
      "assignment",
      "--feature",
      workspace,
      "--merge",
      started.operationId,
    );
    expect(cleanupAssignment.instructions.join(" ")).not.toContain("git merge --no-ff");
    expect(cleanupAssignment.instructions.join(" ")).toContain("branch -d");
    git("worktree", "remove", "--", ticketWorktree);
    git("-C", featureWorktree, "branch", "-d", "--", ticketBranch);
    expect(invoke("merge", "record", ...featureFlag, "--merge", started.operationId)).toMatchObject(
      { phase: "completed", ticket: "T-0001", state: "Merged" },
    );

    const ledger = JSON.parse(await fs.readFile(join(workspace, "sdd.json"), "utf8"));
    expect(ledger.tickets[0]).toMatchObject({ merged: true });
    expect(ledger).not.toHaveProperty("pendingMergeOperation");
    expect(invoke("next", ...featureFlag).tickets[0].blockers).toContainEqual({
      code: "merged",
    });
  },
);

test("keeps conflict resolution in the same merge assignment", { timeout: 40_000 }, async () => {
  const { featureFlag, invoke, git, startTicket, task, worktrees, name, workspace, repo } =
    await dispatchFixture();
  const taskId = task("shared.txt");
  const { worktree: ticketWorktree } = startTicket();
  const featureWorktree = join(worktrees, name, "feature");
  const ticketBranch = `sdd/${name}/T-0001`;
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");

  invoke("dispatch", ...featureFlag, "--task", taskId);
  await fs.writeFile(join(ticketWorktree, "shared.txt"), "ticket version\n");
  invoke("task", "submit", ...featureFlag, "--task", taskId, "--attempt", "1");
  invoke("ticket", "commit", ...featureFlag, "--ticket", "T-0001", "--message", "Ticket version");
  await fs.writeFile(join(featureWorktree, "shared.txt"), "feature version\n");
  git("-C", featureWorktree, "add", "--", "shared.txt");
  git("-C", featureWorktree, "commit", "-m", "Feature version");
  const review = invoke("review", ...featureFlag, "--ticket", "T-0001");
  invoke("review", "submit", ...featureFlag, "--review", review.review, "--recommendation", "pass");

  const started = invoke("integrate", ...featureFlag, "--ticket", "T-0001");
  const assignment = invoke("assignment", "--feature", workspace, "--merge", started.operationId);
  expect(assignment.instructions.join(" ")).toContain("Resolve conflicts within this assignment");
  expect(
    spawnSync("git", ["-C", featureWorktree, "merge", "--no-ff", "--no-edit", ticketBranch], {
      cwd: repo,
    }).status,
  ).toBe(1);
  await fs.writeFile(join(featureWorktree, "shared.txt"), "resolved version\n");
  git("-C", featureWorktree, "add", "--", "shared.txt");
  git("-C", featureWorktree, "commit", "-m", "Resolve integration");

  expect(invoke("merge", "record", ...featureFlag, "--merge", started.operationId)).toMatchObject({
    phase: "cleanup",
  });
  git("worktree", "remove", "--", ticketWorktree);
  git("-C", featureWorktree, "branch", "-d", "--", ticketBranch);
  invoke("merge", "record", ...featureFlag, "--merge", started.operationId);

  const ledger = JSON.parse(await fs.readFile(join(workspace, "sdd.json"), "utf8"));
  expect(ledger.findings).toEqual([]);
  expect(git("-C", featureWorktree, "show", "HEAD:shared.txt")).toBe("resolved version");
});
