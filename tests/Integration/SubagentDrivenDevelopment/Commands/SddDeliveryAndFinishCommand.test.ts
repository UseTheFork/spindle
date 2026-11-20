import { existsSync } from "node:fs";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { reviewFixture } from "@test/Helpers/SubagentDrivenDevelopment/ReviewFixture";
import { expect, test } from "vitest";

test(
  "verifies a scoped delivery merge and finishes through an agent-owned operation",
  { timeout: 60_000 },
  async () => {
    const fixture = await reviewFixture();
    const { featureFlag, git, invoke, name, repo, run, workspace } = fixture;
    const featureWorktree = join(fixture.worktrees, fixture.name, "feature");
    await appendFile(join(repo, ".git", "info", "exclude"), "\n.spindle/config.json\n");
    git("config", "user.name", "Test");
    git("config", "user.email", "test@example.com");
    await fixture.complete(fixture.initialTask, "first.ts");
    fixture.submitReview(fixture.startReview(), "pass");

    const integrateTicket = (ticket: string, operationId: string) => {
      const started = invoke("integrate", ...featureFlag, "--ticket", ticket);
      expect(started.operationId).toBe(operationId);
      const assignment = invoke(
        "assignment",
        "--feature",
        workspace,
        "--merge",
        started.operationId,
      );
      git(
        "-C",
        assignment.target.worktree,
        "merge",
        "--no-ff",
        "--no-edit",
        assignment.source.branch,
      );
      expect(
        invoke("merge", "record", ...featureFlag, "--merge", started.operationId),
      ).toMatchObject({ phase: "cleanup" });
      git("worktree", "remove", "--", assignment.source.worktree);
      git("-C", assignment.target.worktree, "branch", "-d", "--", assignment.source.branch);
      invoke("merge", "record", ...featureFlag, "--merge", started.operationId);
    };

    integrateTicket("T-0001", "M-0001");
    await writeFile(join(repo, "upstream.txt"), "latest original branch change\n");
    git("add", "upstream.txt");
    git("commit", "-m", "Update original branch");

    const featureReview = invoke("review", ...featureFlag, "--target", "feature");
    invoke(
      "review",
      "submit",
      ...featureFlag,
      "--review",
      featureReview.review,
      "--recommendation",
      "pass",
    );
    expect(invoke("next", ...featureFlag).actions).toContain(
      `spindle sdd delivery create --feature ${name} --write-scope=upstream.txt`,
    );

    const ledgerPath = join(workspace, "sdd.json");
    const before = await readFile(ledgerPath, "utf8");
    const uncovered = fixture.run(
      "delivery",
      "create",
      ...featureFlag,
      "--write-scope",
      "other.txt",
    );
    expect(uncovered.status).toBe(1);
    expect(uncovered.stderr).toContain("upstream.txt");
    expect(await readFile(ledgerPath, "utf8")).toBe(before);

    const delivery = invoke("delivery", "create", ...featureFlag, "--write-scope", "upstream.txt");
    expect(delivery).toMatchObject({ ticket: "T-0002", task: "T-0002.1" });
    const { worktree } = invoke("ticket", "start", ...featureFlag, "--ticket", delivery.ticket);
    invoke("dispatch", ...featureFlag, "--task", delivery.task);
    const assignment = invoke(
      "assignment",
      "--feature",
      workspace,
      "--task",
      delivery.task,
      "--attempt",
      "1",
    );
    expect(assignment).toMatchObject({
      role: "merge-agent",
      writeScope: ["upstream.txt"],
      delivery: {
        source: { branch: "main", worktree: repo },
        target: { branch: "sdd/0001-example/T-0002", worktree },
      },
    });
    expect(assignment.delivery).not.toHaveProperty("sourceCommit");
    expect(assignment.delivery).not.toHaveProperty("targetCommit");
    git("-C", worktree, "merge", "--no-ff", "--no-edit", assignment.delivery.source.branch);
    const mergeCommit = git("-C", worktree, "rev-parse", "HEAD");
    expect(
      invoke("task", "submit", ...featureFlag, "--task", delivery.task, "--attempt", "1"),
    ).toMatchObject({ commit: mergeCommit, state: "Done" });

    const ticketReview = invoke("review", ...featureFlag, "--ticket", delivery.ticket);
    invoke(
      "review",
      "submit",
      ...featureFlag,
      "--review",
      ticketReview.review,
      "--recommendation",
      "pass",
    );
    integrateTicket(delivery.ticket, "M-0002");

    const finalReview = invoke("review", ...featureFlag, "--target", "feature");
    invoke(
      "review",
      "submit",
      ...featureFlag,
      "--review",
      finalReview.review,
      "--recommendation",
      "pass",
    );
    expect(invoke("next", ...featureFlag).actions).toContain(
      `spindle sdd finish --feature ${name}`,
    );

    const started = invoke("finish", ...featureFlag);
    expect(started).toMatchObject({
      operationId: "M-0003",
      type: "feature-finish",
      phase: "merge",
    });
    expect(run("merge", "record", ...featureFlag, "--merge", "M-0002").stderr).toContain(
      "Unknown pending merge operation 'M-0002'",
    );
    const finishAssignment = invoke(
      "assignment",
      "--feature",
      workspace,
      "--merge",
      started.operationId,
    );
    expect(finishAssignment).toMatchObject({
      role: "merge-agent",
      source: { branch: `sdd/${name}/feature`, worktree: featureWorktree },
      target: { branch: "main", worktree: repo },
    });
    expect(finishAssignment).not.toHaveProperty("featureCommit");
    expect(finishAssignment).not.toHaveProperty("targetCommit");

    git("merge", "--ff-only", finishAssignment.source.branch);
    expect(invoke("merge", "record", ...featureFlag, "--merge", started.operationId)).toMatchObject(
      { phase: "cleanup" },
    );
    git("worktree", "remove", "--", featureWorktree);
    git("branch", "-d", "--", finishAssignment.source.branch);
    expect(invoke("merge", "record", ...featureFlag, "--merge", started.operationId)).toMatchObject(
      { completed: true, phase: "completed" },
    );

    expect(git("branch", "--list", `sdd/${name}/feature`)).toBe("");
    expect(existsSync(featureWorktree)).toBe(false);
    expect(JSON.parse(await readFile(ledgerPath, "utf8"))).toMatchObject({ completed: true });
  },
);
