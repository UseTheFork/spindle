import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import type { SddCommand } from "@/commands/sdd/sdd-command";

import {
  execute,
  prepareImplementationForReview,
  recordReviewCheck,
  prepareReviewAssignment,
  refreshReviewCheck,
} from "./helpers.ts";
test("correct persists a finding-scoped attempt before returning an idempotent fix assignment", async () => {
  const { repo, spec, assignment } = await prepareReviewAssignment();
  writeFileSync(assignment.report, "# Initial review\n\nA blocking issue needs a fix.\n");
  const finding = await execute(repo, (service) =>
    service.findingCreate({
      spec,
      issue: "I-0001",
      source: assignment.report,
      snapshot: assignment.snapshot,
      severity: "high",
      blocking: true,
      summary: "Incorrect empty-input behavior",
      details: "The implementation rejects an input that the requirements allow.",
      author: "controller",
    }),
  );
  expect(finding.status, finding.stderr).toBe(0);
  const confirmedFinding = await execute(repo, (service) =>
    service.findingUpdate({
      spec,
      issue: "I-0001",
      finding: "F-0001",
      status: "confirmed",
      author: "controller",
    }),
  );
  expect(confirmedFinding.status, confirmedFinding.stderr).toBe(0);
  const failedReview = await execute(repo, (service) =>
    service.submit({
      spec,
      issue: "I-0001",
      role: "review",
      assignment: assignment.id,
      report: assignment.report,
      result: "failed",
      findingIds: ["F-0001"],
      details: "The implementation must be corrected.",
      author: "controller",
    }),
  );
  expect(failedReview.status, failedReview.stderr).toBe(0);

  const args = (service: SddCommand) =>
    service.correct({
      spec,
      issue: "I-0001",
      findings: ["F-0001"],
      details: "Preserve the accepted empty-input behavior.",
      author: "controller",
    });
  const dispatched = await execute(repo, args);
  expect(dispatched.status, dispatched.stderr).toBe(0);
  const first = JSON.parse(dispatched.stdout) as {
    execution: string;
    attempt: { number: number; findingIds: string[]; objective: string };
    assignment: { id: string; role: string; action: string; report: string; status: string };
  };
  expect(first.execution).toBe("implementing");
  expect(first.attempt.number).toBe(1);
  expect(first.attempt.findingIds).toEqual(["F-0001"]);
  expect(first.attempt.objective).toBe("Preserve the accepted empty-input behavior.");
  expect(first.assignment.role).toBe("implementation");
  expect(first.assignment.action).toBe("correct");
  expect(first.assignment.status).toBe("pending");
  expect(first.assignment.report).toMatch(/round-1-fix\.md$/);

  const resumed = await execute(repo, args);
  expect(resumed.status, resumed.stderr).toBe(0);
  const repeated = JSON.parse(resumed.stdout) as typeof first & { idempotent?: boolean };
  expect(repeated.idempotent).toBe(true);
  expect(repeated.attempt.number).toBe(1);
  expect(repeated.assignment.id).toBe(first.assignment.id);
  expect(repeated.assignment.report).toBe(first.assignment.report);
});

test("corrective implementation reports submit through the implementation evidence contract", async () => {
  const { repo, spec, assignment } = await prepareReviewAssignment();
  writeFileSync(assignment.report, "# Initial review\n\nA blocking issue needs a fix.\n");
  const finding = await execute(repo, (service) =>
    service.findingCreate({
      spec,
      issue: "I-0001",
      source: assignment.report,
      snapshot: assignment.snapshot,
      severity: "high",
      blocking: true,
      summary: "Incorrect empty-input behavior",
      details: "The implementation rejects an input that the requirements allow.",
      author: "controller",
    }),
  );
  expect(finding.status, finding.stderr).toBe(0);
  const confirmedFinding = await execute(repo, (service) =>
    service.findingUpdate({
      spec,
      issue: "I-0001",
      finding: "F-0001",
      status: "confirmed",
      author: "controller",
    }),
  );
  expect(confirmedFinding.status, confirmedFinding.stderr).toBe(0);
  const failedReview = await execute(repo, (service) =>
    service.submit({
      spec,
      issue: "I-0001",
      role: "review",
      assignment: assignment.id,
      report: assignment.report,
      result: "failed",
      findingIds: ["F-0001"],
      details: "The implementation must be corrected.",
      author: "controller",
    }),
  );
  expect(failedReview.status, failedReview.stderr).toBe(0);

  const dispatched = await execute(repo, (service) =>
    service.correct({
      spec,
      issue: "I-0001",
      findings: ["F-0001"],
      details: "Preserve the accepted empty-input behavior.",
      author: "controller",
    }),
  );
  expect(dispatched.status, dispatched.stderr).toBe(0);
  const fix = JSON.parse(dispatched.stdout).assignment as {
    action: string;
    report: string;
  };
  writeFileSync(join(repo, "feature.ts"), "export const feature = 'corrected';\n");
  writeFileSync(fix.report, "# Correction report\n\nCorrected the finding.\n");

  const submitted = await execute(repo, (service) =>
    service.submit({
      spec,
      issue: "I-0001",
      role: "implementation",
      report: fix.report,
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);
  const result = JSON.parse(submitted.stdout) as {
    execution: string;
    assignment: { action: string; status: string };
  };
  expect(result.execution).toBe("reviewing");
  expect(result.assignment.action).toBe("correct");
  expect(result.assignment.status).toBe("submitted");
});

test("a current non-mechanical failed check can select a correction before initial review", async () => {
  const { repo, spec, command, submission } = await prepareImplementationForReview();
  const failed = await recordReviewCheck(repo, spec, command, submission.snapshot, "failed");
  expect(failed.status, failed.stderr).toBe(0);

  const corrected = await execute(repo, (service) =>
    service.correct({
      spec,
      issue: "I-0001",
      checkFailure: command,
      details: "Address the behavior exposed by the failing check.",
      author: "controller",
    }),
  );
  expect(corrected.status, corrected.stderr).toBe(0);
  const output = JSON.parse(corrected.stdout) as {
    attempt: { number: number; checkFailure: string; findingIds: string[] };
    assignment: { action: string; report: string };
  };
  expect(output.attempt.number).toBe(1);
  expect(output.attempt.checkFailure).toBe(command);
  expect(output.attempt.findingIds).toEqual([]);
  expect(output.assignment.action).toBe("correct");
  expect(output.assignment.report).toMatch(/round-1-fix\.md$/);
});

test("explicit progress assessments permit productive continuation beyond five attempts", async () => {
  const { repo, spec, command, submission } = await prepareImplementationForReview();
  const failed = await recordReviewCheck(repo, spec, command, submission.snapshot, "failed");
  expect(failed.status, failed.stderr).toBe(0);
  let correction = await execute(repo, (service) =>
    service.correct({
      spec,
      issue: "I-0001",
      checkFailure: command,
      details: "Fix the first observed check failure.",
      author: "controller",
    }),
  );
  expect(correction.status, correction.stderr).toBe(0);
  let attemptNumber = 1;

  for (let nextAttempt = 1; nextAttempt <= 6; nextAttempt += 1) {
    const assigned = JSON.parse(correction.stdout).assignment as {
      report: string;
      attempt: number;
    };
    expect(assigned.attempt).toBe(nextAttempt);
    writeFileSync(join(repo, "feature.ts"), `export const feature = ${nextAttempt};\n`);
    writeFileSync(assigned.report, `# Correction ${nextAttempt}\n\nProgress recorded.\n`);
    const submitted = await execute(repo, (service) =>
      service.submit({
        spec,
        issue: "I-0001",
        role: "implementation",
        report: assigned.report,
        author: "controller",
      }),
    );
    expect(submitted.status, submitted.stderr).toBe(0);
    if (nextAttempt < 6) {
      const currentSnapshot = JSON.parse(submitted.stdout).snapshot as string;
      const nextFailedCheck = await recordReviewCheck(
        repo,
        spec,
        command,
        currentSnapshot,
        "failed",
      );
      expect(nextFailedCheck.status, nextFailedCheck.stderr).toBe(0);
      const unassessed = await execute(repo, (service) =>
        service.correct({
          spec,
          issue: "I-0001",
          checkFailure: command,
          details: `Address the newly observed behavior after correction ${nextAttempt}.`,
          decision: "continue",
          assessment: `Correction ${nextAttempt} changed the reviewed behavior; continue with the newly assessed failure.`,
          author: "controller",
        }),
      );
      expect(unassessed.status).not.toBe(0);
      expect(unassessed.stderr).toMatch(/assessment-result/i);
      correction = await execute(repo, (service) =>
        service.correct({
          spec,
          issue: "I-0001",
          checkFailure: command,
          details: `Address the newly observed behavior after correction ${nextAttempt}.`,
          decision: "continue",
          assessment: `Correction ${nextAttempt} changed the reviewed behavior; continue with the newly assessed failure.`,
          assessmentResult: "productive",
          author: "controller",
        }),
      );
      expect(correction.status, correction.stderr).toBe(0);
      attemptNumber = JSON.parse(correction.stdout).attempt.number as number;
    }
  }

  expect(attemptNumber).toBe(6);
  const resumed = await execute(repo, (service) =>
    service.resume({ spec, issue: "I-0001", author: "controller" }),
  );
  expect(resumed.status, resumed.stderr).toBe(0);
  const attempts = JSON.parse(resumed.stdout).correctionAttempts as {
    number: number;
    assignment: { status: string };
    progressAssessment?: { decision: string; details: string };
    checks?: unknown[];
  }[];
  expect(attempts.length).toBe(6);
  expect(attempts.map((attempt) => attempt.number)).toEqual([1, 2, 3, 4, 5, 6]);
  expect(attempts.every((attempt) => attempt.assignment.status === "submitted")).toBeTruthy();
  expect(
    attempts.slice(0, 5).every((attempt) => attempt.progressAssessment?.decision === "continue"),
  ).toBeTruthy();
  expect(attempts.every((attempt) => (attempt.checks?.length ?? 0) > 0)).toBeTruthy();
});

test("a progress pause records adjudication and resume preserves it without dispatching a fix", async () => {
  const { repo, spec, command, submission } = await prepareImplementationForReview();
  const failed = await recordReviewCheck(repo, spec, command, submission.snapshot, "failed");
  expect(failed.status, failed.stderr).toBe(0);

  const paused = await execute(repo, (service) =>
    service.correct({
      spec,
      issue: "I-0001",
      decision: "pause",
      reason: "no-progress",
      details:
        "The repeated check failure has no demonstrated progress; request controller adjudication.",
      author: "controller",
    }),
  );
  expect(paused.status, paused.stderr).toBe(0);
  const pause = JSON.parse(paused.stdout) as {
    paused: boolean;
    adjudication: { status: string; reason: string; details: string };
    assignment?: unknown;
  };
  expect(pause.paused).toBe(true);
  expect(pause.adjudication.status).toBe("pending");
  expect(pause.adjudication.reason).toBe("no-progress");
  expect(pause.assignment).toBe(undefined);

  const resumed = await execute(repo, (service) =>
    service.resume({ spec, issue: "I-0001", author: "controller" }),
  );
  expect(resumed.status, resumed.stderr).toBe(0);
  const resume = JSON.parse(resumed.stdout) as {
    adjudication?: { status: string; reason: string };
    correctionAttempts?: unknown[];
  };
  expect(resume.adjudication?.status).toBe("pending");
  expect(resume.adjudication?.reason).toBe("no-progress");
  expect(resume.correctionAttempts).toEqual([]);
});

test("corrective review findings retain assignment provenance for the next progress decision", async () => {
  const { repo, spec, command, assignment } = await prepareReviewAssignment();
  writeFileSync(assignment.report, "# Initial review\n\nA blocking issue needs a fix.\n");
  const finding = await execute(repo, (service) =>
    service.findingCreate({
      spec,
      issue: "I-0001",
      source: assignment.report,
      snapshot: assignment.snapshot,
      severity: "high",
      blocking: true,
      summary: "Incorrect empty-input behavior",
      details: "The implementation rejects an input that the requirements allow.",
      author: "controller",
    }),
  );
  expect(finding.status, finding.stderr).toBe(0);
  const confirmedFinding = await execute(repo, (service) =>
    service.findingUpdate({
      spec,
      issue: "I-0001",
      finding: "F-0001",
      status: "confirmed",
      author: "controller",
    }),
  );
  expect(confirmedFinding.status, confirmedFinding.stderr).toBe(0);
  const failedReview = await execute(repo, (service) =>
    service.submit({
      spec,
      issue: "I-0001",
      role: "review",
      assignment: assignment.id,
      report: assignment.report,
      result: "failed",
      findingIds: ["F-0001"],
      details: "The implementation must be corrected.",
      author: "controller",
    }),
  );
  expect(failedReview.status, failedReview.stderr).toBe(0);

  const corrected = await execute(repo, (service) =>
    service.correct({
      spec,
      issue: "I-0001",
      findings: ["F-0001"],
      details: "Preserve the accepted empty-input behavior.",
      author: "controller",
    }),
  );
  expect(corrected.status, corrected.stderr).toBe(0);
  const fix = JSON.parse(corrected.stdout).assignment as { report: string };
  writeFileSync(join(repo, "feature.ts"), "export const feature = 'fixed';\n");
  writeFileSync(fix.report, "# Correction report\n\nCorrected F-0001.\n");
  const submitted = await execute(repo, (service) =>
    service.submit({
      spec,
      issue: "I-0001",
      role: "implementation",
      report: fix.report,
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);
  const fixedSnapshot = JSON.parse(submitted.stdout).snapshot as string;
  const passingCheck = await recordReviewCheck(repo, spec, command, fixedSnapshot, "passed");
  expect(passingCheck.status, passingCheck.stderr).toBe(0);

  const dispatched = await execute(repo, (service) =>
    service.review({
      spec,
      issue: "I-0001",
      inventory: JSON.stringify(["feature.ts"]),
      author: "controller",
    }),
  );
  expect(dispatched.status, dispatched.stderr).toBe(0);
  const correctiveReview = JSON.parse(dispatched.stdout).assignments[0] as {
    id: string;
    scope: string;
    attempt?: number;
    snapshot: string;
  };
  expect(correctiveReview.scope).toBe("corrective");
  expect(correctiveReview.attempt).toBe(1);
  expect(correctiveReview.snapshot).toBe(fixedSnapshot);

  writeFileSync(
    JSON.parse(dispatched.stdout).assignments[0].report,
    "# Corrective review\n\nA separate actionable defect remains.\n",
  );
  const correctiveFinding = await execute(repo, (service) =>
    service.findingCreate({
      spec,
      issue: "I-0001",
      source: JSON.parse(dispatched.stdout).assignments[0].report,
      snapshot: fixedSnapshot,
      severity: "medium",
      blocking: true,
      summary: "A new regression remains",
      details: "The correction introduced a second issue that needs a separate fix.",
      author: "controller",
    }),
  );
  expect(correctiveFinding.status, correctiveFinding.stderr).toBe(0);
  expect(JSON.parse(correctiveFinding.stdout).finding.id).toBe("F-0002");
  const failedCorrectiveReview = await execute(repo, (service) =>
    service.submit({
      spec,
      issue: "I-0001",
      role: "review",
      assignment: correctiveReview.id,
      report: JSON.parse(dispatched.stdout).assignments[0].report,
      result: "failed",
      findingIds: ["F-0002"],
      details: "The new blocker requires another assessed correction.",
      author: "controller",
    }),
  );
  expect(failedCorrectiveReview.status, failedCorrectiveReview.stderr).toBe(0);
  expect(JSON.parse(failedCorrectiveReview.stdout).execution).toBe("changes-requested");
});

test("resume returns pending corrective reviews after initial review coverage is submitted", async () => {
  const { repo, spec, command, assignment } = await prepareReviewAssignment();
  writeFileSync(assignment.report, "# Initial review\n\nA blocking issue needs a fix.\n");
  const finding = await execute(repo, (service) =>
    service.findingCreate({
      spec,
      issue: "I-0001",
      source: assignment.report,
      snapshot: assignment.snapshot,
      severity: "high",
      blocking: true,
      summary: "Incorrect empty-input behavior",
      details: "The implementation rejects an input that the requirements allow.",
      author: "controller",
    }),
  );
  expect(finding.status, finding.stderr).toBe(0);
  const confirmedFinding = await execute(repo, (service) =>
    service.findingUpdate({
      spec,
      issue: "I-0001",
      finding: "F-0001",
      status: "confirmed",
      author: "controller",
    }),
  );
  expect(confirmedFinding.status, confirmedFinding.stderr).toBe(0);
  const submittedInitialReview = await execute(repo, (service) =>
    service.submit({
      spec,
      issue: "I-0001",
      role: "review",
      assignment: assignment.id,
      report: assignment.report,
      result: "failed",
      findingIds: ["F-0001"],
      details: "The implementation must be corrected.",
      author: "controller",
    }),
  );
  expect(submittedInitialReview.status, submittedInitialReview.stderr).toBe(0);

  const correction = await execute(repo, (service) =>
    service.correct({
      spec,
      issue: "I-0001",
      findings: ["F-0001"],
      details: "Correct the empty-input behavior.",
      author: "controller",
    }),
  );
  expect(correction.status, correction.stderr).toBe(0);
  const implementation = JSON.parse(correction.stdout).assignment as { report: string };
  writeFileSync(join(repo, "feature.ts"), "export const feature = 'fixed';\n");
  writeFileSync(implementation.report, "# Correction report\n\nCorrected F-0001.\n");
  const submittedCorrection = await execute(repo, (service) =>
    service.submit({
      spec,
      issue: "I-0001",
      role: "implementation",
      report: implementation.report,
      author: "controller",
    }),
  );
  expect(submittedCorrection.status, submittedCorrection.stderr).toBe(0);
  const correctedSnapshot = JSON.parse(submittedCorrection.stdout).snapshot as string;
  expect(correctedSnapshot).not.toBe(assignment.snapshot);
  const passingCheck = await recordReviewCheck(repo, spec, command, correctedSnapshot, "passed");
  expect(passingCheck.status, passingCheck.stderr).toBe(0);

  const dispatchedReview = await execute(repo, (service) =>
    service.review({
      spec,
      issue: "I-0001",
      inventory: JSON.stringify(["feature.ts"]),
      author: "controller",
    }),
  );
  expect(dispatchedReview.status, dispatchedReview.stderr).toBe(0);
  const correctiveAssignments = JSON.parse(dispatchedReview.stdout).assignments as {
    id: string;
    scope: string;
    status: string;
  }[];
  expect(correctiveAssignments.length).toBe(1);
  expect(correctiveAssignments[0]?.scope).toBe("corrective");
  expect(correctiveAssignments[0]?.status).toBe("pending");

  const resumed = await execute(repo, (service) =>
    service.resume({ spec, issue: "I-0001", author: "controller" }),
  );
  expect(resumed.status, resumed.stderr).toBe(0);
  const result = JSON.parse(resumed.stdout) as {
    nextAction: string;
    reviewAssignments: { id: string; scope: string; status: string }[];
    blocker?: string;
  };
  expect(result.nextAction).toBe("await-review-report");
  expect(result.blocker).toBe(undefined);
  expect(result.reviewAssignments.map(({ id, scope, status }) => ({ id, scope, status }))).toEqual(
    correctiveAssignments.map(({ id, scope, status }) => ({ id, scope, status })),
  );
});

test("a verified corrective review can complete acceptance while retaining initial coverage", async () => {
  const { repo, spec, command, assignment } = await prepareReviewAssignment();
  writeFileSync(assignment.report, "# Initial review\n\nA blocking issue needs a fix.\n");
  const finding = await execute(repo, (service) =>
    service.findingCreate({
      spec,
      issue: "I-0001",
      source: assignment.report,
      snapshot: assignment.snapshot,
      severity: "high",
      blocking: true,
      summary: "Incorrect empty-input behavior",
      details: "The implementation rejects an input that the requirements allow.",
      author: "controller",
    }),
  );
  expect(finding.status, finding.stderr).toBe(0);
  const confirmedFinding = await execute(repo, (service) =>
    service.findingUpdate({
      spec,
      issue: "I-0001",
      finding: "F-0001",
      status: "confirmed",
      author: "controller",
    }),
  );
  expect(confirmedFinding.status, confirmedFinding.stderr).toBe(0);
  const failedReview = await execute(repo, (service) =>
    service.submit({
      spec,
      issue: "I-0001",
      role: "review",
      assignment: assignment.id,
      report: assignment.report,
      result: "failed",
      findingIds: ["F-0001"],
      details: "The implementation must be corrected.",
      author: "controller",
    }),
  );
  expect(failedReview.status, failedReview.stderr).toBe(0);

  const correction = await execute(repo, (service) =>
    service.correct({
      spec,
      issue: "I-0001",
      findings: ["F-0001"],
      details: "Preserve the accepted empty-input behavior.",
      author: "controller",
    }),
  );
  expect(correction.status, correction.stderr).toBe(0);
  const fix = JSON.parse(correction.stdout).assignment as { report: string };
  writeFileSync(join(repo, "feature.ts"), "export const feature = 'fixed';\n");
  writeFileSync(fix.report, "# Correction report\n\nCorrected F-0001.\n");
  const implementation = await execute(repo, (service) =>
    service.submit({
      spec,
      issue: "I-0001",
      role: "implementation",
      report: fix.report,
      author: "controller",
    }),
  );
  expect(implementation.status, implementation.stderr).toBe(0);
  const fixedSnapshot = JSON.parse(implementation.stdout).snapshot as string;
  const passingCheck = await recordReviewCheck(repo, spec, command, fixedSnapshot, "passed");
  expect(passingCheck.status, passingCheck.stderr).toBe(0);
  const verified = await execute(repo, (service) =>
    service.findingUpdate({
      spec,
      issue: "I-0001",
      finding: "F-0001",
      status: "fixed",
      evidence: fixedSnapshot,
      author: "controller",
    }),
  );
  expect(verified.status, verified.stderr).toBe(0);

  const dispatched = await execute(repo, (service) =>
    service.review({
      spec,
      issue: "I-0001",
      inventory: JSON.stringify(["feature.ts"]),
      author: "controller",
    }),
  );
  expect(dispatched.status, dispatched.stderr).toBe(0);
  const review = JSON.parse(dispatched.stdout).assignments[0] as {
    id: string;
    scope: string;
    report: string;
  };
  expect(review.scope).toBe("corrective");
  writeFileSync(review.report, "# Corrective review\n\nF-0001 is fixed; no regressions found.\n");
  const reviewed = await execute(repo, (service) =>
    service.submit({
      spec,
      issue: "I-0001",
      role: "review",
      assignment: review.id,
      report: review.report,
      result: "passed",
      noFindings: true,
      author: "controller",
    }),
  );
  expect(reviewed.status, reviewed.stderr).toBe(0);

  const accepted = await execute(repo, (service) =>
    service.accept({ spec, issue: "I-0001", author: "controller" }),
  );
  expect(accepted.status, accepted.stderr).toBe(0);
  expect(JSON.parse(accepted.stdout).execution).toBe("accepted");
});

test("requirements decisions require fresh review before deferring a blocking finding", async () => {
  const { repo, spec, command, assignment } = await prepareReviewAssignment();
  writeFileSync(assignment.report, "# Initial review\n\nA criterion is implicated.\n");
  const created = await execute(repo, (service) =>
    service.findingCreate({
      spec,
      issue: "I-0001",
      source: assignment.report,
      snapshot: assignment.snapshot,
      severity: "high",
      blocking: true,
      summary: "Scope no longer includes this behavior",
      details: "The current acceptance criteria require this behavior.",
      author: "controller",
    }),
  );
  expect(created.status, created.stderr).toBe(0);
  const initialReview = await execute(repo, (service) =>
    service.submit({
      spec,
      issue: "I-0001",
      role: "review",
      assignment: assignment.id,
      report: assignment.report,
      result: "passed",
      findingIds: ["F-0001"],
      author: "controller",
    }),
  );
  expect(initialReview.status, initialReview.stderr).toBe(0);

  const issuePath = join(repo, ".scratch", "0001-claim-flow", "issues", "I-0001.md");
  const initialIssue = readFileSync(issuePath, "utf8");
  writeFileSync(
    issuePath,
    initialIssue.replace(
      "## Acceptance Criteria\n\n## Comments",
      "## Acceptance Criteria\n\nThe changed scope excludes this behavior.\n\n## Comments",
    ),
  );
  const deferred = async (extra: Partial<Parameters<SddCommand["findingUpdate"]>[0]>) =>
    await execute(repo, (service) =>
      service.findingUpdate({
        spec,
        issue: "I-0001",
        finding: "F-0001",
        status: "deferred",
        details: "The approved scope no longer includes this behavior.",
        followUp: "Future follow-up",
        ...extra,
        author: "controller",
      }),
    );

  const noDecision = await deferred({});
  expect(noDecision.status).not.toBe(0);
  expect(noDecision.stderr).toMatch(/approved requirements decision|cannot be deferred/i);

  const decided = await execute(repo, (service) =>
    service.requirementsDecide({
      spec,
      issue: "I-0001",
      finding: "F-0001",
      decision: "approved",
      details:
        "This requirements decision explicitly revises the acceptance criteria to exclude this behavior.",
      author: "controller",
    }),
  );
  expect(decided.status, decided.stderr).toBe(0);
  const decision = JSON.parse(decided.stdout).decision as {
    id: string;
    status: string;
    requirementsSnapshot: string;
  };
  expect(decision.id).toBe("R-0001");
  expect(decision.status).toBe("approved");

  const ledgerPath = join(repo, ".scratch", "0001-claim-flow", "sdd.json");
  const persistedDecision = JSON.parse(readFileSync(ledgerPath, "utf8")).issues[0];
  expect(persistedDecision.reviewAssignments).toBe(undefined);
  expect(persistedDecision.reviewHistory.length).toBe(1);
  expect(persistedDecision.requirementsDecisions[0].author).toBe("controller");
  const decidedStatus = await execute(repo, (service) => service.status({ spec }));
  const decidedNext = await execute(repo, (service) => service.next({ spec }));
  expect(decidedStatus.status, decidedStatus.stderr).toBe(0);
  expect(decidedNext.status, decidedNext.stderr).toBe(0);
  expect(JSON.parse(decidedStatus.stdout).requirementsDecisions[0].decision.id).toBe("R-0001");
  expect(JSON.parse(decidedNext.stdout).requirementsDecisions[0].decision.status).toBe("approved");
  expect(JSON.stringify(JSON.parse(decidedStatus.stdout).blockers)).toMatch(
    /Required check .*stale/,
  );

  const currentStatus = await execute(repo, (service) => service.status({ spec }));
  expect(currentStatus.status, currentStatus.stderr).toBe(0);
  const currentSnapshot = JSON.parse(currentStatus.stdout).snapshots[0].snapshot as string;
  const passing = await recordReviewCheck(repo, spec, command, currentSnapshot, "passed");
  expect(passing.status, passing.stderr).toBe(0);

  const reviewed = await execute(repo, (service) =>
    service.review({
      spec,
      issue: "I-0001",
      inventory: JSON.stringify(["feature.ts"]),
      author: "controller",
    }),
  );
  expect(reviewed.status, reviewed.stderr).toBe(0);
  const freshAssignment = JSON.parse(reviewed.stdout).assignments[0] as {
    id: string;
    report: string;
    snapshot: string;
    requirementsSnapshot: string;
  };
  expect(freshAssignment.id).not.toBe(assignment.id);
  expect(freshAssignment.requirementsSnapshot).toBe(decision.requirementsSnapshot);
  writeFileSync(freshAssignment.report, "# Fresh review\n\nThe revised criterion is reviewed.\n");
  const linked = await execute(repo, (service) =>
    service.findingCreate({
      spec,
      issue: "I-0001",
      source: freshAssignment.report,
      snapshot: freshAssignment.snapshot,
      severity: "high",
      blocking: true,
      summary: "Scope no longer includes this behavior",
      details: "The current acceptance criteria require this behavior.",
      link: "F-0001",
      author: "controller",
    }),
  );
  expect(linked.status, linked.stderr).toBe(0);
  const submitted = await execute(repo, (service) =>
    service.submit({
      spec,
      issue: "I-0001",
      role: "review",
      assignment: freshAssignment.id,
      report: freshAssignment.report,
      result: "passed",
      findingIds: ["F-0001"],
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);

  const finalDisposition = await deferred({ requirementsDecision: decision.id });
  expect(finalDisposition.status, finalDisposition.stderr).toBe(0);
  const finding = JSON.parse(finalDisposition.stdout).finding;
  expect(finding.status).toBe("deferred");
  expect(finding.requirementsDecision).toBe(decision.id);
  const accepted = await execute(repo, (service) =>
    service.accept({ spec, issue: "I-0001", author: "controller" }),
  );
  expect(accepted.status, accepted.stderr).toBe(0);
  expect(JSON.parse(accepted.stdout).execution).toBe("accepted");
});

test("review submission requires exact provenance, result, and explicit no-findings and is idempotent", async () => {
  const { repo, spec, assignment } = await prepareReviewAssignment();
  writeFileSync(assignment.report, "# Review report\n\nNo defects found.\n");
  const submit = async (extra: Partial<Parameters<SddCommand["submit"]>[0]>) =>
    await execute(repo, (service) =>
      service.submit({ spec, issue: "I-0001", role: "review", ...extra, author: "controller" }),
    );

  const omittedNoFindings = await submit({
    assignment: assignment.id,
    report: assignment.report,
    result: "passed",
  });
  expect(omittedNoFindings.status).not.toBe(0);
  expect(omittedNoFindings.stderr).toMatch(/--no-findings/);

  const wrongAssignment = await submit({
    assignment: `${assignment.id}-other`,
    report: assignment.report,
    result: "passed",
    noFindings: true,
  });
  expect(wrongAssignment.status).not.toBe(0);
  expect(wrongAssignment.stderr).toMatch(/assignment/i);

  const wrongReport = await submit({
    assignment: assignment.id,
    report: join(repo, ".scratch", "other-report.md"),
    result: "passed",
    noFindings: true,
  });
  expect(wrongReport.status).not.toBe(0);
  expect(wrongReport.stderr).toMatch(/assigned destination/);

  const registered = await submit({
    assignment: assignment.id,
    report: assignment.report,
    result: "passed",
    noFindings: true,
  });
  expect(registered.status, registered.stderr).toBe(0);
  const result = JSON.parse(registered.stdout) as {
    execution: string;
    assignment: {
      id: string;
      status: string;
      result: string;
      noFindings: boolean;
      snapshot: string;
      reportSha256: string;
    };
  };
  expect(result.execution).toBe("reviewing");
  expect(result.assignment.id).toBe(assignment.id);
  expect(result.assignment.status).toBe("submitted");
  expect(result.assignment.result).toBe("passed");
  expect(result.assignment.noFindings).toBe(true);
  expect(result.assignment.snapshot).toBe(assignment.snapshot);
  expect(result.assignment.reportSha256).toMatch(/^[0-9a-f]{64}$/);

  const repeated = await submit({
    assignment: assignment.id,
    report: assignment.report,
    result: "passed",
    noFindings: true,
  });
  expect(repeated.status, repeated.stderr).toBe(0);
  expect(JSON.parse(repeated.stdout).idempotent).toBe(true);
  const issueText = readFileSync(
    join(repo, ".scratch", "0001-claim-flow", "issues", "I-0001.md"),
    "utf8",
  );
  expect(issueText.match(/Review report submitted for assignment/g)?.length).toBe(1);

  writeFileSync(assignment.report, "# Changed review report\n");
  const altered = await submit({
    assignment: assignment.id,
    report: assignment.report,
    result: "passed",
    noFindings: true,
  });
  expect(altered.status).not.toBe(0);
  expect(altered.stderr).toMatch(/changed after submission/);
});

test("failed review without a no-findings attestation requires details and blocks acceptance", async () => {
  const { repo, spec, assignment } = await prepareReviewAssignment();
  writeFileSync(assignment.report, "# Review report\n\nA blocking defect was found.\n");
  const submit = async (details?: string, declareFindings = true) =>
    await execute(repo, (service) =>
      service.submit({
        spec,
        issue: "I-0001",
        role: "review",
        assignment: assignment.id,
        report: assignment.report,
        result: "failed",
        ...(declareFindings ? { noFindings: true } : {}),
        ...(details ? { details } : {}),
        author: "controller",
      }),
    );

  const missingDetails = await submit();
  expect(missingDetails.status).not.toBe(0);
  expect(missingDetails.stderr).toMatch(/--details/);
  const missingDeclaration = await submit("A blocking defect was found.", false);
  expect(missingDeclaration.status).not.toBe(0);
  expect(missingDeclaration.stderr).toMatch(/--findings or exclusive --no-findings/);
  const recordedFailure = await submit("A blocking defect was found in the implementation.");
  expect(recordedFailure.status, recordedFailure.stderr).toBe(0);
  const submitted = JSON.parse(recordedFailure.stdout).assignment;
  expect(submitted.result).toBe("failed");
  expect(submitted.noFindings).toBe(true);
  expect(submitted.details).toBe("A blocking defect was found in the implementation.");
  expect(
    JSON.parse(readFileSync(join(repo, ".scratch", "0001-claim-flow", "sdd.json"), "utf8"))
      .issues[0].reviewAssignments[0].details,
  ).toBe("A blocking defect was found in the implementation.");

  const accepted = await execute(repo, (service) =>
    service.accept({ spec, issue: "I-0001", author: "controller" }),
  );
  expect(accepted.status).not.toBe(0);
  expect(accepted.stderr).toMatch(/failed/);
});

test("unavailable review without a no-findings attestation requires details and blocks acceptance", async () => {
  const { repo, spec, assignment } = await prepareReviewAssignment();
  writeFileSync(assignment.report, "# Review report\n\nReview could not be completed.\n");
  const submit = async (details?: string) =>
    await execute(repo, (service) =>
      service.submit({
        spec,
        issue: "I-0001",
        role: "review",
        assignment: assignment.id,
        report: assignment.report,
        result: "unavailable",
        noFindings: true,
        ...(details ? { details } : {}),
        author: "controller",
      }),
    );

  const missingDetails = await submit();
  expect(missingDetails.status).not.toBe(0);
  expect(missingDetails.stderr).toMatch(/--details/);
  const recordedUnavailable = await submit("The reviewer could not assess whether findings exist.");
  expect(recordedUnavailable.status, recordedUnavailable.stderr).toBe(0);
  const submitted = JSON.parse(recordedUnavailable.stdout).assignment;
  expect(submitted.result).toBe("unavailable");
  expect(submitted.noFindings).toBe(true);
  expect(submitted.details).toBe("The reviewer could not assess whether findings exist.");
  expect(
    JSON.parse(readFileSync(join(repo, ".scratch", "0001-claim-flow", "sdd.json"), "utf8"))
      .issues[0].reviewAssignments[0].details,
  ).toBe("The reviewer could not assess whether findings exist.");

  const accepted = await execute(repo, (service) =>
    service.accept({ spec, issue: "I-0001", author: "controller" }),
  );
  expect(accepted.status).not.toBe(0);
  expect(accepted.stderr).toMatch(/unavailable/);
});

test("accept requires current checks and a complete passing finding-free initial review", async () => {
  const { repo, spec, assignment } = await prepareReviewAssignment();
  writeFileSync(assignment.report, "# Review report\n\nNo defects found.\n");
  const submitted = await execute(repo, (service) =>
    service.submit({
      spec,
      issue: "I-0001",
      role: "review",
      assignment: assignment.id,
      report: assignment.report,
      result: "passed",
      noFindings: true,
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);

  const accepted = await execute(repo, (service) =>
    service.accept({ spec, issue: "I-0001", author: "controller" }),
  );
  expect(accepted.status, accepted.stderr).toBe(0);
  const result = JSON.parse(accepted.stdout) as {
    issue: string;
    execution: string;
    reviews: { agent: string; assignment: string; result: string; noFindings: boolean }[];
    snapshot: string;
  };
  expect(result.issue).toBe("I-0001");
  expect(result.execution).toBe("accepted");
  expect(result.reviews).toEqual([
    {
      agent: "sdd-reviewer",
      assignment: assignment.id,
      result: "passed",
      noFindings: true,
    },
  ]);
  expect(result.snapshot).toBe(assignment.snapshot);
  expect(
    JSON.parse(readFileSync(join(repo, ".scratch", "0001-claim-flow", "sdd.json"), "utf8"))
      .issues[0].execution,
  ).toBe("accepted");
  const repeated = await execute(repo, (service) =>
    service.accept({ spec, issue: "I-0001", author: "controller" }),
  );
  expect(repeated.status, repeated.stderr).toBe(0);
  expect(JSON.parse(repeated.stdout).idempotent).toBe(true);

  writeFileSync(join(repo, "feature.ts"), "export const feature = false;\n");
  const refreshedCheck = await refreshReviewCheck(
    repo,
    spec,
    "just test::test tests/feature.test.ts",
  );
  expect(refreshedCheck.status, refreshedCheck.stderr).toBe(0);
  const staleStatus = await execute(repo, (service) => service.status({ spec }));
  expect(staleStatus.status, staleStatus.stderr).toBe(0);
  const statusOutput = JSON.parse(staleStatus.stdout);
  expect(statusOutput.state.issues[0].execution).toBe("accepted");
  expect(
    statusOutput.actions.some((action: { action: string }) => action.action === "integrate"),
  ).toBe(false);
  expect(
    statusOutput.blockers.map((blocker: { reason: string }) => blocker.reason).join("\n"),
  ).toMatch(/Review assignment .* stale/);
});
