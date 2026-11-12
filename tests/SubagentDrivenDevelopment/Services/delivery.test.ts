import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import {
  cliOutput,
  commitTicketWorkspace,
  execute,
  commitAll,
  invokeAsync,
  integrateReviewedTicket,
  beginDeliveryFinalization,
  completeDeliveryFinalization,
  declareFinalDeliveryChecks,
  finalizeDelivery,
  recordFinalDeliveryCheck,
  recordDeliveryCheck,
  recordReviewCheck,
  prepareIntegratedTicket,
  prepareReviewedTicket,
  prepareDeliveryReady,
} from "../helpers/helpers";
test("delivery review requires an exclusive delivery scope and assigns all required reviewers", async () => {
  const { repo, spec } = await prepareIntegratedTicket();
  await recordDeliveryCheck(repo, spec);

  const required = await execute(repo, (service) =>
    service.reviewService.reviewRequire({
      spec,
      scope: "delivery",
      type: "sdd-code-reviewer",
      details: "Review compatibility across the integrated ticket boundaries.",
      author: "controller",
    }),
  );
  expect(required.status, required.stderr).toBe(0);

  const conflictingScope = await execute(repo, (service) =>
    service.reviewService.review({
      spec,
      ticket: "T-0001",
      scope: "delivery",
      inventory: JSON.stringify(["feature.ts"]),
      author: "controller",
    }),
  );
  expect(conflictingScope.status).not.toBe(0);
  expect(conflictingScope.stderr).toMatch(/mutually exclusive|exactly one.*scope/i);

  const dispatched = await execute(repo, (service) =>
    service.reviewService.review({
      spec,
      scope: "delivery",
      inventory: JSON.stringify(["feature.ts"]),
      author: "controller",
    }),
  );
  expect(dispatched.status, dispatched.stderr).toBe(0);
  const output = JSON.parse(dispatched.stdout) as {
    scope: string;
    assignments: {
      id: string;
      agent: string;
      role: string;
      scope: string;
      snapshot: string;
      report: string;
      status: string;
    }[];
  };
  expect(output.scope).toBe("delivery");
  expect(
    output.assignments.map(({ agent, role, scope, status }) => ({
      agent,
      role,
      scope,
      status,
    })),
  ).toEqual([
    { agent: "sdd-reviewer", role: "review", scope: "delivery", status: "pending" },
    { agent: "sdd-code-reviewer", role: "review", scope: "delivery", status: "pending" },
  ]);
  expect(new Set(output.assignments.map(({ id }) => id)).size).toBe(2);
  expect(new Set(output.assignments.map(({ report }) => report)).size).toBe(2);
  expect(output.assignments.every(({ snapshot }) => /^[0-9a-f]{64}$/.test(snapshot))).toBeTruthy();

  const ledger = JSON.parse(
    readFileSync(join(repo, ".scratch", "0001-ticket-flow", "sdd.json"), "utf8"),
  );
  expect(ledger.delivery.reviewAssignments.length).toBe(2);
  expect(
    ledger.tickets[0].reviewAssignments.every(
      (assignment: { scope: string }) => assignment.scope !== "delivery",
    ),
  ).toBeTruthy();
});

test("delivery review requires passing post-merge evidence for each ticket's current merge", async () => {
  const { repo, spec } = await prepareIntegratedTicket();
  const ledgerPath = join(repo, ".scratch", "0001-ticket-flow", "sdd.json");
  const validLedger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  const validIntegration = JSON.parse(JSON.stringify(validLedger.tickets[0].integration));
  expect(validIntegration.postMerge.status).toBe("passed");
  expect(validIntegration.postMerge.mergeSha).toBe(validIntegration.mergeSha);
  const review = () =>
    execute(repo, (service) =>
      service.reviewService.review({
        spec,
        scope: "delivery",
        inventory: JSON.stringify(["feature.ts"]),
        author: "controller",
      }),
    );
  const saveLedger = (ledger: unknown) =>
    writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);

  delete validLedger.tickets[0].integration.postMerge;
  saveLedger(validLedger);
  const missingEvidence = await review();
  expect(missingEvidence.status).not.toBe(0);
  expect(missingEvidence.stderr).toMatch(/passing ticket post-merge validation: T-0001/i);

  validLedger.tickets[0].integration.postMerge = {
    ...validIntegration.postMerge,
    status: "pending",
  };
  saveLedger(validLedger);
  const pendingEvidence = await review();
  expect(pendingEvidence.status).not.toBe(0);
  expect(pendingEvidence.stderr).toMatch(/passing ticket post-merge validation: T-0001/i);

  validLedger.tickets[0].integration = validIntegration;
  saveLedger(validLedger);
  await recordDeliveryCheck(repo, spec);
  const acceptedEvidence = await review();
  expect(acceptedEvidence.status, acceptedEvidence.stderr).toBe(0);
});

test("blocking delivery findings reopen their related ticket after all required reviews submit", async () => {
  const { repo, spec } = await prepareIntegratedTicket();
  await recordDeliveryCheck(repo, spec);

  const requested = await execute(repo, (service) =>
    service.reviewService.reviewRequire({
      spec,
      scope: "delivery",
      agent: "sdd-code-reviewer",
      details: "Check cross-ticket compatibility.",
      author: "controller",
    }),
  );
  expect(requested.status, requested.stderr).toBe(0);
  const reviewed = await execute(repo, (service) =>
    service.reviewService.review({
      spec,
      scope: "delivery",
      inventory: JSON.stringify(["feature.ts"]),
      author: "controller",
    }),
  );
  expect(reviewed.status, reviewed.stderr).toBe(0);
  const assignments = JSON.parse(reviewed.stdout).assignments as {
    id: string;
    agent: string;
    snapshot: string;
    report: string;
  }[];
  const comprehensive = assignments.find(({ agent }) => agent === "sdd-reviewer")!;
  const specialist = assignments.find(({ agent }) => agent === "sdd-code-reviewer")!;
  writeFileSync(comprehensive.report, "# Aggregate review\n\nCross-ticket note.\n");
  writeFileSync(specialist.report, "# Specialist review\n\nNo additional findings.\n");

  const registered = await execute(repo, (service) =>
    service.findingService.findingCreate({
      ticket: "",
      spec,
      scope: "delivery",
      relatedTicket: "T-0001",
      source: comprehensive.report,
      snapshot: comprehensive.snapshot,
      severity: "medium",
      blocking: true,
      summary: "Cross-ticket behavior needs documentation",
      details: "The integrated tickets use inconsistent names for the same behavior.",
      author: "controller",
    }),
  );
  expect(registered.status, registered.stderr).toBe(0);
  const finding = JSON.parse(registered.stdout).finding as {
    id: string;
    provenance: { report: string; snapshot: string }[];
  };
  expect(finding.id).toBe("F-0001");
  expect(finding.provenance.map(({ report, snapshot }) => ({ report, snapshot }))).toEqual([
    { report: comprehensive.report, snapshot: comprehensive.snapshot },
  ]);

  const submitted = await execute(repo, (service) =>
    service.submissionService.submit({
      ticket: "",
      spec,
      scope: "delivery",
      role: "review",
      assignment: comprehensive.id,
      report: comprehensive.report,
      result: "passed",
      findingIds: ["F-0001"],
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);
  const repeated = await execute(repo, (service) =>
    service.submissionService.submit({
      ticket: "",
      spec,
      scope: "delivery",
      role: "review",
      assignment: comprehensive.id,
      report: comprehensive.report,
      result: "passed",
      findingIds: ["F-0001"],
      author: "controller",
    }),
  );
  expect(repeated.status, repeated.stderr).toBe(0);
  expect(JSON.parse(repeated.stdout).idempotent).toBe(true);

  const specialistSubmission = await execute(repo, (service) =>
    service.submissionService.submit({
      ticket: "",
      spec,
      scope: "delivery",
      role: "review",
      assignment: specialist.id,
      report: specialist.report,
      result: "passed",
      noFindings: true,
      author: "controller",
    }),
  );
  expect(specialistSubmission.status, specialistSubmission.stderr).toBe(0);
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
  expect(JSON.parse(confirmed.stdout).finding.status).toBe("confirmed");
  const ledger = JSON.parse(
    readFileSync(join(repo, ".scratch", "0001-ticket-flow", "sdd.json"), "utf8"),
  );
  expect(ledger.delivery.findings.map((item: { id: string }) => item.id)).toEqual(["F-0001"]);
  expect(ledger.delivery.findings[0].relatedTicket).toBe("T-0001");
  expect(ledger.tickets[0].status).toBe("open");
  expect(ledger.tickets[0].findings).toBe(undefined);
  expect(ledger.delivery.findings[0].history.at(-1).action).toBe("status:confirmed");
  expect(ledger.delivery.reviewAssignments.map((item: { status: string }) => item.status)).toEqual([
    "submitted",
    "submitted",
  ]);
});

test("delivery checks use their own current snapshot and stale aggregate checks block review", async () => {
  const { repo, spec } = await prepareIntegratedTicket();

  const command = "just test::test tests/whole-feature.test.ts";
  const required = await execute(repo, (service) =>
    service.checksService.checksRequire({
      ticket: "",
      spec,
      scope: "delivery",
      command,
      author: "controller",
    }),
  );
  expect(required.status, required.stderr).toBe(0);
  const requiredIdentity = JSON.parse(required.stdout) as { snapshot: string };
  expect(requiredIdentity.snapshot).toMatch(/^[0-9a-f]{64}$/);

  const recorded = await execute(repo, (service) =>
    service.checksService.checksRecord({
      ticket: "",
      spec,
      scope: "delivery",
      snapshot: requiredIdentity.snapshot,
      command,
      result: "passed",
      author: "controller",
    }),
  );
  expect(recorded.status, recorded.stderr).toBe(0);
  expect(JSON.parse(recorded.stdout).record.result).toBe("passed");

  writeFileSync(
    join(repo, "feature.ts"),
    "export const feature = 'changed after aggregate check';\n",
  );
  const staleRecord = await execute(repo, (service) =>
    service.checksService.checksRecord({
      ticket: "",
      spec,
      scope: "delivery",
      snapshot: requiredIdentity.snapshot,
      command,
      result: "passed",
      author: "controller",
    }),
  );
  expect(staleRecord.status).not.toBe(0);
  expect(staleRecord.stderr).toMatch(/snapshot is stale/i);

  const staleReview = await execute(repo, (service) =>
    service.reviewService.review({
      spec,
      scope: "delivery",
      inventory: JSON.stringify(["feature.ts"]),
      author: "controller",
    }),
  );
  expect(staleReview.status).not.toBe(0);
  expect(staleReview.stderr).toMatch(/delivery check .*stale/i);
  const ledger = JSON.parse(
    readFileSync(join(repo, ".scratch", "0001-ticket-flow", "sdd.json"), "utf8"),
  );
  expect(ledger.delivery.checks.records.length).toBe(1);
  expect(ledger.delivery.reviewAssignments).toBe(undefined);
});

test("delivery correction attempts resume independently with the same assignment and finding history", async () => {
  const { repo, spec } = await prepareIntegratedTicket();
  await recordDeliveryCheck(repo, spec);

  const dispatched = await execute(repo, (service) =>
    service.reviewService.review({
      spec,
      scope: "delivery",
      inventory: JSON.stringify(["feature.ts"]),
      author: "controller",
    }),
  );
  expect(dispatched.status, dispatched.stderr).toBe(0);
  const assignment = JSON.parse(dispatched.stdout).assignments[0] as {
    id: string;
    snapshot: string;
    report: string;
  };
  writeFileSync(assignment.report, "# Aggregate review\n\nA whole-feature blocker.\n");
  const created = await execute(repo, (service) =>
    service.findingService.findingCreate({
      ticket: "",
      spec,
      scope: "delivery",
      source: assignment.report,
      snapshot: assignment.snapshot,
      severity: "high",
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
      role: "review",
      assignment: assignment.id,
      report: assignment.report,
      result: "failed",
      findingIds: ["F-0001"],
      details: "The aggregate finding must be corrected.",
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);
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
  writeFileSync(
    join(repo, "feature.ts"),
    "export const feature = 'corrected whole-spec behavior';\n",
  );
  writeFileSync(output.assignment.report, "# Delivery correction\n\nProgress recorded.\n");
  const implementation = await execute(repo, (service) =>
    service.submissionService.submit({
      ticket: "",
      spec,
      scope: "delivery",
      role: "implementation",
      report: output.assignment.report,
      author: "controller",
    }),
  );
  expect(implementation.status, implementation.stderr).toBe(0);
  await recordDeliveryCheck(repo, spec);
  const correctiveReview = await execute(repo, (service) =>
    service.reviewService.review({
      spec,
      scope: "delivery",
      inventory: JSON.stringify(["feature.ts"]),
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
      role: "review",
      assignment: correctiveAssignment.id,
      report: correctiveAssignment.report,
      result: "passed",
      noFindings: true,
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
    readFileSync(join(repo, ".scratch", "0001-ticket-flow", "sdd.json"), "utf8"),
  );
  expect(ledger.delivery.correctionAttempts.length).toBe(2);
  expect(ledger.delivery.correctionAttempts[0].progressAssessment.result).toBe("productive");
  expect(ledger.delivery.adjudication.status).toBe("resolved");
  expect(ledger.tickets[0].correctionAttempts).toBe(undefined);
});

test("delivery requirements rulings authorize only a freshly reviewed deferral", async () => {
  const { repo, spec } = await prepareIntegratedTicket();
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
  const firstSnapshot = JSON.parse(requiredBeforeReview.stdout).snapshot as string;
  const recordedBeforeReview = await execute(repo, (service) =>
    service.checksService.checksRecord({
      ticket: "",
      spec,
      scope: "delivery",
      snapshot: firstSnapshot,
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
      inventory: JSON.stringify(["feature.ts"]),
      author: "controller",
    }),
  );
  expect(firstReview.status, firstReview.stderr).toBe(0);
  const initialAssignment = JSON.parse(firstReview.stdout).assignments[0] as {
    id: string;
    snapshot: string;
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
      source: initialAssignment.report,
      snapshot: initialAssignment.snapshot,
      severity: "high",
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
      role: "review",
      assignment: initialAssignment.id,
      report: initialAssignment.report,
      result: "passed",
      findingIds: [findingId],
      author: "controller",
    }),
  );
  expect(initialSubmission.status, initialSubmission.stderr).toBe(0);
  writeFileSync(
    spec,
    `${readFileSync(spec, "utf8")}\n## Approved delivery change\n\nThe affected behavior is out of scope.\n`,
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
  const currentSnapshot = JSON.parse(required.stdout).snapshot as string;
  const recorded = await execute(repo, (service) =>
    service.checksService.checksRecord({
      ticket: "",
      spec,
      scope: "delivery",
      snapshot: currentSnapshot,
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
      inventory: JSON.stringify(["feature.ts"]),
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
      role: "review",
      assignment: assignment.id,
      report: assignment.report,
      result: "passed",
      noFindings: true,
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);

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

test("finish gates integrated delivery on current aggregate evidence and stored retrospective policy", async () => {
  const optional = await prepareDeliveryReady();
  const optionalFinalization = await finalizeDelivery(optional);
  expect(optionalFinalization.completed).toMatchObject({ finished: true, cleanup: "complete" });
  expect(optionalFinalization.completed).not.toHaveProperty("retrospective");
  const optionalLedger = JSON.parse(
    readFileSync(join(optional.originalRepo, ".scratch", "0001-ticket-flow", "sdd.json"), "utf8"),
  );
  expect(optionalLedger.retrospectiveRequired).toBe(false);
  const repeatedOptional = await invokeAsync(optional.originalRepo, [
    "finish",
    "--spec",
    optionalFinalization.pending.originalSpec,
    "--author",
    "controller",
  ]);
  expect(repeatedOptional.status, repeatedOptional.stderr).toBe(0);
  expect(cliOutput(repeatedOptional)).toMatchObject({
    finished: true,
    cleanup: "complete",
  });

  const optionalWithReport = await prepareDeliveryReady();
  const optionalReport = join(
    optionalWithReport.repo,
    ".scratch",
    "0001-ticket-flow",
    "reports",
    "optional-retrospective.md",
  );
  writeFileSync(optionalReport, "# Optional retrospective\n\nAttached at finish.\n");
  const attachedOptional = await finalizeDelivery(optionalWithReport, { report: optionalReport });
  expect(attachedOptional.completed.retrospective).toMatchObject({
    report: join(
      optionalWithReport.originalRepo,
      ".scratch",
      "0001-ticket-flow",
      "reports",
      "optional-retrospective.md",
    ),
  });

  const required = await prepareDeliveryReady(true);
  const missingRetrospective = await execute(required.repo, (service) =>
    service.deliveryService.finish({
      spec: required.spec,
      author: "controller",
      confirmRecords: true,
    }),
  );
  expect(missingRetrospective.status).not.toBe(0);
  expect(missingRetrospective.stderr).toMatch(/retrospective report is required/i);

  const outsideReport = join(required.repo, "tracked.txt");
  const unsafeReport = await execute(required.repo, (service) =>
    service.deliveryService.finish({
      spec: required.spec,
      report: outsideReport,
      author: "controller",
      confirmRecords: true,
    }),
  );
  expect(unsafeReport.status).not.toBe(0);
  expect(unsafeReport.stderr).toMatch(/inside feature reports/i);

  const report = join(required.repo, ".scratch", "0001-ticket-flow", "reports", "retrospective.md");
  writeFileSync(report, "# Retrospective\n\nEvidence and outcomes are summarized here.\n");
  const requiredFinalization = await finalizeDelivery(required, { report });
  expect(requiredFinalization.completed).toMatchObject({ finished: true, cleanup: "complete" });
  expect(requiredFinalization.completed.retrospective).toMatchObject({
    report: join(
      required.originalRepo,
      ".scratch",
      "0001-ticket-flow",
      "reports",
      "retrospective.md",
    ),
  });
  expect(
    (requiredFinalization.completed.retrospective as { reportSha256: string }).reportSha256,
  ).toMatch(/^[0-9a-f]{64}$/);

  const ledger = JSON.parse(
    readFileSync(join(required.originalRepo, ".scratch", "0001-ticket-flow", "sdd.json"), "utf8"),
  );
  expect(ledger.retrospectiveRequired).toBe(true);
  expect(ledger.tickets[0].worktree).toBe(undefined);
});

test("aggregate review covers every closed ticket and stale requirements block finish", async () => {
  const first = await prepareReviewedTicket({ ticketCount: 2 });
  await integrateReviewedTicket(first, true);

  const secondId = "T-0002";
  const secondFile = "feature-two.ts";
  const command = "just test::test tests/feature.test.ts";
  const required = await execute(first.repo, (service) =>
    service.checksService.checksRequire({
      spec: first.spec,
      ticket: secondId,
      command,
      author: "controller",
    }),
  );
  expect(required.status, required.stderr).toBe(0);
  commitAll(first.repo, first.git, "declare second ticket check");
  const dispatched = await execute(first.repo, (service) =>
    service.assignmentService.implement({
      spec: first.spec,
      ticket: secondId,
      author: "controller",
      workspace: first.worktreeParent,
    }),
  );
  expect(dispatched.status, dispatched.stderr).toBe(0);
  const implementation = await execute(first.repo, (service) =>
    service.assignmentService.implement({
      spec: first.spec,
      ticket: secondId,
      author: "controller",
      workspace: first.worktreeParent,
    }),
  );
  expect(implementation.status, implementation.stderr).toBe(0);
  const implementationAssignment = JSON.parse(implementation.stdout).assignment as {
    report: string;
    workspace: string;
  };
  writeFileSync(
    join(implementationAssignment.workspace, secondFile),
    "export const secondFeature = true;\n",
  );
  commitTicketWorkspace(implementationAssignment.workspace, "implement second ticket");
  writeFileSync(implementationAssignment.report, "# Implementation\n\nSecond ticket complete.\n");
  const submittedImplementation = await execute(first.repo, (service) =>
    service.submissionService.submit({
      spec: first.spec,
      ticket: secondId,
      role: "implementation",
      report: implementationAssignment.report,
      author: "controller",
    }),
  );
  expect(submittedImplementation.status, submittedImplementation.stderr).toBe(0);
  const secondSnapshot = JSON.parse(submittedImplementation.stdout).snapshot as string;
  const check = await recordReviewCheck(
    first.repo,
    first.spec,
    command,
    secondSnapshot,
    "passed",
    secondId,
  );
  expect(check.status, check.stderr).toBe(0);
  const review = await execute(first.repo, (service) =>
    service.reviewService.review({
      spec: first.spec,
      ticket: secondId,
      inventory: JSON.stringify([secondFile]),
      author: "controller",
    }),
  );
  expect(review.status, review.stderr).toBe(0);
  const ticketAssignment = JSON.parse(review.stdout).assignments[0] as {
    id: string;
    report: string;
  };
  writeFileSync(ticketAssignment.report, "# Ticket review\n\nNo findings.\n");
  const submittedReview = await execute(first.repo, (service) =>
    service.submissionService.submit({
      spec: first.spec,
      ticket: secondId,
      role: "review",
      assignment: ticketAssignment.id,
      report: ticketAssignment.report,
      result: "passed",
      noFindings: true,
      author: "controller",
    }),
  );
  expect(submittedReview.status, submittedReview.stderr).toBe(0);
  await integrateReviewedTicket(
    { ...first, ticketId: secondId, ticketWorkspace: implementationAssignment.workspace },
    true,
  );

  const deliveryCommand = "just test::test tests/whole-feature.test.ts";
  const deliveryCheck = await execute(first.repo, (service) =>
    service.checksService.checksRequire({
      ticket: "",
      spec: first.spec,
      scope: "delivery",
      command: deliveryCommand,
      author: "controller",
    }),
  );
  expect(deliveryCheck.status, deliveryCheck.stderr).toBe(0);
  const deliverySnapshot = JSON.parse(deliveryCheck.stdout).snapshot as string;
  const recordedDeliveryCheck = await execute(first.repo, (service) =>
    service.checksService.checksRecord({
      ticket: "",
      spec: first.spec,
      scope: "delivery",
      snapshot: deliverySnapshot,
      command: deliveryCommand,
      result: "passed",
      author: "controller",
    }),
  );
  expect(recordedDeliveryCheck.status, recordedDeliveryCheck.stderr).toBe(0);
  const aggregate = await execute(first.repo, (service) =>
    service.reviewService.review({
      spec: first.spec,
      scope: "delivery",
      inventory: JSON.stringify(["feature-two.ts", "feature.ts"]),
      author: "controller",
    }),
  );
  expect(aggregate.status, aggregate.stderr).toBe(0);
  const aggregateAssignment = JSON.parse(aggregate.stdout).assignments[0] as {
    id: string;
    report: string;
    inventory: string[];
  };
  expect(aggregateAssignment.inventory).toEqual(["feature-two.ts", "feature.ts"]);
  writeFileSync(aggregateAssignment.report, "# Whole feature review\n\nNo findings.\n");
  const aggregateSubmission = await execute(first.repo, (service) =>
    service.submissionService.submit({
      ticket: "",
      spec: first.spec,
      scope: "delivery",
      role: "review",
      assignment: aggregateAssignment.id,
      report: aggregateAssignment.report,
      result: "passed",
      noFindings: true,
      author: "controller",
    }),
  );
  expect(aggregateSubmission.status, aggregateSubmission.stderr).toBe(0);

  const secondTicketPath = join(
    first.repo,
    ".scratch",
    "0001-ticket-flow",
    "tickets",
    `${secondId}.md`,
  );
  const originalTicket = readFileSync(secondTicketPath, "utf8");
  writeFileSync(
    secondTicketPath,
    originalTicket.replace(
      "## Acceptance Criteria\n\n",
      "## Acceptance Criteria\n\nA whole-feature requirement added after aggregate review.\n\n",
    ),
  );
  const staleFinish = await execute(first.repo, (service) =>
    service.deliveryService.finish({
      spec: first.spec,
      author: "controller",
      confirmRecords: true,
    }),
  );
  expect(staleFinish.status).not.toBe(0);
  expect(staleFinish.stderr).toMatch(
    /final delivery checks are not current and passing|aggregate required reviews are not current and passing/i,
  );
  writeFileSync(secondTicketPath, originalTicket);
  const finished = await finalizeDelivery(first);
  expect(finished.completed).toMatchObject({ finished: true, cleanup: "complete" });
});

test("status and next expose delivery assignments, blockers, and finish action without mutation", async () => {
  const { repo, git, spec } = await prepareDeliveryReady();
  const ledgerPath = join(repo, ".scratch", "0001-ticket-flow", "sdd.json");
  const ledgerBefore = readFileSync(ledgerPath, "utf8");
  const gitStatusBefore = git("status", "--porcelain");
  const status = await execute(repo, (service) =>
    service.featureInspectionService.status({ spec }),
  );
  const next = await execute(repo, (service) => service.deliveryService.next({ spec }));
  expect(status.status, status.stderr).toBe(0);
  expect(next.status, next.stderr).toBe(0);
  const statusDelivery = JSON.parse(status.stdout).delivery as {
    scope: string;
    execution: string;
    action: string;
    snapshot: string;
    retrospectiveRequired: boolean;
    finished: boolean;
    findings: unknown[];
    reviewAssignments: { agent: string; status: string; report: string }[];
    blockers: string[];
  };
  const nextDelivery = JSON.parse(next.stdout).delivery as typeof statusDelivery;
  expect(statusDelivery.scope).toBe("delivery");
  expect(statusDelivery.execution).toBe("reviewing");
  expect(statusDelivery.action).toBe("finish");
  expect(statusDelivery.snapshot).toMatch(/^[0-9a-f]{64}$/);
  expect(statusDelivery.retrospectiveRequired).toBe(false);
  expect(statusDelivery.finished).toBe(false);
  expect(statusDelivery.findings).toEqual([]);
  expect(statusDelivery.reviewAssignments.map(({ agent, status }) => ({ agent, status }))).toEqual([
    { agent: "sdd-reviewer", status: "submitted" },
  ]);
  expect(statusDelivery.blockers).toEqual([]);
  expect(nextDelivery).toEqual(statusDelivery);
  expect(readFileSync(ledgerPath, "utf8")).toBe(ledgerBefore);
  expect(git("status", "--porcelain")).toBe(gitStatusBefore);
});

test("failed final-merge checks preserve worktrees until passing evidence is recorded", async () => {
  const prepared = await prepareDeliveryReady();
  const pending = await beginDeliveryFinalization(prepared);
  const command = "fixture final check";
  await declareFinalDeliveryChecks(pending, [command]);

  const failed = await recordFinalDeliveryCheck(
    pending,
    command,
    "failed",
    "The final-merge fixture check failed.",
  );
  expect(failed.status, failed.stderr).toBe(0);
  const paused = await completeDeliveryFinalization(pending);
  expect(paused.status, paused.stderr).toBe(0);
  expect(cliOutput(paused)).toMatchObject({
    finalValidation: "pending",
    cleanup: "retained",
    records: [{ command, result: "failed" }],
  });
  expect(existsSync(prepared.repo)).toBe(true);

  const passed = await recordFinalDeliveryCheck(pending, command);
  expect(passed.status, passed.stderr).toBe(0);
  const completed = await completeDeliveryFinalization(pending);
  expect(completed.status, completed.stderr).toBe(0);
  expect(cliOutput(completed)).toMatchObject({
    finished: true,
    cleanup: "complete",
  });
  expect(
    JSON.parse(readFileSync(pending.journal, "utf8")).records.map(
      (item: { result: string }) => item.result,
    ),
  ).toEqual(["failed", "passed"]);
});

test("final-merge check requirements are frozen after their initial declaration", async () => {
  const prepared = await prepareDeliveryReady();
  const pending = await beginDeliveryFinalization(prepared);
  const command = "fixture final check";
  await declareFinalDeliveryChecks(pending, [command]);
  const journalBefore = readFileSync(pending.journal, "utf8");

  const changedList = await invokeAsync(pending.originalWorkspace, [
    "checks",
    "require",
    "--spec",
    pending.originalSpec,
    "--scope",
    "final",
    "--command",
    command,
    "--command",
    "late unreviewed check",
    "--author",
    "controller",
  ]);
  expect(changedList.status).not.toBe(0);
  expect(changedList.stderr).toMatch(/final declared check list is frozen/i);
  expect(readFileSync(pending.journal, "utf8")).toBe(journalBefore);

  const recorded = await recordFinalDeliveryCheck(pending, command);
  expect(recorded.status, recorded.stderr).toBe(0);
  const completed = await completeDeliveryFinalization(pending);
  expect(completed.status, completed.stderr).toBe(0);
  expect(cliOutput(completed)).toMatchObject({ finished: true, cleanup: "complete" });
});

test("finalization cleanup remains bound to its recorded controller", async () => {
  const prepared = await prepareDeliveryReady();
  const finalization = await finalizeDelivery(prepared);
  const journalBefore = readFileSync(finalization.pending.journal, "utf8");

  const replacementFinish = await invokeAsync(finalization.pending.originalWorkspace, [
    "finish",
    "--spec",
    finalization.pending.originalSpec,
    "--author",
    "replacement",
  ]);
  expect(replacementFinish.status).not.toBe(0);
  expect(replacementFinish.stderr).toMatch(/only the recorded controller/i);
  expect(readFileSync(finalization.pending.journal, "utf8")).toBe(journalBefore);

  const repeated = await completeDeliveryFinalization(finalization.pending);
  expect(repeated.status, repeated.stderr).toBe(0);
  expect(cliOutput(repeated)).toMatchObject({ finished: true, cleanup: "complete" });
});

test("finalization status and next expose pending checks and completed cleanup", async () => {
  const prepared = await prepareDeliveryReady();
  const report = join(prepared.repo, ".scratch", "0001-ticket-flow", "reports", "retrospective.md");
  writeFileSync(report, "# Retrospective\n\nCompletion evidence.\n");
  const pending = await beginDeliveryFinalization(prepared, { report });
  const statusPending = await invokeAsync(pending.originalWorkspace, [
    "status",
    "--spec",
    pending.originalSpec,
  ]);
  const nextPending = await invokeAsync(pending.originalWorkspace, [
    "next",
    "--spec",
    pending.originalSpec,
  ]);
  expect(statusPending.status, statusPending.stderr).toBe(0);
  expect(nextPending.status, nextPending.stderr).toBe(0);
  expect(cliOutput(statusPending)).toMatchObject({
    finalValidation: "pending",
    cleanup: "retained",
  });
  expect(cliOutput(nextPending)).toEqual(cliOutput(statusPending));

  const command = "fixture final check";
  await declareFinalDeliveryChecks(pending, [command]);
  const recorded = await recordFinalDeliveryCheck(pending, command);
  expect(recorded.status, recorded.stderr).toBe(0);
  const completed = await completeDeliveryFinalization(pending);
  expect(completed.status, completed.stderr).toBe(0);
  expect(cliOutput(completed)).toMatchObject({
    finished: true,
    cleanup: "complete",
  });
  expect(existsSync(prepared.repo)).toBe(false);

  const statusComplete = await invokeAsync(pending.originalWorkspace, [
    "status",
    "--spec",
    pending.originalSpec,
  ]);
  const nextComplete = await invokeAsync(pending.originalWorkspace, [
    "next",
    "--spec",
    pending.originalSpec,
  ]);
  expect(statusComplete.status, statusComplete.stderr).toBe(0);
  expect(nextComplete.status, nextComplete.stderr).toBe(0);
  expect(cliOutput(statusComplete)).toMatchObject({
    finished: true,
    cleanup: "complete",
  });
  expect(cliOutput(nextComplete)).toEqual(cliOutput(statusComplete));

  const journalBeforeLateRecord = readFileSync(pending.journal, "utf8");
  const lateRecord = await recordFinalDeliveryCheck(
    pending,
    command,
    "failed",
    "A post-completion result is not part of final validation.",
  );
  expect(lateRecord.status).not.toBe(0);
  expect(lateRecord.stderr).toMatch(/only accepted during final validation/i);
  expect(readFileSync(pending.journal, "utf8")).toBe(journalBeforeLateRecord);
});
