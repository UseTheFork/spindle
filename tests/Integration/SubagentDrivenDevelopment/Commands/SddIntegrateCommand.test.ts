import * as fs from "node:fs/promises";
import { join } from "node:path";

import { runCliRaw } from "@test/Helpers/Cli";
import { dispatchFixture } from "@test/Helpers/SubagentDrivenDevelopment/DispatchFixture";
import { expect, test } from "vitest";

test(
  "requires acceptance and recovers both merge and cleanup interruptions",
  { timeout: 30_000 },
  async () => {
    const { featureFlag, invoke, git, repo, run, startTicket, task, workspace } =
      await dispatchFixture();
    const taskId = task("first.ts");
    const { worktree: ticketWorktree } = startTicket();
    git("config", "user.name", "Test");
    git("config", "user.email", "test@example.com");
    invoke("dispatch", ...featureFlag, "--task", taskId);
    await fs.writeFile(join(ticketWorktree, "first.ts"), "first\n");
    invoke("task", "submit", ...featureFlag, "--task", taskId, "--attempt", "1");
    invoke("ticket", "commit", ...featureFlag, "--ticket", "T-0001", "--message", "Implement");
    const startReview = () => invoke("review", ...featureFlag, "--ticket", "T-0001");
    const submitReview = (id: string) =>
      invoke("review", "submit", ...featureFlag, "--review", id, "--recommendation", "pass");
    expect(run("integrate", ...featureFlag, "--ticket", "T-0001").stderr).toContain(
      "is not accepted",
    );
    const review = startReview();
    submitReview(review.review);
    expect(invoke("next", ...featureFlag).actions).toContain(
      `spindle sdd integrate --feature ${featureFlag[1]} --ticket T-0001`,
    );

    const ledger = join(workspace, "sdd.json");
    const interrupted = runCliRaw(
      repo,
      ["--json", "sdd", "integrate", ...featureFlag, "--ticket", "T-0001"],
      process.env.PATH ?? "",
      {
        SPINDLE_TEST_PRELOAD: "tests/Helpers/Preloads/fail-ticket-integration-publication.ts",
        SPINDLE_TEST_LEDGER: ledger,
      },
    );
    expect(interrupted.status).toBe(1);
    expect(interrupted.stderr).toContain("Injected failure publishing the completed integration.");
    const pending = JSON.parse(await fs.readFile(ledger, "utf8")).pendingIntegration;
    expect(pending).toMatchObject({ ticketId: "T-0001", phase: "merging" });
    const cleanupInterrupted = runCliRaw(
      repo,
      ["--json", "sdd", "integrate", ...featureFlag, "--ticket", "T-0001"],
      process.env.PATH ?? "",
      {
        SPINDLE_TEST_PRELOAD: "tests/Helpers/Preloads/fail-ticket-integration-publication.ts",
        SPINDLE_TEST_LEDGER: ledger,
        SPINDLE_TEST_FAIL_WRITE: "2",
      },
    );
    expect(cleanupInterrupted.status).toBe(1);
    expect(cleanupInterrupted.stderr).toContain(
      "Injected failure publishing the completed integration.",
    );
    expect(JSON.parse(await fs.readFile(ledger, "utf8")).pendingIntegration).toMatchObject({
      ticketId: "T-0001",
      phase: "merged",
    });
    expect(git("worktree", "list", "--porcelain").includes(ticketWorktree)).toBe(false);
    expect(git("-C", repo, "branch", "--list", "sdd/0001-example/T-0001")).toBe("");
    expect(invoke("next", ...featureFlag).actions).toEqual([
      `spindle sdd integrate --feature ${featureFlag[1]} --ticket T-0001`,
    ]);
    const result = invoke("integrate", ...featureFlag, "--ticket", "T-0001");
    expect(result).toMatchObject({ kind: "merged", state: "Merged", ticket: "T-0001" });
    const featureWorktree = join(join(repo, "..", "worktrees"), featureFlag[1], "feature");
    expect(git("-C", featureWorktree, "rev-parse", "HEAD")).toBe(result.commit);
    expect(git("-C", repo, "branch", "--list", "sdd/0001-example/T-0001")).toBe("");
    expect(JSON.parse(await fs.readFile(ledger, "utf8")).tickets[0]).toMatchObject({
      merged: true,
    });
    expect(JSON.parse(await fs.readFile(ledger, "utf8")).pendingIntegration).toBeUndefined();
    expect(invoke("next", ...featureFlag).tickets[0].blockers).toContainEqual({ code: "merged" });
  },
);

test(
  "records conflicts, requires scoped merge work, reviews the result, and resumes integration",
  { timeout: 40_000 },
  async () => {
    const { featureFlag, invoke, git, run, startTicket, task, worktrees, name, workspace } =
      await dispatchFixture();
    const taskId = task("shared.txt", "--write-scope", ".spindle/review-notes.md");
    const { worktree: ticketWorktree } = startTicket();
    const featureWorktree = join(worktrees, name, "feature");
    git("config", "user.name", "Test");
    git("config", "user.email", "test@example.com");

    invoke("dispatch", ...featureFlag, "--task", taskId);
    await fs.writeFile(join(ticketWorktree, "shared.txt"), "ticket version\n");
    invoke("task", "submit", ...featureFlag, "--task", taskId, "--attempt", "1");
    invoke("ticket", "commit", ...featureFlag, "--ticket", "T-0001", "--message", "Ticket version");
    await fs.writeFile(join(featureWorktree, "shared.txt"), "feature version\n");
    git("-C", featureWorktree, "add", "--", "shared.txt");
    git("-C", featureWorktree, "commit", "-m", "Feature version");
    const firstReview = invoke("review", ...featureFlag, "--ticket", "T-0001");
    invoke(
      "review",
      "submit",
      ...featureFlag,
      "--review",
      firstReview.review,
      "--recommendation",
      "pass",
    );

    const conflict = invoke("integrate", ...featureFlag, "--ticket", "T-0001");
    expect(conflict.kind).toBe("conflict");
    expect(conflict.conflict.conflictedPaths).toEqual(["shared.txt"]);
    expect(
      run(
        "finding",
        "fix",
        ...featureFlag,
        "--finding",
        conflict.conflict.id,
        "--instructions",
        "Resolve the merge conflict.",
        "--write-scope",
        "other.txt",
        "--depends-on",
        taskId,
      ).stderr,
    ).toContain("scope must cover all incoming and conflicted paths");
    const { task: mergeTask } = invoke(
      "finding",
      "fix",
      ...featureFlag,
      "--finding",
      conflict.conflict.id,
      "--instructions",
      "Resolve the merge conflict.",
      "--write-scope",
      "shared.txt",
      "--depends-on",
      taskId,
    );
    invoke("dispatch", ...featureFlag, "--task", mergeTask);
    const assignment = invoke(
      "assignment",
      "--feature",
      workspace,
      "--task",
      mergeTask,
      "--attempt",
      "1",
    );
    expect(assignment.role).toBe("merge-agent");
    expect(assignment.finding.id).toBe(conflict.conflict.id);
    expect(
      run("task", "submit", ...featureFlag, "--task", mergeTask, "--attempt", "1").stderr,
    ).toContain("Resolve merge conflicts before submitting");
    await fs.writeFile(join(ticketWorktree, "shared.txt"), "merged version\n");
    git("-C", ticketWorktree, "add", "--", "shared.txt");
    git("-C", ticketWorktree, "commit", "-m", "Resolve integration");
    const submitted = invoke(
      "task",
      "submit",
      ...featureFlag,
      "--task",
      mergeTask,
      "--attempt",
      "1",
    );
    expect(submitted).toMatchObject({ finding: conflict.conflict.id, state: "Done" });
    const ledger = JSON.parse(await fs.readFile(join(workspace, "sdd.json"), "utf8"));
    expect(ledger.findings[0].decision).toBe("resolved");
    expect(ledger.tickets[0].workRoundCommits.at(-1)).toBe(submitted.commit);

    const followup = invoke("review", ...featureFlag, "--ticket", "T-0001");
    invoke(
      "review",
      "submit",
      ...featureFlag,
      "--review",
      followup.review,
      "--recommendation",
      "pass",
    );
    expect(invoke("next", ...featureFlag).actions).toContain(
      `spindle sdd integrate --feature ${name} --ticket T-0001`,
    );
    const result = invoke("integrate", ...featureFlag, "--ticket", "T-0001");
    expect(result).toMatchObject({ kind: "merged", ticket: "T-0001" });
    expect(git("-C", featureWorktree, "show", "HEAD:shared.txt")).toBe("merged version");
    expect(git("worktree", "list", "--porcelain").includes(ticketWorktree)).toBe(false);
    expect(
      JSON.parse(await fs.readFile(join(workspace, "sdd.json"), "utf8")).tickets[0].merged,
    ).toBe(true);
  },
);
