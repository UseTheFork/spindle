import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { reviewFixture } from "@test/Helpers/SubagentDrivenDevelopment/ReviewFixture";
import { expect, test } from "vitest";

async function integratedFeature() {
  const fixture = await reviewFixture();
  await fixture.complete(fixture.initialTask, "first.ts");
  fixture.submitReview(fixture.startReview(), "pass");
  fixture.invoke("integrate", ...fixture.featureFlag, "--ticket", "T-0001");
  return {
    ...fixture,
    featureWorktree: join(fixture.worktrees, fixture.name, "feature"),
  };
}

test(
  "assigns feature reviews, groups reviewers at one revision, and detects stale assignments",
  { timeout: 40_000 },
  async () => {
    const { featureFlag, featureWorktree, invoke, run, git, name, workspace } =
      await integratedFeature();
    expect(invoke("next", ...featureFlag).actions).toContain(
      `spindle sdd review --feature ${name} --target feature`,
    );
    expect(
      run("review", ...featureFlag, "--target", "feature", "--ticket", "T-0001").stderr,
    ).toContain("cannot be combined with --ticket");

    await mkdir(join(featureWorktree, ".spindle"));
    await writeFile(join(featureWorktree, ".spindle", "review-notes.md"), "review note");
    const first = invoke("review", ...featureFlag, "--target", "feature", "--scope", "Feature");
    const second = invoke("review", ...featureFlag, "--target", "feature");
    expect(first.codeRevision).toBe(second.codeRevision);
    const assignment = invoke("assignment", "--feature", workspace, "--review", first.review);
    expect(assignment).toMatchObject({
      role: "reviewer",
      feature: name,
      worktree: featureWorktree,
      codeRevision: first.codeRevision,
      scope: "Feature",
      specification: "Feature requirements.",
    });
    expect(assignment).not.toHaveProperty("ticket");
    expect(assignment).not.toHaveProperty("reportPath");

    expect(
      invoke(
        "review",
        "submit",
        ...featureFlag,
        "--review",
        first.review,
        "--recommendation",
        "pass",
      ).acceptance,
    ).toBe("InReview");
    expect(invoke("next", ...featureFlag).featureReview.state).toBe("InReview");
    await writeFile(join(featureWorktree, "later.ts"), "later\n");
    git("-C", featureWorktree, "add", "--", "later.ts");
    git("-C", featureWorktree, "commit", "-m", "Follow-up feature change");
    expect(run("assignment", "--feature", workspace, "--review", second.review).stderr).toContain(
      "no longer matches the current feature revision",
    );
    expect(invoke("next", ...featureFlag).actions).toContain(
      `spindle sdd review --feature ${name} --target feature`,
    );
  },
);

test(
  "creates feature finding tickets and verifies findings in a later feature round",
  { timeout: 60_000 },
  async () => {
    const { featureFlag, invoke, workspace, run } = await integratedFeature();
    const review = invoke("review", ...featureFlag, "--target", "feature");
    const result = invoke(
      "review",
      "submit",
      ...featureFlag,
      "--review",
      review.review,
      "--recommendation",
      "changes-required",
      "--finding",
      "Missing behavior",
      "major",
      "feature.ts",
      "Feature requirements.",
      "Behavior is absent",
      "Implement the missing behavior",
    );
    expect(result.acceptance).toBe("Blocked");
    const finding = result.findings[0] as string;
    expect(invoke("next", ...featureFlag).notices.join("\n")).toContain(
      `Feature finding ${finding} needs a decision`,
    );
    const fix = [
      "finding",
      "fix",
      ...featureFlag,
      "--finding",
      finding,
      "--instructions",
      "Implement the missing behavior.",
      "--write-scope",
      "fix.ts",
    ];
    const created = invoke(...fix);
    expect(created).toMatchObject({
      finding,
      ticket: "T-0002",
      task: "T-0002.1",
      ticketCreated: true,
    });
    expect(run(...fix).stderr).toContain("no existing fix work");
    const ledgerPath = join(workspace, "sdd.json");
    const ledger = JSON.parse(await readFile(ledgerPath, "utf8"));
    expect(ledger.findings[0].fixWork).toEqual({ type: "ticket", ticketId: "T-0002" });
    expect(ledger.tickets[1].tasks[0]).toMatchObject({
      id: "T-0002.1",
      discoveredFrom: finding,
      writeScope: ["fix.ts"],
    });

    const { worktree } = invoke("ticket", "start", ...featureFlag, "--ticket", "T-0002");
    invoke("dispatch", ...featureFlag, "--task", "T-0002.1");
    await writeFile(join(worktree, "fix.ts"), "fixed\n");
    invoke("task", "submit", ...featureFlag, "--task", "T-0002.1", "--attempt", "1");
    invoke("ticket", "commit", ...featureFlag, "--ticket", "T-0002", "--message", "Fix finding");
    const ticketReview = invoke("review", ...featureFlag, "--ticket", "T-0002");
    invoke(
      "review",
      "submit",
      ...featureFlag,
      "--review",
      ticketReview.review,
      "--recommendation",
      "pass",
    );
    invoke("integrate", ...featureFlag, "--ticket", "T-0002");
    expect(invoke("next", ...featureFlag).featureReview.state).toBe("InReview");

    const followup = invoke("review", ...featureFlag, "--target", "feature");
    expect(
      invoke("assignment", "--feature", workspace, "--review", followup.review).findingsToVerify,
    ).toMatchObject([{ id: finding, decision: { status: "open" } }]);
    expect(
      invoke(
        "review",
        "submit",
        ...featureFlag,
        "--review",
        followup.review,
        "--recommendation",
        "pass",
      ).acceptance,
    ).toBe("Accepted");
    expect(JSON.parse(await readFile(ledgerPath, "utf8")).findings[0].decision).toEqual({
      status: "resolved",
    });
    expect(invoke("next", ...featureFlag).featureReview.state).toBe("Accepted");
  },
);

test(
  "dismisses a feature finding with a reason and unblocks the completed review",
  { timeout: 30_000 },
  async () => {
    const { featureFlag, invoke } = await integratedFeature();
    const review = invoke("review", ...featureFlag, "--target", "feature");
    const result = invoke(
      "review",
      "submit",
      ...featureFlag,
      "--review",
      review.review,
      "--recommendation",
      "changes-required",
      "--finding",
      "Out of scope",
      "minor",
      "feature.ts",
      "Feature requirements.",
      "The report is unrelated",
      "No fix is needed",
    );
    expect(result.acceptance).toBe("Blocked");
    expect(
      invoke(
        "finding",
        "dismiss",
        ...featureFlag,
        "--finding",
        result.findings[0],
        "--reason",
        "The feature specification does not require this behavior.",
      ),
    ).toMatchObject({
      finding: result.findings[0],
      feature: "0001-example",
      decision: {
        status: "dismissed",
        reason: "The feature specification does not require this behavior.",
      },
    });
    expect(invoke("next", ...featureFlag).featureReview.state).toBe("Accepted");
  },
);
