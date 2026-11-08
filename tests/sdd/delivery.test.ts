import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

import { expect, test } from "vitest";

import {
  execute,
  commitAll,
  recordReviewCheck,
  prepareAcceptedIssue,
  prepareDeliveryReady,
} from "./helpers.ts";
test("delivery review requires an exclusive delivery scope and assigns all required reviewers", () => {
  const { repo, git, spec } = prepareAcceptedIssue();
  git("add", "feature.ts");
  git("commit", "-qm", "deliver accepted issue");
  const commitSha = git("rev-parse", "HEAD");
  const integrated = execute(repo, (service) =>
    service.integrate({ spec, issue: "I-0001", commit: commitSha, author: "controller" }),
  );
  expect(integrated.status, integrated.stderr).toBe(0);

  const required = execute(repo, (service) =>
    service.reviewRequire({
      spec,
      scope: "delivery",
      agent: "sdd-code-reviewer",
      details: "Review compatibility across the integrated issue boundaries.",
      author: "controller",
    }),
  );
  expect(required.status, required.stderr).toBe(0);

  const conflictingScope = execute(repo, (service) =>
    service.review({
      spec,
      issue: "I-0001",
      scope: "delivery",
      inventory: JSON.stringify(["feature.ts"]),
      author: "controller",
    }),
  );
  expect(conflictingScope.status).not.toBe(0);
  expect(conflictingScope.stderr).toMatch(/mutually exclusive|exactly one.*scope/i);

  const dispatched = execute(repo, (service) =>
    service.review({
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
    readFileSync(join(repo, ".scratch", "0001-claim-flow", "sdd.json"), "utf8"),
  );
  expect(ledger.delivery.reviewAssignments.length).toBe(2);
  expect(
    ledger.issues[0].reviewAssignments.every(
      (assignment: { scope: string }) => assignment.scope !== "delivery",
    ),
  ).toBeTruthy();
});

test("delivery findings retain aggregate provenance and every required review submits idempotently", () => {
  const { repo, git, spec } = prepareAcceptedIssue();
  git("add", "feature.ts");
  git("commit", "-qm", "deliver accepted issue");
  const integrated = execute(repo, (service) =>
    service.integrate({
      spec,
      issue: "I-0001",
      commit: git("rev-parse", "HEAD"),
      author: "controller",
    }),
  );
  expect(integrated.status, integrated.stderr).toBe(0);

  const requested = execute(repo, (service) =>
    service.reviewRequire({
      spec,
      scope: "delivery",
      agent: "sdd-code-reviewer",
      details: "Check cross-issue compatibility.",
      author: "controller",
    }),
  );
  expect(requested.status, requested.stderr).toBe(0);
  const reviewed = execute(repo, (service) =>
    service.review({
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
  writeFileSync(comprehensive.report, "# Aggregate review\n\nCross-issue note.\n");
  writeFileSync(specialist.report, "# Specialist review\n\nNo additional findings.\n");

  const registered = execute(repo, (service) =>
    service.findingCreate({
      issue: "",
      spec,
      scope: "delivery",
      source: comprehensive.report,
      snapshot: comprehensive.snapshot,
      severity: "medium",
      nonBlocking: true,
      summary: "Cross-issue behavior needs documentation",
      details: "The integrated issues use inconsistent names for the same behavior.",
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

  const submitted = execute(repo, (service) =>
    service.submit({
      issue: "",
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
  const repeated = execute(repo, (service) =>
    service.submit({
      issue: "",
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

  const specialistSubmission = execute(repo, (service) =>
    service.submit({
      issue: "",
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
  const confirmed = execute(repo, (service) =>
    service.findingUpdate({
      issue: "",
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
    readFileSync(join(repo, ".scratch", "0001-claim-flow", "sdd.json"), "utf8"),
  );
  expect(ledger.delivery.findings.map((item: { id: string }) => item.id)).toEqual(["F-0001"]);
  expect(ledger.issues[0].findings).toBe(undefined);
  expect(ledger.delivery.findings[0].history.at(-1).action).toBe("status:confirmed");
  expect(ledger.delivery.reviewAssignments.map((item: { status: string }) => item.status)).toEqual([
    "submitted",
    "submitted",
  ]);
});

test("delivery checks use their own current snapshot and stale aggregate checks block review", () => {
  const { repo, git, spec } = prepareAcceptedIssue();
  git("add", "feature.ts");
  git("commit", "-qm", "deliver accepted issue");
  const integrated = execute(repo, (service) =>
    service.integrate({
      spec,
      issue: "I-0001",
      commit: git("rev-parse", "HEAD"),
      author: "controller",
    }),
  );
  expect(integrated.status, integrated.stderr).toBe(0);

  const command = "just test::test tests/whole-feature.test.ts";
  const required = execute(repo, (service) =>
    service.checksRequire({ issue: "", spec, scope: "delivery", command, author: "controller" }),
  );
  expect(required.status, required.stderr).toBe(0);
  const requiredIdentity = JSON.parse(required.stdout) as { snapshot: string };
  expect(requiredIdentity.snapshot).toMatch(/^[0-9a-f]{64}$/);

  const recorded = execute(repo, (service) =>
    service.checksRecord({
      issue: "",
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
  const staleRecord = execute(repo, (service) =>
    service.checksRecord({
      issue: "",
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

  const staleReview = execute(repo, (service) =>
    service.review({
      spec,
      scope: "delivery",
      inventory: JSON.stringify(["feature.ts"]),
      author: "controller",
    }),
  );
  expect(staleReview.status).not.toBe(0);
  expect(staleReview.stderr).toMatch(/delivery check .*stale/i);
  const ledger = JSON.parse(
    readFileSync(join(repo, ".scratch", "0001-claim-flow", "sdd.json"), "utf8"),
  );
  expect(ledger.delivery.checks.records.length).toBe(1);
  expect(ledger.delivery.reviewAssignments).toBe(undefined);
});

test("delivery correction attempts resume independently with the same assignment and finding history", () => {
  const { repo, git, spec } = prepareAcceptedIssue();
  git("add", "feature.ts");
  git("commit", "-qm", "deliver accepted issue");
  const integrated = execute(repo, (service) =>
    service.integrate({
      spec,
      issue: "I-0001",
      commit: git("rev-parse", "HEAD"),
      author: "controller",
    }),
  );
  expect(integrated.status, integrated.stderr).toBe(0);

  const dispatched = execute(repo, (service) =>
    service.review({
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
  const created = execute(repo, (service) =>
    service.findingCreate({
      issue: "",
      spec,
      scope: "delivery",
      source: assignment.report,
      snapshot: assignment.snapshot,
      severity: "high",
      blocking: true,
      summary: "Integrated behaviors disagree",
      details: "The independently accepted issue implementations conflict at their boundary.",
      author: "controller",
    }),
  );
  expect(created.status, created.stderr).toBe(0);
  const submitted = execute(repo, (service) =>
    service.submit({
      issue: "",
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
  const confirmed = execute(repo, (service) =>
    service.findingUpdate({
      issue: "",
      spec,
      scope: "delivery",
      finding: "F-0001",
      status: "confirmed",
      author: "controller",
    }),
  );
  expect(confirmed.status, confirmed.stderr).toBe(0);

  const correction = execute(repo, (service) =>
    service.correct({
      issue: "",
      spec,
      scope: "delivery",
      findings: ["F-0001"],
      details: "Reconcile the cross-issue behavior without weakening either criterion.",
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

  const resumed = execute(repo, (service) =>
    service.resume({ issue: "", spec, scope: "delivery", author: "controller" }),
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
  const implementation = execute(repo, (service) =>
    service.submit({
      issue: "",
      spec,
      scope: "delivery",
      role: "implementation",
      report: output.assignment.report,
      author: "controller",
    }),
  );
  expect(implementation.status, implementation.stderr).toBe(0);
  const correctiveReview = execute(repo, (service) =>
    service.review({
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
  const correctiveReviewSubmission = execute(repo, (service) =>
    service.submit({
      issue: "",
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

  const paused = execute(repo, (service) =>
    service.correct({
      issue: "",
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
  const adjudicationResume = execute(repo, (service) =>
    service.resume({ issue: "", spec, scope: "delivery", author: "controller" }),
  );
  expect(adjudicationResume.status, adjudicationResume.stderr).toBe(0);
  const adjudicationState = JSON.parse(adjudicationResume.stdout) as {
    nextAction: string;
    adjudication: { status: string; reason: string };
  };
  expect(adjudicationState.nextAction).toBe("adjudicate");
  expect(adjudicationState.adjudication.status).toBe("pending");
  expect(adjudicationState.adjudication.reason).toBe("no-progress");

  const continued = execute(repo, (service) =>
    service.correct({
      issue: "",
      spec,
      scope: "delivery",
      findings: ["F-0001"],
      details: "Continue with an independently reviewed plan.",
      decision: "continue",
      assessment:
        "The revised plan isolates the cross-issue contract and can demonstrate progress.",
      assessmentResult: "productive",
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
  const resumedSecond = execute(repo, (service) =>
    service.resume({ issue: "", spec, scope: "delivery", author: "controller" }),
  );
  expect(resumedSecond.status, resumedSecond.stderr).toBe(0);
  expect(JSON.parse(resumedSecond.stdout).assignment.id).toBe(secondAttempt.assignment.id);
  const ledger = JSON.parse(
    readFileSync(join(repo, ".scratch", "0001-claim-flow", "sdd.json"), "utf8"),
  );
  expect(ledger.delivery.correctionAttempts.length).toBe(2);
  expect(ledger.delivery.correctionAttempts[0].progressAssessment.result).toBe("productive");
  expect(ledger.delivery.adjudication.status).toBe("resolved");
  expect(ledger.issues[0].correctionAttempts).toBe(undefined);
});

test("delivery requirements rulings authorize only a freshly reviewed deferral", () => {
  const { repo, git, spec } = prepareAcceptedIssue();
  git("add", "feature.ts");
  git("commit", "-qm", "deliver accepted issue");
  const integrated = execute(repo, (service) =>
    service.integrate({
      spec,
      issue: "I-0001",
      commit: git("rev-parse", "HEAD"),
      author: "controller",
    }),
  );
  expect(integrated.status, integrated.stderr).toBe(0);
  const checkCommand = "just test::test tests/whole-feature.test.ts";
  const requiredBeforeReview = execute(repo, (service) =>
    service.checksRequire({
      issue: "",
      spec,
      scope: "delivery",
      command: checkCommand,
      author: "controller",
    }),
  );
  expect(requiredBeforeReview.status, requiredBeforeReview.stderr).toBe(0);
  const firstSnapshot = JSON.parse(requiredBeforeReview.stdout).snapshot as string;
  const recordedBeforeReview = execute(repo, (service) =>
    service.checksRecord({
      issue: "",
      spec,
      scope: "delivery",
      snapshot: firstSnapshot,
      command: checkCommand,
      result: "passed",
      author: "controller",
    }),
  );
  expect(recordedBeforeReview.status, recordedBeforeReview.stderr).toBe(0);
  const firstReview = execute(repo, (service) =>
    service.review({
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
  const findingResult = execute(repo, (service) =>
    service.findingCreate({
      issue: "",
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
  const initialSubmission = execute(repo, (service) =>
    service.submit({
      issue: "",
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

  const unapprovedDeferral = execute(repo, (service) =>
    service.findingUpdate({
      issue: "",
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

  const decision = execute(repo, (service) =>
    service.requirementsDecide({
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
  const repeatedDecision = execute(repo, (service) =>
    service.requirementsDecide({
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

  const beforeFreshReview = execute(repo, (service) =>
    service.findingUpdate({
      issue: "",
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

  const required = execute(repo, (service) =>
    service.checksRequire({
      issue: "",
      spec,
      scope: "delivery",
      command: checkCommand,
      author: "controller",
    }),
  );
  expect(required.status, required.stderr).toBe(0);
  const currentSnapshot = JSON.parse(required.stdout).snapshot as string;
  const recorded = execute(repo, (service) =>
    service.checksRecord({
      issue: "",
      spec,
      scope: "delivery",
      snapshot: currentSnapshot,
      command: checkCommand,
      result: "passed",
      author: "controller",
    }),
  );
  expect(recorded.status, recorded.stderr).toBe(0);
  const review = execute(repo, (service) =>
    service.review({
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
  const submitted = execute(repo, (service) =>
    service.submit({
      issue: "",
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

  const deferred = execute(repo, (service) =>
    service.findingUpdate({
      issue: "",
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

test("finish gates integrated delivery on current aggregate evidence and stored retrospective policy", () => {
  const optional = prepareDeliveryReady();
  const optionalFinish = execute(optional.repo, (service) =>
    service.finish({ spec: optional.spec, author: "controller" }),
  );
  expect(optionalFinish.status, optionalFinish.stderr).toBe(0);
  const optionalResult = JSON.parse(optionalFinish.stdout) as {
    finished: boolean;
    idempotent?: boolean;
    retrospectiveRequired: boolean;
    retrospective?: { report?: string };
  };
  expect(optionalResult.finished).toBe(true);
  expect(optionalResult.retrospectiveRequired).toBe(false);
  expect(optionalResult.retrospective).toBe(undefined);
  const repeatedOptional = execute(optional.repo, (service) =>
    service.finish({ spec: optional.spec, author: "controller" }),
  );
  expect(repeatedOptional.status, repeatedOptional.stderr).toBe(0);
  expect(JSON.parse(repeatedOptional.stdout).idempotent).toBe(true);

  const optionalWithReport = prepareDeliveryReady();
  const optionalReport = join(
    optionalWithReport.repo,
    ".scratch",
    "0001-claim-flow",
    "reports",
    "optional-retrospective.md",
  );
  writeFileSync(optionalReport, "# Optional retrospective\n\nAttached at finish.\n");
  const attachedOptional = execute(optionalWithReport.repo, (service) =>
    service.finish({ spec: optionalWithReport.spec, report: optionalReport, author: "controller" }),
  );
  expect(attachedOptional.status, attachedOptional.stderr).toBe(0);
  expect(JSON.parse(attachedOptional.stdout).retrospectiveRequired).toBe(false);
  expect(JSON.parse(attachedOptional.stdout).retrospective.report).toBe(optionalReport);

  const required = prepareDeliveryReady(true);
  const missingRetrospective = execute(required.repo, (service) =>
    service.finish({ spec: required.spec, author: "controller" }),
  );
  expect(missingRetrospective.status).not.toBe(0);
  expect(missingRetrospective.stderr).toMatch(/retrospective report is required/i);

  const outsideReport = join(
    required.repo,
    ".scratch",
    "other-feature",
    "outside-retrospective.md",
  );
  mkdirSync(join(required.repo, ".scratch", "other-feature"), { recursive: true });
  writeFileSync(outsideReport, "Must not be accepted outside reports/.\n");
  const unsafeReport = execute(required.repo, (service) =>
    service.finish({ spec: required.spec, report: outsideReport, author: "controller" }),
  );
  expect(unsafeReport.status).not.toBe(0);
  expect(unsafeReport.stderr).toMatch(/inside feature reports/i);

  const report = join(required.repo, ".scratch", "0001-claim-flow", "reports", "retrospective.md");
  writeFileSync(report, "# Retrospective\n\nEvidence and outcomes are summarized here.\n");
  const requiredFinish = execute(required.repo, (service) =>
    service.finish({ spec: required.spec, report, author: "controller" }),
  );
  expect(requiredFinish.status, requiredFinish.stderr).toBe(0);
  const requiredResult = JSON.parse(requiredFinish.stdout) as {
    finished: boolean;
    retrospectiveRequired: boolean;
    retrospective: { report: string; reportSha256: string };
  };
  expect(requiredResult.finished).toBe(true);
  expect(requiredResult.retrospectiveRequired).toBe(true);
  expect(requiredResult.retrospective.report).toBe(report);
  expect(requiredResult.retrospective.reportSha256).toMatch(/^[0-9a-f]{64}$/);

  const ledger = JSON.parse(
    readFileSync(join(required.repo, ".scratch", "0001-claim-flow", "sdd.json"), "utf8"),
  );
  expect(ledger.retrospectiveRequired).toBe(true);
  expect(ledger.delivery.finished.report).toBe(report);
  expect(ledger.delivery.finished.reportSha256).toBe(requiredResult.retrospective.reportSha256);

  writeFileSync(report, "# Changed after finish\n");
  const alteredReport = execute(required.repo, (service) =>
    service.finish({ spec: required.spec, report, author: "controller" }),
  );
  expect(alteredReport.status).not.toBe(0);
  expect(alteredReport.stderr).toMatch(/already finished with different retrospective evidence/i);
});

test("aggregate review covers every integrated issue and stale requirements block finish", () => {
  const first = prepareAcceptedIssue({ issueCount: 2 });
  first.git("add", first.file);
  first.git("commit", "-qm", "deliver first issue");
  const firstIntegration = execute(first.repo, (service) =>
    service.integrate({
      spec: first.spec,
      issue: first.issueId,
      commit: first.git("rev-parse", "HEAD"),
      author: "controller",
    }),
  );
  expect(firstIntegration.status, firstIntegration.stderr).toBe(0);
  commitAll(first.repo, first.git, "record first issue integration");

  const secondId = "I-0002";
  const secondFile = "feature-two.ts";
  const command = "just test::test tests/feature.test.ts";
  const required = execute(first.repo, (service) =>
    service.checksRequire({ spec: first.spec, issue: secondId, command, author: "controller" }),
  );
  expect(required.status, required.stderr).toBe(0);
  commitAll(first.repo, first.git, "declare second issue check");
  const claimed = execute(first.repo, (service) =>
    service.claim({ spec: first.spec, issue: secondId, author: "controller" }),
  );
  expect(claimed.status, claimed.stderr).toBe(0);
  writeFileSync(join(first.repo, secondFile), "export const secondFeature = true;\n");
  const implementation = execute(first.repo, (service) =>
    service.implement({ spec: first.spec, issue: secondId, author: "controller" }),
  );
  expect(implementation.status, implementation.stderr).toBe(0);
  const implementationAssignment = JSON.parse(implementation.stdout).assignment as {
    report: string;
  };
  writeFileSync(implementationAssignment.report, "# Implementation\n\nSecond issue complete.\n");
  const submittedImplementation = execute(first.repo, (service) =>
    service.submit({
      spec: first.spec,
      issue: secondId,
      role: "implementation",
      report: implementationAssignment.report,
      author: "controller",
    }),
  );
  expect(submittedImplementation.status, submittedImplementation.stderr).toBe(0);
  const secondSnapshot = JSON.parse(submittedImplementation.stdout).snapshot as string;
  const check = recordReviewCheck(
    first.repo,
    first.spec,
    command,
    secondSnapshot,
    "passed",
    secondId,
  );
  expect(check.status, check.stderr).toBe(0);
  const review = execute(first.repo, (service) =>
    service.review({
      spec: first.spec,
      issue: secondId,
      inventory: JSON.stringify([secondFile]),
      author: "controller",
    }),
  );
  expect(review.status, review.stderr).toBe(0);
  const issueAssignment = JSON.parse(review.stdout).assignments[0] as {
    id: string;
    report: string;
  };
  writeFileSync(issueAssignment.report, "# Issue review\n\nNo findings.\n");
  const submittedReview = execute(first.repo, (service) =>
    service.submit({
      spec: first.spec,
      issue: secondId,
      role: "review",
      assignment: issueAssignment.id,
      report: issueAssignment.report,
      result: "passed",
      noFindings: true,
      author: "controller",
    }),
  );
  expect(submittedReview.status, submittedReview.stderr).toBe(0);
  const accepted = execute(first.repo, (service) =>
    service.accept({ spec: first.spec, issue: secondId, author: "controller" }),
  );
  expect(accepted.status, accepted.stderr).toBe(0);
  first.git("add", secondFile);
  first.git("commit", "-qm", "deliver second issue");
  const secondIntegration = execute(first.repo, (service) =>
    service.integrate({
      spec: first.spec,
      issue: secondId,
      commit: first.git("rev-parse", "HEAD"),
      author: "controller",
    }),
  );
  expect(secondIntegration.status, secondIntegration.stderr).toBe(0);
  commitAll(first.repo, first.git, "record second issue integration");

  const deliveryCommand = "just test::test tests/whole-feature.test.ts";
  const deliveryCheck = execute(first.repo, (service) =>
    service.checksRequire({
      issue: "",
      spec: first.spec,
      scope: "delivery",
      command: deliveryCommand,
      author: "controller",
    }),
  );
  expect(deliveryCheck.status, deliveryCheck.stderr).toBe(0);
  const deliverySnapshot = JSON.parse(deliveryCheck.stdout).snapshot as string;
  const recordedDeliveryCheck = execute(first.repo, (service) =>
    service.checksRecord({
      issue: "",
      spec: first.spec,
      scope: "delivery",
      snapshot: deliverySnapshot,
      command: deliveryCommand,
      result: "passed",
      author: "controller",
    }),
  );
  expect(recordedDeliveryCheck.status, recordedDeliveryCheck.stderr).toBe(0);
  const aggregate = execute(first.repo, (service) =>
    service.review({
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
  const aggregateSubmission = execute(first.repo, (service) =>
    service.submit({
      issue: "",
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

  const secondIssuePath = join(
    first.repo,
    ".scratch",
    "0001-claim-flow",
    "issues",
    `${secondId}.md`,
  );
  const originalIssue = readFileSync(secondIssuePath, "utf8");
  writeFileSync(
    secondIssuePath,
    originalIssue.replace(
      "## Acceptance Criteria\n\n",
      "## Acceptance Criteria\n\nA whole-feature requirement added after aggregate review.\n\n",
    ),
  );
  const staleFinish = execute(first.repo, (service) =>
    service.finish({ spec: first.spec, author: "controller" }),
  );
  expect(staleFinish.status).not.toBe(0);
  expect(staleFinish.stderr).toMatch(
    /final delivery checks are not current and passing|aggregate required reviews are not current and passing/i,
  );
  writeFileSync(secondIssuePath, originalIssue);
  const finished = execute(first.repo, (service) =>
    service.finish({ spec: first.spec, author: "controller" }),
  );
  expect(finished.status, finished.stderr).toBe(0);
  expect(JSON.parse(finished.stdout).finished).toBe(true);
});

test("status and next expose delivery assignments, blockers, and finish action without mutation", () => {
  const { repo, git, spec } = prepareDeliveryReady();
  const ledgerPath = join(repo, ".scratch", "0001-claim-flow", "sdd.json");
  const ledgerBefore = readFileSync(ledgerPath, "utf8");
  const gitStatusBefore = git("status", "--porcelain");
  const status = execute(repo, (service) => service.status({ spec }));
  const next = execute(repo, (service) => service.next({ spec }));
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

test("finished delivery rejects failed check recording without changing its state", () => {
  const { repo, git, spec, deliveryCheck } = prepareDeliveryReady();
  const ledgerPath = join(repo, ".scratch", "0001-claim-flow", "sdd.json");
  const finish = execute(repo, (service) => service.finish({ spec, author: "controller" }));
  expect(finish.status, finish.stderr).toBe(0);
  const before = readFileSync(ledgerPath, "utf8");
  const gitBefore = git("status", "--porcelain");
  const status = execute(repo, (service) => service.status({ spec }));
  expect(status.status, status.stderr).toBe(0);
  const snapshot = JSON.parse(status.stdout).delivery.snapshot as string;

  const recorded = execute(repo, (service) =>
    service.checksRecord({
      issue: "",
      spec,
      scope: "delivery",
      snapshot,
      command: deliveryCheck,
      result: "failed",
      details: "Post-finish failure must not invalidate completion.",
      author: "controller",
    }),
  );
  expect(recorded.status).not.toBe(0);
  expect(recorded.stderr).toMatch(/delivery is finished/i);
  expect(readFileSync(ledgerPath, "utf8")).toBe(before);
  expect(git("status", "--porcelain")).toBe(gitBefore);
});

test("finished delivery rejects new check requirements without changing its state", () => {
  const { repo, git, spec } = prepareDeliveryReady();
  const ledgerPath = join(repo, ".scratch", "0001-claim-flow", "sdd.json");
  const finish = execute(repo, (service) => service.finish({ spec, author: "controller" }));
  expect(finish.status, finish.stderr).toBe(0);
  const before = readFileSync(ledgerPath, "utf8");
  const gitBefore = git("status", "--porcelain");

  const required = execute(repo, (service) =>
    service.checksRequire({
      issue: "",
      spec,
      scope: "delivery",
      command: "just test::test tests/post-finish.test.ts",
      author: "controller",
    }),
  );
  expect(required.status).not.toBe(0);
  expect(required.stderr).toMatch(/delivery is finished/i);
  expect(readFileSync(ledgerPath, "utf8")).toBe(before);
  expect(git("status", "--porcelain")).toBe(gitBefore);
});

test("delivery finish requires its recorded owner or an explicit confirmed handoff", () => {
  const { repo, git, spec } = prepareDeliveryReady();
  const ledgerPath = join(repo, ".scratch", "0001-claim-flow", "sdd.json");
  const finish = execute(repo, (service) => service.finish({ spec, author: "controller" }));
  expect(finish.status, finish.stderr).toBe(0);
  const before = readFileSync(ledgerPath, "utf8");
  const gitBefore = git("status", "--porcelain");

  const replacementFinish = execute(repo, (service) =>
    service.finish({ spec, author: "replacement" }),
  );
  expect(replacementFinish.status).not.toBe(0);
  expect(replacementFinish.stderr).toMatch(/recorded delivery owner|ownership handoff/i);
  expect(readFileSync(ledgerPath, "utf8")).toBe(before);
  expect(git("status", "--porcelain")).toBe(gitBefore);

  const handoff = execute(repo, (service) =>
    service.resume({
      issue: "",
      spec,
      scope: "delivery",
      author: "replacement",
      confirmHandoff: true,
    }),
  );
  expect(handoff.status, handoff.stderr).toBe(0);
  expect(JSON.parse(handoff.stdout).handoffRecorded).toBe(true);
  const replacementFinishAfterHandoff = execute(repo, (service) =>
    service.finish({ spec, author: "replacement" }),
  );
  expect(replacementFinishAfterHandoff.status, replacementFinishAfterHandoff.stderr).toBe(0);
  expect(JSON.parse(replacementFinishAfterHandoff.stdout).idempotent).toBe(true);
});

test("finished delivery status, next, and resume expose completion and stale evidence", () => {
  const { repo, git, spec } = prepareDeliveryReady();
  const report = join(repo, ".scratch", "0001-claim-flow", "reports", "retrospective.md");
  writeFileSync(report, "# Retrospective\n\nCompletion evidence.\n");
  const finish = execute(repo, (service) => service.finish({ spec, report, author: "controller" }));
  expect(finish.status, finish.stderr).toBe(0);
  const ledgerPath = join(repo, ".scratch", "0001-claim-flow", "sdd.json");
  const reviewPath = JSON.parse(readFileSync(ledgerPath, "utf8")).delivery.reviewAssignments[0]
    .report as string;
  const gitBefore = git("status", "--porcelain");

  const assertValidCompletion = () => {
    const status = execute(repo, (service) => service.status({ spec }));
    const next = execute(repo, (service) => service.next({ spec }));
    const resume = execute(repo, (service) =>
      service.resume({ issue: "", spec, scope: "delivery", author: "controller" }),
    );
    expect(status.status, status.stderr).toBe(0);
    expect(next.status, next.stderr).toBe(0);
    expect(resume.status, resume.stderr).toBe(0);
    const statusDelivery = JSON.parse(status.stdout).delivery;
    const nextDelivery = JSON.parse(next.stdout).delivery;
    const resumed = JSON.parse(resume.stdout);
    expect(statusDelivery.finished).toBe(true);
    expect(statusDelivery.action).toBe("finished");
    expect(statusDelivery.blockers).toEqual([]);
    expect(nextDelivery).toEqual(statusDelivery);
    expect(resumed.finished).toBe(true);
    expect(resumed.nextAction).toBe("finished");
    expect(resumed.blocker).toBe(undefined);
  };
  const assertInvalidatedCompletion = () => {
    const status = execute(repo, (service) => service.status({ spec }));
    const next = execute(repo, (service) => service.next({ spec }));
    const resume = execute(repo, (service) =>
      service.resume({ issue: "", spec, scope: "delivery", author: "controller" }),
    );
    expect(status.status, status.stderr).toBe(0);
    expect(next.status, next.stderr).toBe(0);
    expect(resume.status, resume.stderr).toBe(0);
    const statusDelivery = JSON.parse(status.stdout).delivery;
    const nextDelivery = JSON.parse(next.stdout).delivery;
    const resumed = JSON.parse(resume.stdout);
    expect(statusDelivery.finished).toBe(true);
    expect(statusDelivery.action).toBe("completion-invalidated");
    expect(statusDelivery.blockers.length > 0).toBeTruthy();
    expect(nextDelivery).toEqual(statusDelivery);
    expect(resumed.finished).toBe(true);
    expect(resumed.nextAction).toBe("completion-invalidated");
    expect(resumed.blocker).toMatch(/finished|completion|evidence/i);
  };

  assertValidCompletion();

  const featurePath = join(repo, "feature.ts");
  const featureBefore = readFileSync(featurePath, "utf8");
  writeFileSync(featurePath, `${featureBefore}// external change\n`);
  assertInvalidatedCompletion();
  writeFileSync(featurePath, featureBefore);
  assertValidCompletion();

  const specPath = isAbsolute(spec) ? spec : join(repo, spec);
  const specBefore = readFileSync(specPath, "utf8");
  writeFileSync(specPath, `${specBefore}\n`);
  assertInvalidatedCompletion();
  writeFileSync(specPath, specBefore);
  assertValidCompletion();

  const reviewBefore = readFileSync(reviewPath, "utf8");
  writeFileSync(reviewPath, `${reviewBefore}\nExternal review edit.\n`);
  assertInvalidatedCompletion();
  writeFileSync(reviewPath, reviewBefore);
  assertValidCompletion();

  const retrospectiveBefore = readFileSync(report, "utf8");
  writeFileSync(report, `${retrospectiveBefore}\nExternal retrospective edit.\n`);
  assertInvalidatedCompletion();
  writeFileSync(report, retrospectiveBefore);
  assertValidCompletion();
  expect(git("status", "--porcelain")).toBe(gitBefore);
});
