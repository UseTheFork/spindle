import { existsSync } from "node:fs";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

import { reviewFixture } from "@test/Helpers/SubagentDrivenDevelopment/ReviewFixture";
import { expect, test } from "vitest";

test(
  "verifies a scoped delivery merge, integrates it, and safely finishes the feature",
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
    invoke("integrate", ...featureFlag, "--ticket", "T-0001");
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
    const uncovered = run("delivery", "create", ...featureFlag, "--write-scope", "other.txt");
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
        originalBranch: "main",
        sourceCommit: git("rev-parse", "HEAD"),
      },
    });
    git(
      "-C",
      worktree,
      "merge",
      "--no-ff",
      "-m",
      "Merge original branch",
      assignment.delivery.sourceCommit,
    );
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
    invoke("integrate", ...featureFlag, "--ticket", delivery.ticket);
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

    const featureCommit = git("-C", featureWorktree, "rev-parse", "HEAD");
    expect(invoke("finish", ...featureFlag)).toMatchObject({
      feature: name,
      originalBranch: "main",
      featureCommit,
      completed: true,
    });
    expect(git("rev-parse", "HEAD")).toBe(featureCommit);
    expect(git("branch", "--list", `sdd/${name}/feature`)).toBe("");
    expect(existsSync(featureWorktree)).toBe(false);
    expect(JSON.parse(await readFile(ledgerPath, "utf8"))).toMatchObject({ completed: true });
  },
);

test(
  "resumes a prepared finish after the original branch has already fast-forwarded",
  { timeout: 40_000 },
  async () => {
    const fixture = await reviewFixture();
    const { featureFlag, featureWorktree, git, invoke, name, repo, workspace } = {
      ...fixture,
      featureWorktree: join(fixture.worktrees, fixture.name, "feature"),
    };
    await appendFile(join(repo, ".git", "info", "exclude"), "\n.spindle/config.json\n");
    git("config", "user.name", "Test");
    git("config", "user.email", "test@example.com");
    await fixture.complete(fixture.initialTask, "first.ts");
    fixture.submitReview(fixture.startReview(), "pass");
    invoke("integrate", ...featureFlag, "--ticket", "T-0001");
    const review = invoke("review", ...featureFlag, "--target", "feature");
    invoke(
      "review",
      "submit",
      ...featureFlag,
      "--review",
      review.review,
      "--recommendation",
      "pass",
    );

    const ledgerPath = join(workspace, "sdd.json");
    const ledger = JSON.parse(await readFile(ledgerPath, "utf8"));
    const originalCommit = git("rev-parse", "HEAD");
    const featureCommit = git("-C", featureWorktree, "rev-parse", "HEAD");
    ledger.pendingFinish = {
      originalBranch: "main",
      featureBranch: `sdd/${name}/feature`,
      featureWorktree,
      featureWorkspace: relative(repo, workspace),
      originalCommit,
      featureCommit,
      phase: "prepared",
    };
    await writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
    git("merge", "--ff-only", featureCommit);
    expect(invoke("next", ...featureFlag).actions).toEqual([
      `spindle sdd finish --feature ${name}`,
    ]);

    expect(invoke("finish", ...featureFlag)).toMatchObject({ completed: true, feature: name });
    expect(JSON.parse(await readFile(ledgerPath, "utf8"))).toMatchObject({ completed: true });
    expect(existsSync(featureWorktree)).toBe(false);
  },
);

test(
  "clears a prepared finish when the original branch moves and offers a fresh delivery",
  { timeout: 40_000 },
  async () => {
    const fixture = await reviewFixture();
    const { featureFlag, git, invoke, name, repo, run, workspace } = fixture;
    const featureWorktree = join(fixture.worktrees, fixture.name, "feature");
    await appendFile(join(repo, ".git", "info", "exclude"), "\n.spindle/config.json\n");
    git("config", "user.name", "Test");
    git("config", "user.email", "test@example.com");
    await fixture.complete(fixture.initialTask, "first.ts");
    fixture.submitReview(fixture.startReview(), "pass");
    invoke("integrate", ...featureFlag, "--ticket", "T-0001");
    const review = invoke("review", ...featureFlag, "--target", "feature");
    invoke(
      "review",
      "submit",
      ...featureFlag,
      "--review",
      review.review,
      "--recommendation",
      "pass",
    );

    const ledgerPath = join(workspace, "sdd.json");
    const ledger = JSON.parse(await readFile(ledgerPath, "utf8"));
    const originalCommit = git("rev-parse", "HEAD");
    const featureCommit = git("-C", featureWorktree, "rev-parse", "HEAD");
    ledger.pendingFinish = {
      originalBranch: "main",
      featureBranch: `sdd/${name}/feature`,
      featureWorktree,
      featureWorkspace: relative(repo, workspace),
      originalCommit,
      featureCommit,
      phase: "prepared",
    };
    await writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
    await writeFile(join(repo, "late.txt"), "new original branch work\n");
    git("add", "late.txt");
    git("commit", "-m", "Advance original branch");
    const movedOriginal = git("rev-parse", "HEAD");

    const staleFinish = run("finish", ...featureFlag);
    expect(staleFinish.status).toBe(1);
    expect(staleFinish.stderr).toContain("Repeat delivery against its latest tip");
    expect(git("rev-parse", "HEAD")).toBe(movedOriginal);
    const resumedLedger = JSON.parse(await readFile(ledgerPath, "utf8"));
    expect(resumedLedger).not.toHaveProperty("pendingFinish");
    expect(existsSync(featureWorktree)).toBe(true);
    expect(invoke("next", ...featureFlag).actions).toContain(
      `spindle sdd delivery create --feature ${name} --write-scope=late.txt`,
    );
  },
);
