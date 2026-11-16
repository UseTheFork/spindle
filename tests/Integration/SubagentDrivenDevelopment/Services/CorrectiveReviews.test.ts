import { writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  commitTicketWorkspace,
  execute,
  prepareReviewAssignment,
  recordReviewCheck,
} from "@test/Helpers/SubagentDrivenDevelopment/helpers";
import { expect, test } from "vitest";

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
