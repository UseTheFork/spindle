import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  claimDelivery,
  execute,
  commitRequirement,
  recordDeliveryCheck,
  prepareIntegratedTicket,
} from "@test/Helpers/SubagentDrivenDevelopment/helpers";
import { nextSummary } from "@test/Helpers/SubagentDrivenDevelopment/StatusSummary";
import { expect, test, vi } from "vitest";

vi.setConfig({ testTimeout: 60_000 });

test("delivery finding verification requires a committed feature change after observation", async () => {
  const { repo, spec } = await prepareIntegratedTicket();
  await recordDeliveryCheck(repo, spec);

  const review = await execute(repo, (service) =>
    service.reviewService.review({ spec, scope: "delivery", author: "controller" }),
  );
  expect(review.status, review.stderr).toBe(0);
  const assignment = JSON.parse(review.stdout).assignments[0] as {
    id: string;
    report: string;
    headSha: string;
  };
  writeFileSync(assignment.report, "# Aggregate review\n\nA blocking issue.\n");
  const created = await execute(repo, (service) =>
    service.findingService.findingCreate({
      ticket: "",
      spec,
      scope: "delivery",
      assignment: assignment.id,
      blocking: true,
      summary: "Feature behavior needs correction",
      details: "The feature source does not satisfy the delivery requirement.",
      author: "controller",
    }),
  );
  expect(created.status, created.stderr).toBe(0);

  const premature = await execute(repo, (service) =>
    service.findingService.findingUpdate({
      ticket: "",
      spec,
      scope: "delivery",
      finding: "F-0001",
      status: "fixed",
      author: "controller",
    }),
  );
  expect(premature.status).not.toBe(0);
  expect(premature.stderr).toMatch(/committed change since every finding observation/i);

  writeFileSync(join(repo, "feature.ts"), "export const feature = 'corrected';\n");
  commitRequirement(repo, "feature.ts", "fix feature source after observation");
  await recordDeliveryCheck(repo, spec);

  const fixed = await execute(repo, (service) =>
    service.findingService.findingUpdate({
      ticket: "",
      spec,
      scope: "delivery",
      finding: "F-0001",
      status: "fixed",
      author: "controller",
    }),
  );
  expect(fixed.status, fixed.stderr).toBe(0);
  expect(JSON.parse(fixed.stdout).finding.status).toBe("fixed");
  expect(JSON.parse(fixed.stdout).finding.verification.headSha).not.toBe(assignment.headSha);
});

test("delivery correction attempts resume independently with the same assignment and finding history", async () => {
  const { repo, spec } = await prepareIntegratedTicket();
  await recordDeliveryCheck(repo, spec);

  const dispatched = await execute(repo, (service) =>
    service.reviewService.review({
      spec,
      scope: "delivery",
      author: "controller",
    }),
  );
  expect(dispatched.status, dispatched.stderr).toBe(0);
  const assignment = JSON.parse(dispatched.stdout).assignments[0] as {
    id: string;
    report: string;
  };
  writeFileSync(assignment.report, "# Aggregate review\n\nA whole-feature blocker.\n");
  const created = await execute(repo, (service) =>
    service.findingService.findingCreate({
      ticket: "",
      spec,
      scope: "delivery",
      assignment: assignment.id,
      blocking: true,
      summary: "Integrated behaviors disagree",
      details: "The independently accepted ticket implementations conflict at their boundary.",
      author: "controller",
    }),
  );
  expect(created.status, created.stderr).toBe(0);
  const submitted = await execute(repo, (service) =>
    service.submissionService.submit({
      ticket: "",
      spec,
      scope: "delivery",
      assignment: assignment.id,
      result: "failed",
      details: "The aggregate finding must be corrected.",
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);
  const checkCommand = "just test::test tests/whole-feature.test.ts";
  for (const result of ["unavailable", "passed"] as const) {
    const recorded = await execute(repo, (service) =>
      service.checksService.checksRecord({
        ticket: "",
        spec,
        scope: "delivery",
        command: checkCommand,
        result,
        ...(result === "unavailable" ? { details: "The test service is unavailable." } : {}),
        author: "controller",
      }),
    );
    expect(recorded.status, recorded.stderr).toBe(0);
    if (result === "unavailable") {
      const duringRetry = await execute(repo, (service) => service.deliveryService.next({ spec }));
      expect(duringRetry.status, duringRetry.stderr).toBe(0);
      expect(nextSummary(JSON.parse(duringRetry.stdout)).join("\n")).toContain(
        `Run delivery check: ${checkCommand}`,
      );
    }
  }
  const afterRetry = await execute(repo, (service) => service.deliveryService.next({ spec }));
  expect(afterRetry.status, afterRetry.stderr).toBe(0);
  expect(JSON.parse(afterRetry.stdout).delivery.execution).toBe("changes-requested");
  const confirmed = await execute(repo, (service) =>
    service.findingService.findingUpdate({
      ticket: "",
      spec,
      scope: "delivery",
      finding: "F-0001",
      status: "confirmed",
      author: "controller",
    }),
  );
  expect(confirmed.status, confirmed.stderr).toBe(0);

  const next = await execute(repo, (service) => service.deliveryService.next({ spec }));
  expect(next.status, next.stderr).toBe(0);
  expect(JSON.parse(next.stdout).delivery.action).toBe("correct");

  const correction = await execute(repo, (service) =>
    service.correctionService.correct({
      ticket: "",
      spec,
      scope: "delivery",
      findings: ["F-0001"],
      details: "Reconcile the cross-ticket behavior without weakening either criterion.",
      author: "controller",
    }),
  );
  expect(correction.status, correction.stderr).toBe(0);
  const output = JSON.parse(correction.stdout) as {
    scope: string;
    attempt: { number: number; findingIds: string[] };
    assignment: { id: string; report: string; action: string };
  };
  expect(output.scope).toBe("delivery");
  expect(output.attempt.number).toBe(1);
  expect(output.attempt.findingIds).toEqual(["F-0001"]);
  expect(output.assignment.action).toBe("correct");
  expect(output.assignment.report).toMatch(/final-round-1-fix\.md$/);

  const resumed = await execute(repo, (service) =>
    service.assignmentService.resume({ ticket: "", spec, scope: "delivery", author: "controller" }),
  );
  expect(resumed.status, resumed.stderr).toBe(0);
  const resumedOutput = JSON.parse(resumed.stdout) as {
    scope: string;
    nextAction: string;
    assignment: { id: string };
    correctionAttempts: { number: number; assignmentId: string }[];
  };
  expect(resumedOutput.scope).toBe("delivery");
  expect(resumedOutput.nextAction).toBe("await-implementation-report");
  expect(resumedOutput.assignment.id).toBe(output.assignment.id);
  expect(resumedOutput.correctionAttempts.map(({ number }) => number)).toEqual([1]);
  expect(resumedOutput.correctionAttempts[0]?.assignmentId).toBe(output.assignment.id);
  const unavailable = await execute(repo, (service) =>
    service.submissionService.submit({
      ticket: "",
      spec,
      scope: "delivery",
      assignment: output.assignment.id,
      result: "unavailable",
      details: "The worker could not return a report.",
      author: "controller",
    }),
  );
  expect(unavailable.status, unavailable.stderr).toBe(0);
  const missing = await execute(repo, (service) => service.deliveryService.next({ spec }));
  expect(missing.status, missing.stderr).toBe(0);
  const missingStatus = JSON.parse(missing.stdout);
  expect(missingStatus.pendingAssignments).toContainEqual(
    expect.objectContaining({
      id: output.assignment.id,
      status: "unavailable",
      reportPresent: false,
      scope: "delivery",
    }),
  );
  expect(nextSummary(missingStatus).join("\n")).toContain("assignment: unavailable");
  writeFileSync(
    join(repo, "feature.ts"),
    "export const feature = 'corrected whole-spec behavior';\n",
  );
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
  git("add", "feature.ts");
  git("commit", "-qm", "commit delivery correction");
  writeFileSync(output.assignment.report, "# Delivery correction\n\nProgress recorded.\n");
  const present = await execute(repo, (service) => service.deliveryService.next({ spec }));
  expect(present.status, present.stderr).toBe(0);
  expect(nextSummary(JSON.parse(present.stdout)).join("\n")).toContain(
    `pnpm spindle sdd submit --feature .spindle/features/0001-ticket-flow --scope delivery --assignment ${output.assignment.id} --actor <acting-agent>`,
  );
  const implementation = await execute(repo, (service) =>
    service.submissionService.submit({
      ticket: "",
      spec,
      scope: "delivery",
      assignment: output.assignment.id,
      author: "controller",
    }),
  );
  expect(implementation.status, implementation.stderr).toBe(0);
  await recordDeliveryCheck(repo, spec);
  const correctiveReview = await execute(repo, (service) =>
    service.reviewService.review({
      spec,
      scope: "delivery",
      author: "controller",
    }),
  );
  expect(correctiveReview.status, correctiveReview.stderr).toBe(0);
  const correctiveAssignment = JSON.parse(correctiveReview.stdout).assignments[0] as {
    id: string;
    attempt: number;
    scope: string;
    report: string;
  };
  expect(correctiveAssignment.scope).toBe("delivery");
  expect(correctiveAssignment.attempt).toBe(1);
  expect(correctiveAssignment.report).toMatch(/final-round-1-review-/);
  writeFileSync(correctiveAssignment.report, "# Corrective aggregate review\n\nNo regressions.\n");
  const correctiveReviewSubmission = await execute(repo, (service) =>
    service.submissionService.submit({
      ticket: "",
      spec,
      scope: "delivery",
      assignment: correctiveAssignment.id,
      result: "passed",
      author: "controller",
    }),
  );
  expect(correctiveReviewSubmission.status, correctiveReviewSubmission.stderr).toBe(0);

  const paused = await execute(repo, (service) =>
    service.correctionService.correct({
      ticket: "",
      spec,
      scope: "delivery",
      decision: "pause",
      reason: "no-progress",
      details: "The first correction attempt made no demonstrable progress.",
      author: "controller",
    }),
  );
  expect(paused.status, paused.stderr).toBe(0);
  expect(JSON.parse(paused.stdout).adjudication.status).toBe("pending");
  const adjudicationResume = await execute(repo, (service) =>
    service.assignmentService.resume({ ticket: "", spec, scope: "delivery", author: "controller" }),
  );
  expect(adjudicationResume.status, adjudicationResume.stderr).toBe(0);
  const adjudicationState = JSON.parse(adjudicationResume.stdout) as {
    nextAction: string;
    adjudication: { status: string; reason: string };
  };
  expect(adjudicationState.nextAction).toBe("adjudicate");
  expect(adjudicationState.adjudication.status).toBe("pending");
  expect(adjudicationState.adjudication.reason).toBe("no-progress");

  const continued = await execute(repo, (service) =>
    service.correctionService.correct({
      ticket: "",
      spec,
      scope: "delivery",
      findings: ["F-0001"],
      details: "Continue with an independently reviewed plan.",
      decision: "continue",
      assessment:
        "The revised plan isolates the cross-ticket contract and can demonstrate progress.",
      author: "controller",
    }),
  );
  expect(continued.status, continued.stderr).toBe(0);
  const secondAttempt = JSON.parse(continued.stdout) as {
    attempt: { number: number };
    assignment: { id: string; report: string };
    adjudication: { status: string };
  };
  expect(secondAttempt.attempt.number).toBe(2);
  expect(secondAttempt.assignment.report).toMatch(/final-round-2-fix\.md$/);
  expect(secondAttempt.adjudication.status).toBe("resolved");
  const resumedSecond = await execute(repo, (service) =>
    service.assignmentService.resume({ ticket: "", spec, scope: "delivery", author: "controller" }),
  );
  expect(resumedSecond.status, resumedSecond.stderr).toBe(0);
  expect(JSON.parse(resumedSecond.stdout).assignment.id).toBe(secondAttempt.assignment.id);
  const ledger = JSON.parse(
    readFileSync(join(repo, ".spindle/features", "0001-ticket-flow", "sdd.json"), "utf8"),
  );
  expect(ledger.delivery.correctionAttempts.length).toBe(2);
  expect(ledger.delivery.correctionAttempts[0].progressAssessment.result).toBe("productive");
  expect(ledger.delivery.adjudication.status).toBe("resolved");
  expect(ledger.tickets[0].correctionAttempts).toBe(undefined);
});

test("delivery requirements rulings authorize only a freshly reviewed deferral", async () => {
  const { repo, spec } = await prepareIntegratedTicket();
  await claimDelivery(repo, spec);
  const checkCommand = "just test::test tests/whole-feature.test.ts";
  const requiredBeforeReview = await execute(repo, (service) =>
    service.checksService.checksRequire({
      ticket: "",
      spec,
      scope: "delivery",
      command: checkCommand,
      author: "controller",
    }),
  );
  expect(requiredBeforeReview.status, requiredBeforeReview.stderr).toBe(0);
  const recordedBeforeReview = await execute(repo, (service) =>
    service.checksService.checksRecord({
      ticket: "",
      spec,
      scope: "delivery",
      command: checkCommand,
      result: "passed",
      author: "controller",
    }),
  );
  expect(recordedBeforeReview.status, recordedBeforeReview.stderr).toBe(0);
  const firstReview = await execute(repo, (service) =>
    service.reviewService.review({
      spec,
      scope: "delivery",
      author: "controller",
    }),
  );
  expect(firstReview.status, firstReview.stderr).toBe(0);
  const initialAssignment = JSON.parse(firstReview.stdout).assignments[0] as {
    id: string;
    report: string;
  };
  writeFileSync(
    initialAssignment.report,
    "# Initial aggregate review\n\nFinding recorded below.\n",
  );
  const findingResult = await execute(repo, (service) =>
    service.findingService.findingCreate({
      ticket: "",
      spec,
      scope: "delivery",
      assignment: initialAssignment.id,
      blocking: true,
      summary: "A feature acceptance requirement is no longer applicable",
      details: "The feature spec has not yet been amended to reflect the approved change.",
      author: "controller",
    }),
  );
  expect(findingResult.status, findingResult.stderr).toBe(0);
  const findingId = JSON.parse(findingResult.stdout).finding.id as string;
  const initialSubmission = await execute(repo, (service) =>
    service.submissionService.submit({
      ticket: "",
      spec,
      scope: "delivery",
      assignment: initialAssignment.id,
      result: "passed",
      author: "controller",
    }),
  );
  expect(initialSubmission.status, initialSubmission.stderr).toBe(0);
  writeFileSync(join(repo, "feature.ts"), "export const feature = 'code-only change';\n");
  commitRequirement(repo, "feature.ts", "change code without changing requirements");
  const codeOnlyDecision = await execute(repo, (service) =>
    service.requirementsService.requirementsDecide({
      ticket: "",
      spec,
      scope: "delivery",
      finding: findingId,
      decision: "approved",
      details: "Code changes do not authorize a scope change.",
      author: "controller",
    }),
  );
  expect(codeOnlyDecision.status).not.toBe(0);
  expect(codeOnlyDecision.stderr).toMatch(/explicit requirements change after review/i);
  writeFileSync(
    spec,
    `${readFileSync(spec, "utf8")}\n## Approved delivery change\n\nThe affected behavior is out of scope.\n`,
  );
  commitRequirement(
    repo,
    ".spindle/features/0001-ticket-flow/spec.md",
    "revise delivery requirements",
  );

  const unapprovedDeferral = await execute(repo, (service) =>
    service.findingService.findingUpdate({
      ticket: "",
      spec,
      scope: "delivery",
      finding: findingId,
      status: "deferred",
      details: "Attempted without a requirements ruling.",
      followUp: "Feature proposal 17",
      requirementsDecision: "R-9999",
      author: "controller",
    }),
  );
  expect(unapprovedDeferral.status).not.toBe(0);

  const decision = await execute(repo, (service) =>
    service.requirementsService.requirementsDecide({
      spec,
      scope: "delivery",
      finding: findingId,
      decision: "approved",
      details: "The feature acceptance criteria were explicitly revised.",
      author: "controller",
    }),
  );
  expect(decision.status, decision.stderr).toBe(0);
  const decisionId = JSON.parse(decision.stdout).decision.id as string;
  expect(decisionId).toBe("R-0001");
  const repeatedDecision = await execute(repo, (service) =>
    service.requirementsService.requirementsDecide({
      spec,
      scope: "delivery",
      finding: findingId,
      decision: "approved",
      details: "The feature acceptance criteria were explicitly revised.",
      author: "controller",
    }),
  );
  expect(repeatedDecision.status, repeatedDecision.stderr).toBe(0);
  expect(JSON.parse(repeatedDecision.stdout).idempotent).toBe(true);

  const beforeFreshReview = await execute(repo, (service) =>
    service.findingService.findingUpdate({
      ticket: "",
      spec,
      scope: "delivery",
      finding: findingId,
      status: "deferred",
      details: "Attempted before fresh aggregate review.",
      followUp: "Feature proposal 17",
      requirementsDecision: decisionId,
      author: "controller",
    }),
  );
  expect(beforeFreshReview.status).not.toBe(0);
  expect(beforeFreshReview.stderr).toMatch(/fresh passing aggregate review/i);

  const required = await execute(repo, (service) =>
    service.checksService.checksRequire({
      ticket: "",
      spec,
      scope: "delivery",
      command: checkCommand,
      author: "controller",
    }),
  );
  expect(required.status, required.stderr).toBe(0);
  const recorded = await execute(repo, (service) =>
    service.checksService.checksRecord({
      ticket: "",
      spec,
      scope: "delivery",
      command: checkCommand,
      result: "passed",
      author: "controller",
    }),
  );
  expect(recorded.status, recorded.stderr).toBe(0);
  const review = await execute(repo, (service) =>
    service.reviewService.review({
      spec,
      scope: "delivery",
      author: "controller",
    }),
  );
  expect(review.status, review.stderr).toBe(0);
  const assignment = JSON.parse(review.stdout).assignments[0] as {
    id: string;
    report: string;
  };
  writeFileSync(assignment.report, "# Fresh aggregate review\n\nApproved scope change reviewed.\n");
  const submitted = await execute(repo, (service) =>
    service.submissionService.submit({
      ticket: "",
      spec,
      scope: "delivery",
      assignment: assignment.id,
      result: "passed",
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);

  const next = await execute(repo, (service) => service.deliveryService.next({ spec }));
  expect(next.status, next.stderr).toBe(0);
  expect(nextSummary(JSON.parse(next.stdout)).join("\n")).toContain(
    `pnpm spindle sdd finding update --feature .spindle/features/0001-ticket-flow --scope delivery --finding ${findingId} --status deferred --details <deferral-rationale> --follow-up <follow-up-reference> --requirements-decision <approved-decision-id> --actor <acting-agent>`,
  );
  const deferred = await execute(repo, (service) =>
    service.findingService.findingUpdate({
      ticket: "",
      spec,
      scope: "delivery",
      finding: findingId,
      status: "deferred",
      details: "The approved requirements change removes this behavior from delivery scope.",
      followUp: "Feature proposal 17",
      requirementsDecision: decisionId,
      author: "controller",
    }),
  );
  expect(deferred.status, deferred.stderr).toBe(0);
  const result = JSON.parse(deferred.stdout) as { finding: { status: string; followUp: string } };
  expect(result.finding.status).toBe("deferred");
  expect(result.finding.followUp).toBe("Feature proposal 17");
});

test("delivery continuation from a pause before any attempt resolves adjudication and permits later corrections", async () => {
  const { repo, spec } = await prepareIntegratedTicket();
  await recordDeliveryCheck(repo, spec);
  const dispatched = await execute(repo, (service) =>
    service.reviewService.review({ spec, scope: "delivery", author: "controller" }),
  );
  expect(dispatched.status, dispatched.stderr).toBe(0);
  const review = JSON.parse(dispatched.stdout).assignments[0] as { id: string; report: string };
  writeFileSync(review.report, "# Aggregate review\n\nA whole-feature blocker.\n");
  const created = await execute(repo, (service) =>
    service.findingService.findingCreate({
      ticket: "",
      spec,
      scope: "delivery",
      assignment: review.id,
      blocking: true,
      summary: "Integrated behaviors disagree",
      details: "The independently accepted ticket implementations conflict at their boundary.",
      author: "controller",
    }),
  );
  expect(created.status, created.stderr).toBe(0);
  const failedReview = await execute(repo, (service) =>
    service.submissionService.submit({
      ticket: "",
      spec,
      scope: "delivery",
      assignment: review.id,
      result: "failed",
      details: "The aggregate finding must be corrected.",
      author: "controller",
    }),
  );
  expect(failedReview.status, failedReview.stderr).toBe(0);
  const confirmed = await execute(repo, (service) =>
    service.findingService.findingUpdate({
      ticket: "",
      spec,
      scope: "delivery",
      finding: "F-0001",
      status: "confirmed",
      author: "controller",
    }),
  );
  expect(confirmed.status, confirmed.stderr).toBe(0);

  const paused = await execute(repo, (service) =>
    service.correctionService.correct({
      ticket: "",
      spec,
      scope: "delivery",
      decision: "pause",
      reason: "requirements-disagreement",
      details: "The finding may contradict the accepted requirements; request adjudication.",
      author: "controller",
    }),
  );
  expect(paused.status, paused.stderr).toBe(0);
  expect(JSON.parse(paused.stdout).adjudication.status).toBe("pending");

  const assessment = "The requirements support the finding; a correction can make progress.";
  const continued = await execute(repo, (service) =>
    service.correctionService.correct({
      ticket: "",
      spec,
      scope: "delivery",
      findings: ["F-0001"],
      details: "Reconcile the cross-ticket behavior.",
      decision: "continue",
      assessment,
      author: "controller",
    }),
  );
  expect(continued.status, continued.stderr).toBe(0);
  const first = JSON.parse(continued.stdout) as {
    execution: string;
    attempt: { number: number; progressAssessment?: { details: string } };
    assignment: { id: string; report: string };
    adjudication: { status: string; resolution?: { details: string; recordedBy: string } };
  };
  expect(first.execution).toBe("implementing");
  expect(first.attempt.number).toBe(1);
  expect(first.attempt.progressAssessment?.details).toBe(assessment);
  expect(first.assignment.report).toMatch(/final-round-1-fix\.md$/);
  expect(first.adjudication.status).toBe("resolved");
  expect(first.adjudication.resolution).toMatchObject({
    details: assessment,
    recordedBy: "controller",
  });

  writeFileSync(join(repo, "feature.ts"), "export const feature = 'adjudicated delivery';\n");
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
  git("add", "feature.ts");
  git("commit", "-qm", "commit adjudicated delivery correction");
  writeFileSync(first.assignment.report, "# Delivery correction\n\nProgress recorded.\n");
  const implementation = await execute(repo, (service) =>
    service.submissionService.submit({
      ticket: "",
      spec,
      scope: "delivery",
      assignment: first.assignment.id,
      author: "controller",
    }),
  );
  expect(implementation.status, implementation.stderr).toBe(0);
  const checkCommand = "just test::test tests/whole-feature.test.ts";
  await recordDeliveryCheck(repo, spec, checkCommand);
  const failedCheck = await execute(repo, (service) =>
    service.checksService.checksRecord({
      ticket: "",
      spec,
      scope: "delivery",
      command: checkCommand,
      result: "failed",
      details: "The whole-feature check still fails.",
      author: "controller",
    }),
  );
  expect(failedCheck.status, failedCheck.stderr).toBe(0);

  const secondAssessment = "Correction 1 changed the failure; continue with the new behavior.";
  const second = await execute(repo, (service) =>
    service.correctionService.correct({
      ticket: "",
      spec,
      scope: "delivery",
      checkFailure: checkCommand,
      details: "Address the remaining whole-feature failure.",
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
  expect(secondOutput.assignment.report).toMatch(/final-round-2-fix\.md$/);
  const ledger = JSON.parse(
    readFileSync(join(repo, ".spindle/features", "0001-ticket-flow", "sdd.json"), "utf8"),
  );
  expect(
    ledger.delivery.correctionAttempts.map(({ number }: { number: number }) => number),
  ).toEqual([1, 2]);
  expect(ledger.delivery.correctionAttempts[0].progressAssessment.details).toBe(secondAssessment);
  expect(ledger.delivery.adjudication.status).toBe("resolved");
  expect(ledger.delivery.adjudication.resolution.details).toBe(assessment);
});
