import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import {
  commitRequirementAndRebaseTicket,
  commitTicketWorkspace,
  execute,
  prepareImplementationForReview,
  recordReviewCheck,
  prepareReviewAssignment,
} from "@test/Helpers/SubagentDrivenDevelopment/helpers";
import { nextSummary } from "@test/Helpers/SubagentDrivenDevelopment/StatusSummary";
import type { WorkflowServices } from "@test/Helpers/SubagentDrivenDevelopment/WorkflowServices";
test("correct persists a finding-scoped attempt before returning an idempotent fix assignment", async () => {
  const { repo, spec, assignment, ticketWorkspace } = await prepareReviewAssignment();
  writeFileSync(assignment.report, "# Initial review\n\nA blocking ticket needs a fix.\n");
  const finding = await execute(repo, (service) =>
    service.findingService.findingCreate({
      spec,
      ticket: "T-0001",
      assignment: assignment.id,
      blocking: true,
      summary: "Incorrect empty-input behavior",
      details: "The implementation rejects an input that the requirements allow.",
      author: "controller",
    }),
  );
  expect(finding.status, finding.stderr).toBe(0);
  const confirmedFinding = await execute(repo, (service) =>
    service.findingService.findingUpdate({
      spec,
      ticket: "T-0001",
      finding: "F-0001",
      status: "confirmed",
      author: "controller",
    }),
  );
  expect(confirmedFinding.status, confirmedFinding.stderr).toBe(0);
  const failedReview = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: assignment.id,
      result: "failed",
      details: "The implementation must be corrected.",
      author: "controller",
    }),
  );
  expect(failedReview.status, failedReview.stderr).toBe(0);

  const args = (service: WorkflowServices) =>
    service.correctionService.correct({
      spec,
      ticket: "T-0001",
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

  const ledgerPath = join(repo, ".spindle/features", "0001-ticket-flow", "sdd.json");
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  delete ledger.tickets[0].assignment.startingHeadSha;
  delete ledger.tickets[0].correctionAttempts[0].assignment.startingHeadSha;
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  execFileSync("git", ["add", ledgerPath], { cwd: repo });
  execFileSync("git", ["commit", "-qm", "record legacy correction"], { cwd: repo });
  writeFileSync(first.assignment.report, "# Correction report\n\nCorrected the finding.\n");
  const next = await execute(repo, (service) => service.deliveryService.next({ spec }));
  expect(next.status, next.stderr).toBe(0);
  const nextText = nextSummary(JSON.parse(next.stdout)).join("\n");
  expect(nextText).toContain(
    "pnpm spindle sdd correct --feature .spindle/features/0001-ticket-flow --ticket T-0001 --findings F-0001 --details 'Preserve the accepted empty-input behavior.' --actor <acting-agent>",
  );
  expect(nextText).not.toContain("sdd submit");
  const legacy = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: first.assignment.id,
      author: "controller",
    }),
  );
  expect(legacy.status).not.toBe(0);
  expect(legacy.stderr).toMatch(/rerun the same sdd correct command/i);
  const recovered = await execute(repo, args);
  expect(recovered.status, recovered.stderr).toBe(0);
  expect(JSON.parse(recovered.stdout).assignment.startingHeadSha).toMatch(/^[a-f0-9]{40,64}$/);
  writeFileSync(join(ticketWorkspace, "feature.ts"), "export const feature = 'legacy fix';\n");
  commitTicketWorkspace(ticketWorkspace, "commit legacy correction");
  const submitted = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: first.assignment.id,
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);
});

test("corrective implementation reports submit through the implementation evidence contract", async () => {
  const { repo, spec, assignment, ticketWorkspace } = await prepareReviewAssignment();
  writeFileSync(assignment.report, "# Initial review\n\nA blocking ticket needs a fix.\n");
  const finding = await execute(repo, (service) =>
    service.findingService.findingCreate({
      spec,
      ticket: "T-0001",
      assignment: assignment.id,
      blocking: true,
      summary: "Incorrect empty-input behavior",
      details: "The implementation rejects an input that the requirements allow.",
      author: "controller",
    }),
  );
  expect(finding.status, finding.stderr).toBe(0);
  const confirmedFinding = await execute(repo, (service) =>
    service.findingService.findingUpdate({
      spec,
      ticket: "T-0001",
      finding: "F-0001",
      status: "confirmed",
      author: "controller",
    }),
  );
  expect(confirmedFinding.status, confirmedFinding.stderr).toBe(0);
  const failedReview = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: assignment.id,
      result: "failed",
      details: "The implementation must be corrected.",
      author: "controller",
    }),
  );
  expect(failedReview.status, failedReview.stderr).toBe(0);

  const dispatched = await execute(repo, (service) =>
    service.correctionService.correct({
      spec,
      ticket: "T-0001",
      findings: ["F-0001"],
      details: "Preserve the accepted empty-input behavior.",
      author: "controller",
    }),
  );
  expect(dispatched.status, dispatched.stderr).toBe(0);
  const fix = JSON.parse(dispatched.stdout).assignment as {
    id: string;
    action: string;
    report: string;
  };
  writeFileSync(fix.report, "# Correction report\n\nCorrected the finding.\n");
  const withoutCommit = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: fix.id,
      author: "controller",
    }),
  );
  expect(withoutCommit.status).not.toBe(0);
  expect(withoutCommit.stderr).toMatch(/no new commits/i);
  writeFileSync(join(ticketWorkspace, "feature.ts"), "export const feature = 'corrected';\n");
  commitTicketWorkspace(ticketWorkspace, "correct feature behavior");

  const submitted = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: fix.id,
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
  const { repo, spec, command } = await prepareImplementationForReview();
  const failed = await recordReviewCheck(repo, spec, command, "failed");
  expect(failed.status, failed.stderr).toBe(0);

  const corrected = await execute(repo, (service) =>
    service.correctionService.correct({
      spec,
      ticket: "T-0001",
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
  const { repo, spec, command, ticketWorkspace } = await prepareImplementationForReview();
  const failed = await recordReviewCheck(repo, spec, command, "failed");
  expect(failed.status, failed.stderr).toBe(0);
  let correction = await execute(repo, (service) =>
    service.correctionService.correct({
      spec,
      ticket: "T-0001",
      checkFailure: command,
      details: "Fix the first observed check failure.",
      author: "controller",
    }),
  );
  expect(correction.status, correction.stderr).toBe(0);
  let attemptNumber = 1;

  for (let nextAttempt = 1; nextAttempt <= 6; nextAttempt += 1) {
    const assigned = JSON.parse(correction.stdout).assignment as {
      id: string;
      report: string;
      attempt: number;
    };
    expect(assigned.attempt).toBe(nextAttempt);
    writeFileSync(join(ticketWorkspace, "feature.ts"), `export const feature = ${nextAttempt};\n`);
    commitTicketWorkspace(ticketWorkspace, `correction attempt ${nextAttempt}`);
    writeFileSync(assigned.report, `# Correction ${nextAttempt}\n\nProgress recorded.\n`);
    const submitted = await execute(repo, (service) =>
      service.submissionService.submit({
        spec,
        ticket: "T-0001",
        assignment: assigned.id,
        author: "controller",
      }),
    );
    expect(submitted.status, submitted.stderr).toBe(0);
    if (nextAttempt < 6) {
      const nextFailedCheck = await recordReviewCheck(repo, spec, command, "failed");
      expect(nextFailedCheck.status, nextFailedCheck.stderr).toBe(0);
      const unassessed = await execute(repo, (service) =>
        service.correctionService.correct({
          spec,
          ticket: "T-0001",
          checkFailure: command,
          details: `Address the newly observed behavior after correction ${nextAttempt}.`,
          decision: "continue",
          author: "controller",
        }),
      );
      expect(unassessed.status).not.toBe(0);
      expect(unassessed.stderr).toMatch(/assessment/i);
      correction = await execute(repo, (service) =>
        service.correctionService.correct({
          spec,
          ticket: "T-0001",
          checkFailure: command,
          details: `Address the newly observed behavior after correction ${nextAttempt}.`,
          decision: "continue",
          assessment: `Correction ${nextAttempt} changed the reviewed behavior; continue with the newly assessed failure.`,
          author: "controller",
        }),
      );
      expect(correction.status, correction.stderr).toBe(0);
      attemptNumber = JSON.parse(correction.stdout).attempt.number as number;
    }
  }

  expect(attemptNumber).toBe(6);
  const resumed = await execute(repo, (service) =>
    service.assignmentService.resume({ spec, ticket: "T-0001", author: "controller" }),
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
  const { repo, spec, command } = await prepareImplementationForReview();
  const failed = await recordReviewCheck(repo, spec, command, "failed");
  expect(failed.status, failed.stderr).toBe(0);

  const paused = await execute(repo, (service) =>
    service.correctionService.correct({
      spec,
      ticket: "T-0001",
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
    service.assignmentService.resume({ spec, ticket: "T-0001", author: "controller" }),
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

test("continuing from a pause before any attempt resolves adjudication and permits later corrections", async () => {
  const { repo, spec, command, ticketWorkspace } = await prepareImplementationForReview();
  const failed = await recordReviewCheck(repo, spec, command, "failed");
  expect(failed.status, failed.stderr).toBe(0);
  const paused = await execute(repo, (service) =>
    service.correctionService.correct({
      spec,
      ticket: "T-0001",
      decision: "pause",
      reason: "requirements-disagreement",
      details: "The failing check may contradict the requirements; request adjudication.",
      author: "controller",
    }),
  );
  expect(paused.status, paused.stderr).toBe(0);
  const pausedNext = await execute(repo, (service) => service.deliveryService.next({ spec }));
  expect(pausedNext.status, pausedNext.stderr).toBe(0);
  expect(JSON.parse(pausedNext.stdout).actions).toContainEqual(
    expect.objectContaining({ ticket: "T-0001", action: "correct", continuationRequired: true }),
  );

  const assessment = "The requirements support the check; a correction can make progress.";
  const continued = await execute(repo, (service) =>
    service.correctionService.correct({
      spec,
      ticket: "T-0001",
      checkFailure: command,
      details: "Satisfy the adjudicated check.",
      decision: "continue",
      assessment,
      author: "controller",
    }),
  );
  expect(continued.status, continued.stderr).toBe(0);
  const first = JSON.parse(continued.stdout) as {
    execution: string;
    attempt: { number: number; progressAssessment?: { details: string } };
    assignment: { id: string; report: string; attempt: number };
  };
  expect(first.execution).toBe("implementing");
  expect(first.attempt.number).toBe(1);
  expect(first.attempt.progressAssessment?.details).toBe(assessment);
  expect(first.assignment.report).toMatch(/round-1-fix\.md$/);

  const resumed = await execute(repo, (service) =>
    service.assignmentService.resume({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(resumed.status, resumed.stderr).toBe(0);
  const state = JSON.parse(resumed.stdout) as {
    adjudication: {
      status: string;
      reason: string;
      resolution?: { details: string; recordedBy: string };
    };
    correctionAttempts: { number: number }[];
  };
  expect(state.adjudication.status).toBe("resolved");
  expect(state.adjudication.reason).toBe("requirements-disagreement");
  expect(state.adjudication.resolution).toMatchObject({
    details: assessment,
    recordedBy: "controller",
  });
  expect(state.correctionAttempts.map(({ number }) => number)).toEqual([1]);

  writeFileSync(join(ticketWorkspace, "feature.ts"), "export const feature = 'adjudicated';\n");
  commitTicketWorkspace(ticketWorkspace, "adjudicated correction");
  writeFileSync(first.assignment.report, "# Correction 1\n\nProgress recorded.\n");
  const submitted = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: first.assignment.id,
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);
  const failedAgain = await recordReviewCheck(repo, spec, command, "failed");
  expect(failedAgain.status, failedAgain.stderr).toBe(0);
  const secondAssessment = "Correction 1 changed the failure; continue with the new behavior.";
  const second = await execute(repo, (service) =>
    service.correctionService.correct({
      spec,
      ticket: "T-0001",
      checkFailure: command,
      details: "Address the remaining check failure.",
      decision: "continue",
      assessment: secondAssessment,
      author: "controller",
    }),
  );
  expect(second.status, second.stderr).toBe(0);
  const secondOutput = JSON.parse(second.stdout) as {
    attempt: { number: number };
    assignment: { report: string };
  };
  expect(secondOutput.attempt.number).toBe(2);
  expect(secondOutput.assignment.report).toMatch(/round-2-fix\.md$/);
  const afterSecond = await execute(repo, (service) =>
    service.assignmentService.resume({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(afterSecond.status, afterSecond.stderr).toBe(0);
  const finalState = JSON.parse(afterSecond.stdout) as {
    adjudication: { status: string; resolution?: { details: string } };
    correctionAttempts: { number: number; progressAssessment?: { details: string } }[];
  };
  expect(finalState.correctionAttempts.map(({ number }) => number)).toEqual([1, 2]);
  expect(finalState.correctionAttempts[0]?.progressAssessment?.details).toBe(secondAssessment);
  expect(finalState.adjudication.status).toBe("resolved");
  expect(finalState.adjudication.resolution?.details).toBe(assessment);
});

test("corrective review findings retain assignment provenance for the next progress decision", async () => {
  const { repo, spec, command, assignment, ticketWorkspace } = await prepareReviewAssignment();
  writeFileSync(assignment.report, "# Initial review\n\nA blocking ticket needs a fix.\n");
  const finding = await execute(repo, (service) =>
    service.findingService.findingCreate({
      spec,
      ticket: "T-0001",
      assignment: assignment.id,
      blocking: true,
      summary: "Incorrect empty-input behavior",
      details: "The implementation rejects an input that the requirements allow.",
      author: "controller",
    }),
  );
  expect(finding.status, finding.stderr).toBe(0);
  const confirmedFinding = await execute(repo, (service) =>
    service.findingService.findingUpdate({
      spec,
      ticket: "T-0001",
      finding: "F-0001",
      status: "confirmed",
      author: "controller",
    }),
  );
  expect(confirmedFinding.status, confirmedFinding.stderr).toBe(0);
  const failedReview = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: assignment.id,
      result: "failed",
      details: "The implementation must be corrected.",
      author: "controller",
    }),
  );
  expect(failedReview.status, failedReview.stderr).toBe(0);

  const corrected = await execute(repo, (service) =>
    service.correctionService.correct({
      spec,
      ticket: "T-0001",
      findings: ["F-0001"],
      details: "Preserve the accepted empty-input behavior.",
      author: "controller",
    }),
  );
  expect(corrected.status, corrected.stderr).toBe(0);
  const fix = JSON.parse(corrected.stdout).assignment as { id: string; report: string };
  writeFileSync(join(ticketWorkspace, "feature.ts"), "export const feature = 'fixed';\n");
  commitTicketWorkspace(ticketWorkspace, "correct feature behavior");
  writeFileSync(fix.report, "# Correction report\n\nCorrected F-0001.\n");
  const submitted = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: fix.id,
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);
  const passingCheck = await recordReviewCheck(repo, spec, command, "passed");
  expect(passingCheck.status, passingCheck.stderr).toBe(0);

  const dispatched = await execute(repo, (service) =>
    service.reviewService.review({
      spec,
      ticket: "T-0001",
      author: "controller",
    }),
  );
  expect(dispatched.status, dispatched.stderr).toBe(0);
  const correctiveReview = JSON.parse(dispatched.stdout).assignments[0] as {
    id: string;
    scope: string;
    attempt?: number;
  };
  expect(correctiveReview.scope).toBe("corrective");
  expect(correctiveReview.attempt).toBe(1);

  writeFileSync(
    JSON.parse(dispatched.stdout).assignments[0].report,
    "# Corrective review\n\nA separate actionable defect remains.\n",
  );
  const correctiveFinding = await execute(repo, (service) =>
    service.findingService.findingCreate({
      spec,
      ticket: "T-0001",
      assignment: correctiveReview.id,
      blocking: true,
      summary: "A new regression remains",
      details: "The correction introduced a second ticket that needs a separate fix.",
      author: "controller",
    }),
  );
  expect(correctiveFinding.status, correctiveFinding.stderr).toBe(0);
  expect(JSON.parse(correctiveFinding.stdout).finding.id).toBe("F-0002");
  const failedCorrectiveReview = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: correctiveReview.id,
      result: "failed",
      details: "The new blocker requires another assessed correction.",
      author: "controller",
    }),
  );
  expect(failedCorrectiveReview.status, failedCorrectiveReview.stderr).toBe(0);
  expect(JSON.parse(failedCorrectiveReview.stdout).execution).toBe("changes-requested");
});

test("resume returns pending corrective reviews after initial review coverage is submitted", async () => {
  const { repo, spec, command, assignment, ticketWorkspace } = await prepareReviewAssignment();
  writeFileSync(assignment.report, "# Initial review\n\nA blocking ticket needs a fix.\n");
  const finding = await execute(repo, (service) =>
    service.findingService.findingCreate({
      spec,
      ticket: "T-0001",
      assignment: assignment.id,
      blocking: true,
      summary: "Incorrect empty-input behavior",
      details: "The implementation rejects an input that the requirements allow.",
      author: "controller",
    }),
  );
  expect(finding.status, finding.stderr).toBe(0);
  const confirmedFinding = await execute(repo, (service) =>
    service.findingService.findingUpdate({
      spec,
      ticket: "T-0001",
      finding: "F-0001",
      status: "confirmed",
      author: "controller",
    }),
  );
  expect(confirmedFinding.status, confirmedFinding.stderr).toBe(0);
  const submittedInitialReview = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: assignment.id,
      result: "failed",
      details: "The implementation must be corrected.",
      author: "controller",
    }),
  );
  expect(submittedInitialReview.status, submittedInitialReview.stderr).toBe(0);

  const correction = await execute(repo, (service) =>
    service.correctionService.correct({
      spec,
      ticket: "T-0001",
      findings: ["F-0001"],
      details: "Correct the empty-input behavior.",
      author: "controller",
    }),
  );
  expect(correction.status, correction.stderr).toBe(0);
  const implementation = JSON.parse(correction.stdout).assignment as { id: string; report: string };
  writeFileSync(join(ticketWorkspace, "feature.ts"), "export const feature = 'fixed';\n");
  commitTicketWorkspace(ticketWorkspace, "correct feature behavior");
  writeFileSync(implementation.report, "# Correction report\n\nCorrected F-0001.\n");
  const submittedCorrection = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: implementation.id,
      author: "controller",
    }),
  );
  expect(submittedCorrection.status, submittedCorrection.stderr).toBe(0);
  const correctedHeadSha = JSON.parse(submittedCorrection.stdout).headSha as string;
  expect(correctedHeadSha).not.toBe(assignment.headSha);
  const passingCheck = await recordReviewCheck(repo, spec, command, "passed");
  expect(passingCheck.status, passingCheck.stderr).toBe(0);

  const dispatchedReview = await execute(repo, (service) =>
    service.reviewService.review({
      spec,
      ticket: "T-0001",
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
    service.assignmentService.resume({ spec, ticket: "T-0001", author: "controller" }),
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

test("a verified corrective review permits ticket integration while retaining initial coverage", async () => {
  const { repo, spec, command, assignment, ticketWorkspace } = await prepareReviewAssignment();
  writeFileSync(assignment.report, "# Initial review\n\nA blocking ticket needs a fix.\n");
  const finding = await execute(repo, (service) =>
    service.findingService.findingCreate({
      spec,
      ticket: "T-0001",
      assignment: assignment.id,
      blocking: true,
      summary: "Incorrect empty-input behavior",
      details: "The implementation rejects an input that the requirements allow.",
      author: "controller",
    }),
  );
  expect(finding.status, finding.stderr).toBe(0);
  const confirmedFinding = await execute(repo, (service) =>
    service.findingService.findingUpdate({
      spec,
      ticket: "T-0001",
      finding: "F-0001",
      status: "confirmed",
      author: "controller",
    }),
  );
  expect(confirmedFinding.status, confirmedFinding.stderr).toBe(0);
  const failedReview = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: assignment.id,
      result: "failed",
      details: "The implementation must be corrected.",
      author: "controller",
    }),
  );
  expect(failedReview.status, failedReview.stderr).toBe(0);

  const correction = await execute(repo, (service) =>
    service.correctionService.correct({
      spec,
      ticket: "T-0001",
      findings: ["F-0001"],
      details: "Preserve the accepted empty-input behavior.",
      author: "controller",
    }),
  );
  expect(correction.status, correction.stderr).toBe(0);
  const fix = JSON.parse(correction.stdout).assignment as { id: string; report: string };
  writeFileSync(join(ticketWorkspace, "feature.ts"), "export const feature = 'fixed';\n");
  commitTicketWorkspace(ticketWorkspace, "correct feature behavior");
  writeFileSync(fix.report, "# Correction report\n\nCorrected F-0001.\n");
  const implementation = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: fix.id,
      author: "controller",
    }),
  );
  expect(implementation.status, implementation.stderr).toBe(0);
  const passingCheck = await recordReviewCheck(repo, spec, command, "passed");
  expect(passingCheck.status, passingCheck.stderr).toBe(0);
  const verified = await execute(repo, (service) =>
    service.findingService.findingUpdate({
      spec,
      ticket: "T-0001",
      finding: "F-0001",
      status: "fixed",
      author: "controller",
    }),
  );
  expect(verified.status, verified.stderr).toBe(0);

  const dispatched = await execute(repo, (service) =>
    service.reviewService.review({
      spec,
      ticket: "T-0001",
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
    service.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: review.id,
      result: "passed",
      author: "controller",
    }),
  );
  expect(reviewed.status, reviewed.stderr).toBe(0);

  const integrated = await execute(repo, (service) =>
    service.ticketIntegrationService.integrate({
      spec,
      ticket: "T-0001",
      author: "controller",
    }),
  );
  expect(integrated.status, integrated.stderr).toBe(0);
  expect(JSON.parse(integrated.stdout)).toMatchObject({
    ticket: "T-0001",
    postMerge: "pending",
  });
  expect(
    JSON.parse(
      readFileSync(join(repo, ".spindle/features", "0001-ticket-flow", "sdd.json"), "utf8"),
    ).tickets[0].execution,
  ).toBe("integrated");
});

test("requirements decisions require fresh review before deferring a blocking finding", async () => {
  const { repo, spec, command, assignment, ticketWorkspace } = await prepareReviewAssignment();
  writeFileSync(assignment.report, "# Initial review\n\nA criterion is implicated.\n");
  const created = await execute(repo, (service) =>
    service.findingService.findingCreate({
      spec,
      ticket: "T-0001",
      assignment: assignment.id,
      blocking: true,
      summary: "Scope no longer includes this behavior",
      details: "The current acceptance criteria require this behavior.",
      author: "controller",
    }),
  );
  expect(created.status, created.stderr).toBe(0);
  const initialReview = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: assignment.id,
      result: "passed",
      author: "controller",
    }),
  );
  expect(initialReview.status, initialReview.stderr).toBe(0);

  const ticketPath = join(repo, ".spindle/features", "0001-ticket-flow", "tickets", "T-0001.md");
  const initialTicket = readFileSync(ticketPath, "utf8");
  writeFileSync(
    ticketPath,
    initialTicket.replace(
      "[ACCEPTANCE CRITERIA]\n\n## Comments",
      "The changed scope excludes this behavior.\n\n## Comments",
    ),
  );
  commitRequirementAndRebaseTicket(
    repo,
    ticketWorkspace,
    ".spindle/features/0001-ticket-flow/tickets/T-0001.md",
    "revise ticket requirements",
  );
  const deferred = async (
    extra: Partial<Parameters<WorkflowServices["findingService"]["findingUpdate"]>[0]>,
  ) =>
    await execute(repo, (service) =>
      service.findingService.findingUpdate({
        spec,
        ticket: "T-0001",
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
    service.requirementsService.requirementsDecide({
      spec,
      ticket: "T-0001",
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
    headSha: string;
  };
  expect(decision.id).toBe("R-0001");
  expect(decision.status).toBe("approved");

  const ledgerPath = join(repo, ".spindle/features", "0001-ticket-flow", "sdd.json");
  const persistedDecision = JSON.parse(readFileSync(ledgerPath, "utf8")).tickets[0];
  expect(persistedDecision.reviewAssignments).toBe(undefined);
  expect(persistedDecision.reviewHistory.length).toBe(1);
  expect(persistedDecision.requirementsDecisions[0].author).toBe("controller");
  const decidedStatus = await execute(repo, (service) =>
    service.featureInspectionService.status({ spec }),
  );
  const decidedNext = await execute(repo, (service) => service.deliveryService.next({ spec }));
  expect(decidedStatus.status, decidedStatus.stderr).toBe(0);
  expect(decidedNext.status, decidedNext.stderr).toBe(0);
  expect(JSON.parse(decidedStatus.stdout).requirementsDecisions[0].decision.id).toBe("R-0001");
  expect(JSON.parse(decidedNext.stdout).requirementsDecisions[0].decision.status).toBe("approved");
  expect(JSON.stringify(JSON.parse(decidedStatus.stdout).blockers)).toMatch(
    /Required check .*stale/,
  );

  const currentStatus = await execute(repo, (service) =>
    service.featureInspectionService.status({ spec }),
  );
  expect(currentStatus.status, currentStatus.stderr).toBe(0);
  const passing = await recordReviewCheck(repo, spec, command, "passed");
  expect(passing.status, passing.stderr).toBe(0);

  const reviewed = await execute(repo, (service) =>
    service.reviewService.review({
      spec,
      ticket: "T-0001",
      author: "controller",
    }),
  );
  expect(reviewed.status, reviewed.stderr).toBe(0);
  const freshAssignment = JSON.parse(reviewed.stdout).assignments[0] as {
    id: string;
    report: string;
  };
  expect(freshAssignment.id).not.toBe(assignment.id);
  writeFileSync(freshAssignment.report, "# Fresh review\n\nThe revised criterion is reviewed.\n");
  const linked = await execute(repo, (service) =>
    service.findingService.findingCreate({
      spec,
      ticket: "T-0001",
      assignment: freshAssignment.id,
      blocking: true,
      summary: "Scope no longer includes this behavior",
      details: "The current acceptance criteria require this behavior.",
      link: "F-0001",
      author: "controller",
    }),
  );
  expect(linked.status, linked.stderr).toBe(0);
  const submitted = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: freshAssignment.id,
      result: "passed",
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);

  const next = await execute(repo, (service) => service.deliveryService.next({ spec }));
  expect(next.status, next.stderr).toBe(0);
  expect(nextSummary(JSON.parse(next.stdout)).join("\n")).toContain(
    "pnpm spindle sdd finding update --feature .spindle/features/0001-ticket-flow --ticket T-0001 --finding F-0001 --status deferred --details <deferral-rationale> --follow-up <follow-up-reference> --requirements-decision <approved-decision-id> --actor <acting-agent>",
  );
  const finalDisposition = await deferred({ requirementsDecision: decision.id });
  expect(finalDisposition.status, finalDisposition.stderr).toBe(0);
  const finding = JSON.parse(finalDisposition.stdout).finding;
  expect(finding.status).toBe("deferred");
  expect(finding.requirementsDecision).toBe(decision.id);
  const integrated = await execute(repo, (service) =>
    service.ticketIntegrationService.integrate({
      spec,
      ticket: "T-0001",
      author: "controller",
    }),
  );
  expect(integrated.status, integrated.stderr).toBe(0);
  expect(JSON.parse(integrated.stdout).postMerge).toBe("pending");
});

test("review submission derives an empty findings list from assignment provenance and is idempotent", async () => {
  const { repo, spec, assignment } = await prepareReviewAssignment();
  writeFileSync(assignment.report, "# Review report\n\nNo defects found.\n");
  const submit = async (assignmentId: string, result?: string) =>
    await execute(repo, (service) =>
      service.submissionService.submit({
        spec,
        ticket: "T-0001",
        assignment: assignmentId,
        ...(result ? { result } : {}),
        author: "controller",
      }),
    );

  const wrongAssignment = await submit(`${assignment.id}-other`, "passed");
  expect(wrongAssignment.status).not.toBe(0);
  expect(wrongAssignment.stderr).toMatch(/assignment/i);

  const missingResult = await submit(assignment.id);
  expect(missingResult.status).not.toBe(0);
  expect(missingResult.stderr).toMatch(/explicit --result/);

  const registered = await submit(assignment.id, "passed");
  expect(registered.status, registered.stderr).toBe(0);
  const result = JSON.parse(registered.stdout) as {
    execution: string;
    assignment: {
      id: string;
      status: string;
      result: string;
      findingIds: string[];
      headSha: string;
      reportSha256: string;
    };
  };
  expect(result.execution).toBe("reviewing");
  expect(result.assignment.id).toBe(assignment.id);
  expect(result.assignment.status).toBe("submitted");
  expect(result.assignment.result).toBe("passed");
  expect(result.assignment.findingIds).toEqual([]);
  expect(result.assignment.headSha).toBe(assignment.headSha);
  expect(result.assignment.reportSha256).toMatch(/^[0-9a-f]{64}$/);

  const repeated = await submit(assignment.id, "passed");
  expect(repeated.status, repeated.stderr).toBe(0);
  expect(JSON.parse(repeated.stdout).idempotent).toBe(true);
  const ticketText = readFileSync(
    join(repo, ".spindle/features", "0001-ticket-flow", "tickets", "T-0001.md"),
    "utf8",
  );
  expect(ticketText.match(/Review report submitted for assignment/g)?.length).toBe(1);

  writeFileSync(assignment.report, "# Changed review report\n");
  const altered = await submit(assignment.id, "passed");
  expect(altered.status).not.toBe(0);
  expect(altered.stderr).toMatch(/changed after submission/);
});

test("failed review requires details and blocks integration", async () => {
  const { repo, spec, assignment } = await prepareReviewAssignment();
  writeFileSync(assignment.report, "# Review report\n\nA blocking defect was found.\n");
  const submit = async (details?: string) =>
    await execute(repo, (service) =>
      service.submissionService.submit({
        spec,
        ticket: "T-0001",
        assignment: assignment.id,
        result: "failed",
        ...(details ? { details } : {}),
        author: "controller",
      }),
    );

  const missingDetails = await submit();
  expect(missingDetails.status).not.toBe(0);
  expect(missingDetails.stderr).toMatch(/--details/);
  const missingFinding = await submit("A blocking defect was found in the implementation.");
  expect(missingFinding.status).not.toBe(0);
  expect(missingFinding.stderr).toMatch(/failed review requires at least one registered finding/i);
  const finding = await execute(repo, (service) =>
    service.findingService.findingCreate({
      spec,
      ticket: "T-0001",
      assignment: assignment.id,
      blocking: true,
      summary: "Blocking defect",
      details: "A blocking defect was found in the implementation.",
      author: "controller",
    }),
  );
  expect(finding.status, finding.stderr).toBe(0);
  const recordedFailure = await submit("A blocking defect was found in the implementation.");
  expect(recordedFailure.status, recordedFailure.stderr).toBe(0);
  const submitted = JSON.parse(recordedFailure.stdout).assignment;
  expect(submitted.result).toBe("failed");
  expect(submitted.findingIds).toEqual(["F-0001"]);
  expect(submitted.details).toBe("A blocking defect was found in the implementation.");
  expect(
    JSON.parse(
      readFileSync(join(repo, ".spindle/features", "0001-ticket-flow", "sdd.json"), "utf8"),
    ).tickets[0].reviewAssignments[0].details,
  ).toBe("A blocking defect was found in the implementation.");

  const integrated = await execute(repo, (service) =>
    service.ticketIntegrationService.integrate({
      spec,
      ticket: "T-0001",
      author: "controller",
    }),
  );
  expect(integrated.status).not.toBe(0);
  expect(integrated.stderr).toMatch(/failed/);
});

test("unavailable review requires details and blocks integration", async () => {
  const { repo, spec, assignment } = await prepareReviewAssignment();
  writeFileSync(assignment.report, "# Review report\n\nReview could not be completed.\n");
  const submit = async (details?: string) =>
    await execute(repo, (service) =>
      service.submissionService.submit({
        spec,
        ticket: "T-0001",
        assignment: assignment.id,
        result: "unavailable",
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
  expect(submitted.findingIds).toEqual([]);
  expect(submitted.details).toBe("The reviewer could not assess whether findings exist.");
  expect(
    JSON.parse(
      readFileSync(join(repo, ".spindle/features", "0001-ticket-flow", "sdd.json"), "utf8"),
    ).tickets[0].reviewAssignments[0].details,
  ).toBe("The reviewer could not assess whether findings exist.");

  const integrated = await execute(repo, (service) =>
    service.ticketIntegrationService.integrate({
      spec,
      ticket: "T-0001",
      author: "controller",
    }),
  );
  expect(integrated.status).not.toBe(0);
  expect(integrated.stderr).toMatch(/unavailable/);
});

test("integration requires current checks and complete passing finding-free reviews", async () => {
  const { repo, spec, assignment } = await prepareReviewAssignment();
  writeFileSync(assignment.report, "# Review report\n\nNo defects found.\n");
  const submitted = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: assignment.id,
      result: "passed",
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);

  const integrated = await execute(repo, (service) =>
    service.ticketIntegrationService.integrate({
      spec,
      ticket: "T-0001",
      author: "controller",
    }),
  );
  expect(integrated.status, integrated.stderr).toBe(0);
  const result = JSON.parse(integrated.stdout) as {
    ticket: string;
    ticketCommit: string;
    mergeCommit: string;
    postMerge: string;
  };
  expect(result.ticket).toBe("T-0001");
  expect(result.ticketCommit).toMatch(/^[0-9a-f]{40,64}$/);
  expect(result.mergeCommit).toMatch(/^[0-9a-f]{40,64}$/);
  expect(result.postMerge).toBe("pending");
  expect(
    JSON.parse(
      readFileSync(join(repo, ".spindle/features", "0001-ticket-flow", "sdd.json"), "utf8"),
    ).tickets[0].execution,
  ).toBe("integrated");
  const repeated = await execute(repo, (service) =>
    service.ticketIntegrationService.integrate({
      spec,
      ticket: "T-0001",
      author: "controller",
    }),
  );
  expect(repeated.status, repeated.stderr).toBe(0);
  expect(JSON.parse(repeated.stdout).idempotent).toBe(true);
});
