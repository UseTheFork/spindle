import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import {
  execute,
  invokeAsync,
  commitAll,
  prepareClaimableIssue,
  prepareImplementationForReview,
  recordReviewCheck,
  prepareReviewAssignment,
  refreshReviewCheck,
} from "../helpers/helpers";
import type { WorkflowServices } from "../helpers/WorkflowServices";
test("claim records the clean starting revision and explicit controller", async () => {
  const { repo, git, spec, baseSha } = await prepareClaimableIssue();

  const claimed = await execute(repo, (service) =>
    service.assignmentService.claim({ spec, issue: "I-0001", author: "controller" }),
  );

  expect(claimed.status, claimed.stderr).toBe(0);
  const output = JSON.parse(claimed.stdout) as {
    issue: string;
    execution: string;
    owner: string;
    baseSha: string;
    snapshot: string;
    codeSnapshot: string;
    requirementsSnapshot: string;
    headSha: string;
  };
  expect(output.issue).toBe("I-0001");
  expect(output.execution).toBe("claimed");
  expect(output.owner).toBe("controller");
  expect(output.baseSha).toBe(baseSha);
  expect(output.headSha).toBe(baseSha);
  expect(output.snapshot).toMatch(/^[0-9a-f]{64}$/);
  expect(output.codeSnapshot).toMatch(/^[0-9a-f]{64}$/);
  expect(output.requirementsSnapshot).toMatch(/^[0-9a-f]{64}$/);
  const ledger = JSON.parse(
    readFileSync(join(repo, ".scratch", "0001-claim-flow", "sdd.json"), "utf8"),
  );
  expect(ledger.issues[0]).toEqual({
    id: "I-0001",
    execution: "claimed",
    owner: "controller",
    baseSha,
  });
  expect(git("rev-parse", "HEAD")).toBe(baseSha);
});

test("review requires current passing checks and confirmed inventory and reuses its assignment", async () => {
  const { repo, spec, command, submission } = await prepareImplementationForReview();
  const review = async (inventory: string[]) =>
    await execute(repo, (service) =>
      service.reviewService.review({
        spec,
        issue: "I-0001",
        inventory: JSON.stringify(inventory),
        author: "controller",
      }),
    );

  const missingCheck = await review(["feature.ts"]);
  expect(missingCheck.status).not.toBe(0);
  expect(missingCheck.stderr).toMatch(/Required check .* is missing/);

  const failedCheck = await recordReviewCheck(repo, spec, command, submission.snapshot, "failed");
  expect(failedCheck.status, failedCheck.stderr).toBe(0);
  const failedReview = await review(["feature.ts"]);
  expect(failedReview.status).not.toBe(0);
  expect(failedReview.stderr).toMatch(/Required check .* is failed/);

  const passingCheck = await recordReviewCheck(repo, spec, command, submission.snapshot, "passed");
  expect(passingCheck.status, passingCheck.stderr).toBe(0);
  const wrongInventory = await review([]);
  expect(wrongInventory.status).not.toBe(0);
  expect(wrongInventory.stderr).toMatch(/inventory/i);
  const ledgerPath = join(repo, ".scratch", "0001-claim-flow", "sdd.json");
  expect(JSON.parse(readFileSync(ledgerPath, "utf8")).issues[0].reviewAssignments).toBe(undefined);

  const dispatched = await review(["feature.ts"]);
  expect(dispatched.status, dispatched.stderr).toBe(0);
  const result = JSON.parse(dispatched.stdout) as {
    issue: string;
    execution: string;
    assignments: {
      id: string;
      agent: string;
      role: string;
      scope: string;
      snapshot: string;
      inventory: string[];
      report: string;
      status: string;
    }[];
  };
  expect(result.issue).toBe("I-0001");
  expect(result.execution).toBe("reviewing");
  expect(result.assignments.length).toBe(1);
  const assignment = result.assignments[0]!;
  expect(assignment.id).toMatch(/^[0-9a-f-]{36}$/i);
  expect(assignment.agent).toBe("sdd-reviewer");
  expect(assignment.role).toBe("review");
  expect(assignment.scope).toBe("initial");
  expect(assignment.snapshot).toBe(submission.snapshot);
  expect(assignment.inventory).toEqual(["feature.ts"]);
  expect(assignment.report).toMatch(/I-0001-review-/);
  expect(assignment.status).toBe("pending");

  const status = await execute(repo, (service) =>
    service.featureInspectionService.status({ spec }),
  );
  expect(status.status, status.stderr).toBe(0);
  expect(JSON.parse(status.stdout).pendingAssignments).toEqual([
    {
      issue: "I-0001",
      id: assignment.id,
      role: "review",
      action: "review",
      report: assignment.report,
      status: "pending",
      agent: "sdd-reviewer",
      scope: "initial",
    },
  ]);

  const repeated = await review(["feature.ts"]);
  expect(repeated.status, repeated.stderr).toBe(0);
  expect(JSON.parse(repeated.stdout).assignments[0].id).toBe(assignment.id);
  expect(JSON.parse(repeated.stdout).idempotent).toBe(true);
  const persisted = JSON.parse(readFileSync(ledgerPath, "utf8"));
  expect(persisted.issues[0].reviewAssignments.length).toBe(1);
  const issueText = readFileSync(
    join(repo, ".scratch", "0001-claim-flow", "issues", "I-0001.md"),
    "utf8",
  );
  expect(issueText.match(/Initial review assignment recorded/g)?.length).toBe(1);
});

test("required specialist reviews are justified, distinct, provenance-bound, and gate acceptance", async () => {
  const { repo, spec, command, submission } = await prepareImplementationForReview();
  const ledgerPath = join(repo, ".scratch", "0001-claim-flow", "sdd.json");
  const issuePath = join(repo, ".scratch", "0001-claim-flow", "issues", "I-0001.md");
  const requireReview = async (agent: string, details: string) =>
    await execute(repo, (service) =>
      service.reviewService.reviewRequire({
        spec,
        issue: "I-0001",
        agent,
        details,
        author: "controller",
      }),
    );

  const originalLedger = readFileSync(ledgerPath, "utf8");
  const originalIssue = readFileSync(issuePath, "utf8");
  const unknownAgent = await requireReview("not-in-catalog", "Inspect generated source API usage.");
  expect(unknownAgent.status).not.toBe(0);
  expect(unknownAgent.stderr).toMatch(/unknown.*agent|catalog/i);
  expect(readFileSync(ledgerPath, "utf8")).toBe(originalLedger);
  expect(readFileSync(issuePath, "utf8")).toBe(originalIssue);

  const ineligibleAgent = await requireReview(
    "sdd-implementer",
    "Inspect generated source API usage.",
  );
  expect(ineligibleAgent.status).not.toBe(0);
  expect(ineligibleAgent.stderr).toMatch(/not explicitly marked review-eligible/i);
  expect(readFileSync(ledgerPath, "utf8")).toBe(originalLedger);
  expect(readFileSync(issuePath, "utf8")).toBe(originalIssue);

  const details = "Check that generated TypeScript declarations preserve exported API contracts.";
  const required = await requireReview("sdd-code-reviewer", details);
  expect(required.status, required.stderr).toBe(0);
  const requirement = JSON.parse(required.stdout).requirement as {
    agent: string;
    details: string;
    author: string;
  };
  expect(requirement.agent).toBe("sdd-code-reviewer");
  expect(requirement.details).toBe(details);
  expect(requirement.author).toBe("controller");

  const repeated = await requireReview("sdd-code-reviewer", details);
  expect(repeated.status, repeated.stderr).toBe(0);
  expect(JSON.parse(repeated.stdout).idempotent).toBe(true);
  const conflicting = await requireReview(
    "sdd-code-reviewer",
    "Replace the original objective with an unrelated review.",
  );
  expect(conflicting.status).not.toBe(0);
  expect(conflicting.stderr).toMatch(/already pinned/i);
  const registeredLedger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  expect(registeredLedger.issues[0].reviewRequirements.length).toBe(1);
  expect(registeredLedger.issues[0].reviewRequirements[0].details).toBe(details);
  expect(readFileSync(issuePath, "utf8")).toMatch(/Specialist review required/);

  const check = await recordReviewCheck(repo, spec, command, submission.snapshot, "passed");
  expect(check.status, check.stderr).toBe(0);
  const dispatched = await execute(repo, (service) =>
    service.reviewService.review({
      spec,
      issue: "I-0001",
      inventory: JSON.stringify(["feature.ts"]),
      author: "controller",
    }),
  );
  expect(dispatched.status, dispatched.stderr).toBe(0);
  const assignments = JSON.parse(dispatched.stdout).assignments as {
    id: string;
    agent: string;
    role: string;
    objective?: string;
    report: string;
    status: string;
  }[];
  expect(
    assignments.map(({ agent, role, objective }) => ({
      agent,
      role,
      objective,
    })),
  ).toEqual([
    { agent: "sdd-reviewer", role: "review", objective: undefined },
    { agent: "sdd-code-reviewer", role: "review", objective: details },
  ]);
  expect(new Set(assignments.map((assignment) => assignment.id)).size).toBe(2);
  expect(new Set(assignments.map((assignment) => assignment.report)).size).toBe(2);
  expect(assignments.every((assignment) => assignment.status === "pending")).toBeTruthy();
  const status = await execute(repo, (service) =>
    service.featureInspectionService.status({ spec }),
  );
  expect(status.status, status.stderr).toBe(0);
  expect(
    JSON.parse(status.stdout).pendingAssignments.find(
      (assignment: { agent?: string }) => assignment.agent === "sdd-code-reviewer",
    ).objective,
  ).toBe(details);

  const lateRequirement = await requireReview("sdd-reviewer", "Check for an unrelated concern.");
  expect(lateRequirement.status).not.toBe(0);
  expect(lateRequirement.stderr).toMatch(/review.*already.*assigned|frozen/i);
  expect(JSON.parse(readFileSync(ledgerPath, "utf8")).issues[0].reviewRequirements.length).toBe(1);

  const defaultReviewer = assignments.find((assignment) => assignment.agent === "sdd-reviewer")!;
  const specialist = assignments.find((assignment) => assignment.agent === "sdd-code-reviewer")!;
  writeFileSync(defaultReviewer.report, "# Comprehensive review\n\nNo defects found.\n");
  writeFileSync(specialist.report, "# Specialist review\n\nNo API defects found.\n");

  const substitutedSource = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      issue: "I-0001",
      role: "review",
      assignment: specialist.id,
      report: defaultReviewer.report,
      result: "passed",
      noFindings: true,
      author: "controller",
    }),
  );
  expect(substitutedSource.status).not.toBe(0);
  expect(substitutedSource.stderr).toMatch(/assigned destination|assignment/i);

  const submit = async (assignment: (typeof assignments)[number]) =>
    await execute(repo, (service) =>
      service.submissionService.submit({
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
  const defaultSubmitted = await submit(defaultReviewer);
  expect(defaultSubmitted.status, defaultSubmitted.stderr).toBe(0);
  const incompleteAcceptance = await execute(repo, (service) =>
    service.integrationService.accept({ spec, issue: "I-0001", author: "controller" }),
  );
  expect(incompleteAcceptance.status).not.toBe(0);
  expect(incompleteAcceptance.stderr).toMatch(/pending|coverage/i);

  const specialistSubmitted = await submit(specialist);
  expect(specialistSubmitted.status, specialistSubmitted.stderr).toBe(0);
  const accepted = await execute(repo, (service) =>
    service.integrationService.accept({ spec, issue: "I-0001", author: "controller" }),
  );
  expect(accepted.status, accepted.stderr).toBe(0);
  expect(
    JSON.parse(accepted.stdout).reviews.map((review: { agent: string }) => review.agent),
  ).toEqual(["sdd-reviewer", "sdd-code-reviewer"]);
});

test("unavailable specialist submissions preserve the pinned objective separately from result details", async () => {
  const { repo, spec, command, submission } = await prepareImplementationForReview();
  const required = await execute(repo, (service) =>
    service.reviewService.reviewRequire({
      spec,
      issue: "I-0001",
      agent: "sdd-code-reviewer",
      details: "Check generated declarations against the exported runtime API.",
      author: "controller",
    }),
  );
  expect(required.status, required.stderr).toBe(0);
  const check = await recordReviewCheck(repo, spec, command, submission.snapshot, "passed");
  expect(check.status, check.stderr).toBe(0);
  const dispatched = await execute(repo, (service) =>
    service.reviewService.review({
      spec,
      issue: "I-0001",
      inventory: JSON.stringify(["feature.ts"]),
      author: "controller",
    }),
  );
  expect(dispatched.status, dispatched.stderr).toBe(0);
  const assignment = JSON.parse(dispatched.stdout).assignments.find(
    (candidate: { agent: string }) => candidate.agent === "sdd-code-reviewer",
  ) as { id: string; report: string };
  writeFileSync(assignment.report, "# Specialist review\n\nCould not complete the assessment.\n");
  const failureDetails = "The generated declaration fixture is unavailable.";
  const submitted = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      issue: "I-0001",
      role: "review",
      assignment: assignment.id,
      report: assignment.report,
      result: "unavailable",
      noFindings: true,
      details: failureDetails,
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);
  const stored = JSON.parse(
    readFileSync(join(repo, ".scratch", "0001-claim-flow", "sdd.json"), "utf8"),
  ).issues[0].reviewAssignments.find(
    (candidate: { agent: string }) => candidate.agent === "sdd-code-reviewer",
  );
  expect(stored.role).toBe("review");
  expect(stored.objective).toBe("Check generated declarations against the exported runtime API.");
  expect(stored.details).toBe(failureDetails);
});

test("review accepts a Git-derived mixed-case inventory in its supplied order", async () => {
  const { repo, spec, command } = await prepareImplementationForReview();
  writeFileSync(join(repo, "B.ts"), "export const upper = true;\n");
  writeFileSync(join(repo, "a.ts"), "export const lower = true;\n");
  const passingCheck = await refreshReviewCheck(repo, spec, command);
  expect(passingCheck.status, passingCheck.stderr).toBe(0);

  const dispatched = await execute(repo, (service) =>
    service.reviewService.review({
      spec,
      issue: "I-0001",
      inventory: JSON.stringify(["B.ts", "a.ts", "feature.ts"]),
      author: "controller",
    }),
  );

  expect(dispatched.status, dispatched.stderr).toBe(0);
  expect(JSON.parse(dispatched.stdout).assignments[0].inventory).toEqual([
    "B.ts",
    "a.ts",
    "feature.ts",
  ]);
});

test("finding registration is explicit, canonical, issue-local, and idempotent", async () => {
  const { repo, spec, assignment } = await prepareReviewAssignment();
  writeFileSync(assignment.report, "# Review report\n\nThe change has a defect.\n");
  const create = async (
    extra: Partial<Parameters<WorkflowServices["findingService"]["findingCreate"]>[0]> = {},
  ) =>
    await execute(repo, (service) =>
      service.findingService.findingCreate({
        spec,
        issue: "I-0001",
        source: assignment.report,
        snapshot: assignment.snapshot,
        severity: "high",
        blocking: true,
        summary: "Incorrect result for empty input",
        details: "The implementation returns a success result for empty input.",
        author: "controller",
        ...extra,
      }),
    );

  const registered = await create();
  expect(registered.status, registered.stderr).toBe(0);
  const output = JSON.parse(registered.stdout) as {
    finding: {
      id: string;
      severity: string;
      blocking: boolean;
      status: string;
      summary: string;
      details: string;
      author: string;
      provenance: { report: string; snapshot: string }[];
    };
  };
  expect(output.finding.id).toBe("F-0001");
  expect(output.finding.severity).toBe("high");
  expect(output.finding.blocking).toBe(true);
  expect(output.finding.status).toBe("open");
  expect(output.finding.summary).toBe("Incorrect result for empty input");
  expect(output.finding.details).toMatch(/empty input/);
  expect(output.finding.author).toBe("controller");
  expect(output.finding.provenance).toEqual([
    {
      report: assignment.report,
      snapshot: assignment.snapshot,
      author: "controller",
      summary: "Incorrect result for empty input",
      details: "The implementation returns a success result for empty input.",
    },
  ]);

  const repeated = await create();
  expect(repeated.status, repeated.stderr).toBe(0);
  expect(JSON.parse(repeated.stdout).finding.id).toBe("F-0001");
  expect(JSON.parse(repeated.stdout).idempotent).toBe(true);

  const ledger = JSON.parse(
    readFileSync(join(repo, ".scratch", "0001-claim-flow", "sdd.json"), "utf8"),
  );
  expect(ledger.issues[0].findings.length).toBe(1);
  expect(ledger.issues[0].findings[0].id).toBe("F-0001");
  const issueText = readFileSync(
    join(repo, ".scratch", "0001-claim-flow", "issues", "I-0001.md"),
    "utf8",
  );
  expect(issueText).toMatch(/Finding F-0001 registered by controller/);

  const missingBlockingChoice = await execute(repo, (service) =>
    service.findingService.findingCreate({
      spec,
      issue: "I-0001",
      source: assignment.report,
      snapshot: assignment.snapshot,
      severity: "medium",
      summary: "Missing blocking choice",
      details: "The blocking policy was omitted.",
      author: "controller",
    }),
  );
  expect(missingBlockingChoice.status).not.toBe(0);
  expect(missingBlockingChoice.stderr).toMatch(/--blocking or --non-blocking/);
  expect(
    JSON.parse(readFileSync(join(repo, ".scratch", "0001-claim-flow", "sdd.json"), "utf8"))
      .issues[0].findings.length,
  ).toBe(1);
});

test("finding IDs restart per issue and require provenance from that issue's review", async () => {
  const { repo, git, spec, assignment } = await prepareReviewAssignment();
  writeFileSync(assignment.report, "# First issue review\n\nFinding from the first issue.\n");
  const firstFinding = await execute(repo, (service) =>
    service.findingService.findingCreate({
      spec,
      issue: "I-0001",
      source: assignment.report,
      snapshot: assignment.snapshot,
      severity: "high",
      nonBlocking: true,
      summary: "First issue observation",
      details: "This observation belongs to issue one.",
      author: "controller",
    }),
  );
  expect(firstFinding.status, firstFinding.stderr).toBe(0);
  expect(JSON.parse(firstFinding.stdout).finding.id).toBe("F-0001");
  const firstStatus = await execute(repo, (service) =>
    service.featureInspectionService.status({ spec }),
  );
  expect(firstStatus.status, firstStatus.stderr).toBe(0);
  expect(JSON.parse(firstStatus.stdout).findings[0].finding.severity).toBe("high");
  expect(JSON.parse(firstStatus.stdout).findings[0].finding.blocking).toBe(false);
  expect(
    JSON.parse(firstStatus.stdout).blockers.some((blocker: { reason: string }) =>
      /Finding F-0001/.test(blocker.reason),
    ),
  ).toBe(false);

  const created = await execute(repo, (service) =>
    service.issueService.issueCreate({
      spec,
      title: "Second issue",
      reporter: "requester",
      category: "enhancement",
      author: "controller",
    }),
  );
  expect(created.status, created.stderr).toBe(0);
  const triaged = await execute(repo, (service) =>
    service.issueService.triage({
      spec,
      issue: "I-0002",
      status: "ready-for-agent",
      category: "enhancement",
      details: "Requirements are complete.",
      author: "controller",
    }),
  );
  expect(triaged.status, triaged.stderr).toBe(0);
  const command = "just test::test tests/feature-two.test.ts";
  const required = await execute(repo, (service) =>
    service.checksService.checksRequire({ spec, issue: "I-0002", command, author: "controller" }),
  );
  expect(required.status, required.stderr).toBe(0);
  commitAll(repo, git, "prepare second issue");

  const claimed = await execute(repo, (service) =>
    service.assignmentService.claim({ spec, issue: "I-0002", author: "controller" }),
  );
  expect(claimed.status, claimed.stderr).toBe(0);
  writeFileSync(join(repo, "feature-two.ts"), "export const second = true;\n");
  const implementation = await execute(repo, (service) =>
    service.assignmentService.implement({ spec, issue: "I-0002", author: "controller" }),
  );
  expect(implementation.status, implementation.stderr).toBe(0);
  const implementationReport = JSON.parse(implementation.stdout).assignment.report as string;
  writeFileSync(implementationReport, "# Second implementation\n\nCompleted.\n");
  const submittedImplementation = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      issue: "I-0002",
      role: "implementation",
      report: implementationReport,
      author: "controller",
    }),
  );
  expect(submittedImplementation.status, submittedImplementation.stderr).toBe(0);
  const secondSnapshot = JSON.parse(submittedImplementation.stdout).snapshot as string;
  const check = await execute(repo, (service) =>
    service.checksService.checksRecord({
      spec,
      issue: "I-0002",
      snapshot: secondSnapshot,
      command,
      result: "passed",
      author: "controller",
    }),
  );
  expect(check.status, check.stderr).toBe(0);
  const review = await execute(repo, (service) =>
    service.reviewService.review({
      spec,
      issue: "I-0002",
      inventory: JSON.stringify(["feature-two.ts"]),
      author: "controller",
    }),
  );
  expect(review.status, review.stderr).toBe(0);
  const secondAssignment = JSON.parse(review.stdout).assignments[0] as {
    report: string;
    snapshot: string;
  };
  writeFileSync(secondAssignment.report, "# Second issue review\n\nFinding from issue two.\n");
  const secondFinding = await execute(repo, (service) =>
    service.findingService.findingCreate({
      spec,
      issue: "I-0002",
      source: secondAssignment.report,
      snapshot: secondAssignment.snapshot,
      severity: "low",
      blocking: true,
      summary: "Second issue observation",
      details: "This observation belongs to issue two.",
      author: "controller",
    }),
  );
  expect(secondFinding.status, secondFinding.stderr).toBe(0);
  expect(JSON.parse(secondFinding.stdout).finding.id).toBe("F-0001");
  expect(JSON.parse(secondFinding.stdout).finding.blocking).toBe(true);
});

test("review submission requires canonical findings or exclusive no-findings and cannot bypass blockers", async () => {
  const { repo, spec, assignment } = await prepareReviewAssignment();
  writeFileSync(assignment.report, "# Review report\n\nA blocking issue was found.\n");
  const createFinding = async (source = assignment.report, snapshot = assignment.snapshot) =>
    await execute(repo, (service) =>
      service.findingService.findingCreate({
        spec,
        issue: "I-0001",
        source,
        snapshot,
        severity: "low",
        blocking: true,
        summary: "Acceptance regression",
        details: "The behavior violates an acceptance requirement.",
        author: "controller",
      }),
    );
  const created = await createFinding();
  expect(created.status, created.stderr).toBe(0);
  const submit = async (
    extra: Partial<Parameters<WorkflowServices["submissionService"]["submit"]>[0]>,
  ) =>
    await execute(repo, (service) =>
      service.submissionService.submit({
        spec,
        issue: "I-0001",
        role: "review",
        assignment: assignment.id,
        report: assignment.report,
        result: "passed",
        ...extra,
        author: "controller",
      }),
    );

  const undeclared = await submit({});
  expect(undeclared.status).not.toBe(0);
  expect(undeclared.stderr).toMatch(/--findings or exclusive --no-findings/);

  const contradictory = await submit({ findingIds: ["F-0001"], noFindings: true });
  expect(contradictory.status).not.toBe(0);
  expect(contradictory.stderr).toMatch(/cannot (?:be combined|declare)|mutually exclusive/i);

  const unknownFinding = await submit({ findingIds: ["F-9999"] });
  expect(unknownFinding.status).not.toBe(0);
  expect(unknownFinding.stderr).toMatch(/finding F-9999|provenance/i);

  const falseNoFindings = await submit({ noFindings: true });
  expect(falseNoFindings.status).not.toBe(0);
  expect(falseNoFindings.stderr).toMatch(/registered findings|cannot declare --no-findings/i);

  const wrongSource = await createFinding(
    join(repo, ".scratch", "0001-claim-flow", "reports", "I-0001-implementation.md"),
    assignment.snapshot,
  );
  expect(wrongSource.status).not.toBe(0);
  expect(wrongSource.stderr).toMatch(/source report and snapshot/i);

  const registered = await submit({ findingIds: ["F-0001"] });
  expect(registered.status, registered.stderr).toBe(0);
  const result = JSON.parse(registered.stdout).assignment as {
    result: string;
    noFindings?: boolean;
    findingIds?: string[];
  };
  expect(JSON.parse(registered.stdout).execution).toBe("changes-requested");
  expect(result.result).toBe("passed");
  expect(result.noFindings).toBe(undefined);
  expect(result.findingIds).toEqual(["F-0001"]);
  const repeatedSubmission = await submit({ findingIds: ["F-0001"] });
  expect(repeatedSubmission.status, repeatedSubmission.stderr).toBe(0);
  expect(JSON.parse(repeatedSubmission.stdout).idempotent).toBe(true);

  const ledgerPath = join(repo, ".scratch", "0001-claim-flow", "sdd.json");
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  expect(ledger.issues[0].reviewAssignments[0].findingIds).toEqual(["F-0001"]);
  const accepted = await execute(repo, (service) =>
    service.integrationService.accept({ spec, issue: "I-0001", author: "controller" }),
  );
  expect(accepted.status).not.toBe(0);
  expect(accepted.stderr).toMatch(/F-0001.*blocking|blocking.*F-0001/i);

  const next = await execute(repo, (service) => service.deliveryService.next({ spec }));
  const status = await execute(repo, (service) =>
    service.featureInspectionService.status({ spec }),
  );
  expect(next.status, next.stderr).toBe(0);
  expect(status.status, status.stderr).toBe(0);
  expect(JSON.parse(next.stdout).actions).toEqual([
    { issue: "I-0001", action: "adjudicate-findings" },
  ]);
  expect(JSON.stringify(JSON.parse(next.stdout).blockers)).toMatch(/F-0001/);
  expect(JSON.stringify(JSON.parse(status.stdout).blockers)).toMatch(/F-0001/);
  expect(JSON.parse(next.stdout).findings[0].finding.id).toBe("F-0001");
  expect(JSON.parse(status.stdout).findings[0].finding.id).toBe("F-0001");
});

test("review submission rejects equals-form declaration conflicts without registered findings", async () => {
  const { repo, spec, assignment } = await prepareReviewAssignment();
  writeFileSync(assignment.report, "# Review report\n\nNo findings were registered.\n");
  const submitted = await invokeAsync(repo, [
    "submit",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--role",
    "review",
    "--assignment",
    assignment.id,
    "--report",
    assignment.report,
    "--result",
    "passed",
    "--findings=F-0001",
    "--no-findings",
    "--author",
    "controller",
  ]);

  expect(submitted.status).not.toBe(0);
  expect(submitted.stderr).toMatch(/cannot (?:be combined|declare)|mutually exclusive/i);
});

test("review submission permits flag-like text in a parsed option value", async () => {
  const { repo, spec, assignment } = await prepareReviewAssignment();
  writeFileSync(assignment.report, "# Review report\n\nThe report is unavailable for review.\n");
  const details = "--findings";
  const submitted = await invokeAsync(repo, [
    "submit",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--role",
    "review",
    "--assignment",
    assignment.id,
    "--report",
    assignment.report,
    "--result",
    "failed",
    "--no-findings",
    "--details",
    details,
    "--author",
    "controller",
  ]);

  expect(submitted.status, submitted.stderr).toBe(0);
  const result = JSON.parse(submitted.stdout) as {
    execution: string;
    assignment: { noFindings?: boolean; details?: string };
  };
  expect(result.execution).toBe("changes-requested");
  expect(result.assignment.noFindings).toBe(true);
  expect(result.assignment.details).toBe(details);
});

test("finding rulings persist, require evidence or rationale, and keep deferral from clearing blockers", async () => {
  const { repo, spec, command, assignment } = await prepareReviewAssignment();
  writeFileSync(assignment.report, "# Review report\n\nRulings need explicit evidence.\n");
  const create = async (blocking: boolean, summary: string) =>
    await execute(repo, (service) =>
      service.findingService.findingCreate({
        spec,
        issue: "I-0001",
        source: assignment.report,
        snapshot: assignment.snapshot,
        severity: "medium",
        blocking,
        nonBlocking: !blocking,
        summary,
        details: "Finding details.",
        author: "controller",
      }),
    );
  const blocking = await create(true, "Blocking finding");
  expect(blocking.status, blocking.stderr).toBe(0);
  const dismissible = await create(false, "Nonblocking finding");
  expect(dismissible.status, dismissible.stderr).toBe(0);
  const update = async (
    finding: string,
    status: string,
    extra: Partial<Parameters<WorkflowServices["findingService"]["findingUpdate"]>[0]> = {},
  ) =>
    await execute(repo, (service) =>
      service.findingService.findingUpdate({
        spec,
        issue: "I-0001",
        finding,
        status,
        ...extra,
        author: "controller",
      }),
    );

  const confirmed = await update("F-0001", "confirmed", { details: "Confirmed as valid." });
  expect(confirmed.status, confirmed.stderr).toBe(0);
  expect(JSON.parse(confirmed.stdout).finding.status).toBe("confirmed");
  expect(
    JSON.stringify(
      JSON.parse(
        (await execute(repo, (service) => service.featureInspectionService.status({ spec })))
          .stdout,
      ).blockers,
    ),
  ).toMatch(/F-0001/);

  const beforeInvalidFix = readFileSync(
    join(repo, ".scratch", "0001-claim-flow", "sdd.json"),
    "utf8",
  );
  const missingEvidence = await update("F-0001", "fixed");
  expect(missingEvidence.status).not.toBe(0);
  expect(missingEvidence.stderr).toMatch(/--evidence/);
  expect(readFileSync(join(repo, ".scratch", "0001-claim-flow", "sdd.json"), "utf8")).toBe(
    beforeInvalidFix,
  );

  const invalidEvidence = await update("F-0001", "fixed", { evidence: "0".repeat(64) });
  expect(invalidEvidence.status).not.toBe(0);
  expect(invalidEvidence.stderr).toMatch(/current snapshot|verification evidence/i);
  expect(readFileSync(join(repo, ".scratch", "0001-claim-flow", "sdd.json"), "utf8")).toBe(
    beforeInvalidFix,
  );

  const sameSnapshotFix = await update("F-0001", "fixed", { evidence: assignment.snapshot });
  expect(sameSnapshotFix.status).not.toBe(0);
  expect(sameSnapshotFix.stderr).toMatch(/observation|changed content|different snapshot/i);
  expect(readFileSync(join(repo, ".scratch", "0001-claim-flow", "sdd.json"), "utf8")).toBe(
    beforeInvalidFix,
  );

  writeFileSync(join(repo, "feature.ts"), "export const feature = false;\n");
  const changedStatus = await execute(repo, (service) =>
    service.featureInspectionService.status({ spec }),
  );
  expect(changedStatus.status, changedStatus.stderr).toBe(0);
  const correctedSnapshot = JSON.parse(changedStatus.stdout).snapshots[0].snapshot as string;
  expect(correctedSnapshot).not.toBe(assignment.snapshot);
  const correctedCheck = await recordReviewCheck(repo, spec, command, correctedSnapshot, "passed");
  expect(correctedCheck.status, correctedCheck.stderr).toBe(0);

  const fixed = await update("F-0001", "fixed", { evidence: correctedSnapshot });
  expect(fixed.status, fixed.stderr).toBe(0);
  expect(JSON.parse(fixed.stdout).finding.status).toBe("fixed");
  expect(JSON.parse(fixed.stdout).finding.verification.snapshot).toBe(correctedSnapshot);

  const missingDismissal = await update("F-0001", "dismissed");
  expect(missingDismissal.status).not.toBe(0);
  expect(missingDismissal.stderr).toMatch(/--details/);
  const dismissed = await update("F-0001", "dismissed", {
    details: "The report's claim is incorrect because empty input is rejected.",
  });
  expect(dismissed.status, dismissed.stderr).toBe(0);
  expect(JSON.parse(dismissed.stdout).finding.status).toBe("dismissed");

  const prohibitedDeferral = await update("F-0001", "deferred", {
    details: "Postponed.",
    followUp: "I-0002",
  });
  expect(prohibitedDeferral.status).not.toBe(0);
  expect(prohibitedDeferral.stderr).toMatch(
    /blocking finding.*cannot be deferred|approved requirements decision/i,
  );

  const missingFollowUp = await update("F-0002", "deferred", { details: "Postponed for later." });
  expect(missingFollowUp.status).not.toBe(0);
  expect(missingFollowUp.stderr).toMatch(/--follow-up/);
  const deferred = await update("F-0002", "deferred", {
    details: "Postponed for later.",
    followUp: "I-0002",
  });
  expect(deferred.status, deferred.stderr).toBe(0);
  expect(JSON.parse(deferred.stdout).finding.status).toBe("deferred");
  expect(JSON.parse(deferred.stdout).finding.followUp).toBe("I-0002");

  const prohibitedStatus = await update("F-0002", "wontfix", { details: "Not doing this." });
  expect(prohibitedStatus.status).not.toBe(0);
  expect(prohibitedStatus.stderr).toMatch(/Invalid finding status/);

  const repeated = await update("F-0002", "deferred", {
    details: "Postponed for later.",
    followUp: "I-0002",
  });
  expect(repeated.status, repeated.stderr).toBe(0);
  expect(JSON.parse(repeated.stdout).idempotent).toBe(true);
  const persisted = JSON.parse(
    readFileSync(join(repo, ".scratch", "0001-claim-flow", "sdd.json"), "utf8"),
  );
  expect(persisted.issues[0].findings[0].status).toBe("dismissed");
  expect(persisted.issues[0].findings[1].status).toBe("deferred");
  expect(persisted.issues[0].findings[1].history.at(-1).author).toBe("controller");
});

test("finding duplicates link explicitly while preserving every source report provenance", async () => {
  const { repo, spec, assignment } = await prepareReviewAssignment();
  const ledgerPath = join(repo, ".scratch", "0001-claim-flow", "sdd.json");
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  const secondId = "review-two";
  const secondReport = join(
    repo,
    ".scratch",
    "0001-claim-flow",
    "reports",
    `I-0001-review-${secondId}.md`,
  );
  const secondAssignment = {
    ...ledger.issues[0].reviewAssignments[0],
    id: secondId,
    report: secondReport,
  };
  ledger.issues[0].reviewAssignments.push(secondAssignment);
  const thirdId = "review-three";
  const thirdReport = join(
    repo,
    ".scratch",
    "0001-claim-flow",
    "reports",
    `I-0001-review-${thirdId}.md`,
  );
  ledger.issues[0].reviewAssignments.push({
    ...secondAssignment,
    id: thirdId,
    report: thirdReport,
  });
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  writeFileSync(assignment.report, "# First review\n\nA duplicated observation.\n");
  writeFileSync(secondReport, "# Second review\n\nThe same defect is observed.\n");
  writeFileSync(thirdReport, "# Third review\n\nThe same defect is observed.\n");

  const create = async (
    source: string,
    extra: Partial<Parameters<WorkflowServices["findingService"]["findingCreate"]>[0]> = {},
  ) =>
    await execute(repo, (service) =>
      service.findingService.findingCreate({
        spec,
        issue: "I-0001",
        source,
        snapshot: assignment.snapshot,
        severity: "medium",
        nonBlocking: true,
        summary: "Same underlying observation",
        details: "Both reports identify the same behavior.",
        ...extra,
        author: "controller",
      }),
    );

  const first = await create(assignment.report);
  expect(first.status, first.stderr).toBe(0);
  expect(JSON.parse(first.stdout).finding.id).toBe("F-0001");

  const linked = await create(secondReport, { link: "F-0001" });
  expect(linked.status, linked.stderr).toBe(0);
  expect(JSON.parse(linked.stdout).finding.id).toBe("F-0001");
  expect(JSON.parse(linked.stdout).finding.provenance).toEqual([
    {
      report: assignment.report,
      snapshot: assignment.snapshot,
      author: "controller",
      summary: "Same underlying observation",
      details: "Both reports identify the same behavior.",
    },
    {
      report: secondReport,
      snapshot: assignment.snapshot,
      author: "controller",
      summary: "Same underlying observation",
      details: "Both reports identify the same behavior.",
    },
  ]);
  expect(JSON.parse(linked.stdout).idempotent).toBe(undefined);

  const repeatedLink = await create(secondReport, { link: "F-0001" });
  expect(repeatedLink.status, repeatedLink.stderr).toBe(0);
  expect(JSON.parse(repeatedLink.stdout).idempotent).toBe(true);

  const independent = await create(thirdReport);
  expect(independent.status, independent.stderr).toBe(0);
  expect(JSON.parse(independent.stdout).finding.id).toBe("F-0002");
  const persisted = JSON.parse(readFileSync(ledgerPath, "utf8"));
  expect(persisted.issues[0].findings.length).toBe(2);
  expect(persisted.issues[0].findings[0].provenance.length).toBe(2);
});

test("a fresh linked observation reopens resolved findings and blocks acceptance until reverified", async () => {
  const { repo, spec, assignment } = await prepareReviewAssignment();
  const initialProvenance: unknown[] = [];
  writeFileSync(assignment.report, "# Initial review\n\nTwo findings require correction.\n");
  const createFinding = async (blocking: boolean, summary: string) =>
    await execute(repo, (service) =>
      service.findingService.findingCreate({
        spec,
        issue: "I-0001",
        source: assignment.report,
        snapshot: assignment.snapshot,
        severity: "high",
        blocking,
        nonBlocking: !blocking,
        summary,
        details: `${summary} was observed in the initial review.`,
        author: "controller",
      }),
    );

  const blocking = await createFinding(true, "Blocking recurrence");
  expect(blocking.status, blocking.stderr).toBe(0);
  const nonBlocking = await createFinding(false, "Nonblocking recurrence");
  expect(nonBlocking.status, nonBlocking.stderr).toBe(0);
  const firstCanonical = JSON.parse(blocking.stdout).finding;
  const secondCanonical = JSON.parse(nonBlocking.stdout).finding;
  initialProvenance.push(firstCanonical.provenance[0], secondCanonical.provenance[0]);

  const initialSubmission = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      issue: "I-0001",
      role: "review",
      assignment: assignment.id,
      report: assignment.report,
      result: "failed",
      findingIds: ["F-0001", "F-0002"],
      details: "The blocking defect requires correction.",
      author: "controller",
    }),
  );
  expect(initialSubmission.status, initialSubmission.stderr).toBe(0);
  expect(JSON.parse(initialSubmission.stdout).execution).toBe("changes-requested");

  const update = async (
    finding: string,
    status: string,
    extra: Partial<Parameters<WorkflowServices["findingService"]["findingUpdate"]>[0]> = {},
  ) =>
    await execute(repo, (service) =>
      service.findingService.findingUpdate({
        spec,
        issue: "I-0001",
        finding,
        status,
        ...extra,
        author: "controller",
      }),
    );
  const dismissedBlocking = await update("F-0001", "dismissed", {
    details: "The initial observation was invalid.",
  });
  expect(dismissedBlocking.status, dismissedBlocking.stderr).toBe(0);
  expect(JSON.parse(dismissedBlocking.stdout).finding.status).toBe("dismissed");
  const dismissed = await update("F-0002", "dismissed", {
    details: "The original nonblocking observation was not valid.",
  });
  expect(dismissed.status, dismissed.stderr).toBe(0);
  expect(JSON.parse(dismissed.stdout).finding.status).toBe("dismissed");

  const freshReview = await execute(repo, (service) =>
    service.reviewService.review({
      spec,
      issue: "I-0001",
      inventory: JSON.stringify(["feature.ts"]),
      author: "controller",
    }),
  );
  expect(freshReview.status, freshReview.stderr).toBe(0);
  const freshAssignment = JSON.parse(freshReview.stdout).assignments[0] as {
    id: string;
    snapshot: string;
    report: string;
  };
  expect(freshAssignment.id).not.toBe(assignment.id);
  expect(freshAssignment.snapshot).toBe(assignment.snapshot);
  writeFileSync(freshAssignment.report, "# Fresh review\n\nBoth observations recur.\n");

  const link = async (finding: string, blocking: boolean, summary: string) =>
    await execute(repo, (service) =>
      service.findingService.findingCreate({
        spec,
        issue: "I-0001",
        source: freshAssignment.report,
        snapshot: freshAssignment.snapshot,
        severity: "high",
        blocking,
        nonBlocking: !blocking,
        summary,
        details: `${summary} was independently observed in the fresh review.`,
        link: finding,
        author: "controller",
      }),
    );
  const relinkedBlocking = await link("F-0001", true, "Blocking recurrence");
  expect(relinkedBlocking.status, relinkedBlocking.stderr).toBe(0);
  const relinkedNonBlocking = await link("F-0002", false, "Nonblocking recurrence");
  expect(relinkedNonBlocking.status, relinkedNonBlocking.stderr).toBe(0);

  const blockingAfterLink = JSON.parse(relinkedBlocking.stdout).finding;
  const nonBlockingAfterLink = JSON.parse(relinkedNonBlocking.stdout).finding;
  expect(blockingAfterLink.status).toBe("open");
  expect(blockingAfterLink.blocking).toBe(true);
  expect(blockingAfterLink.verification).toBe(undefined);
  expect(nonBlockingAfterLink.status).toBe("open");
  expect(nonBlockingAfterLink.blocking).toBe(false);
  expect(nonBlockingAfterLink.rulingDetails).toBe(undefined);
  expect(blockingAfterLink.provenance[0]).toEqual(initialProvenance[0]);
  expect(nonBlockingAfterLink.provenance[0]).toEqual(initialProvenance[1]);
  expect(blockingAfterLink.provenance[1].report).toBe(freshAssignment.report);
  expect(nonBlockingAfterLink.provenance[1].report).toBe(freshAssignment.report);

  const resubmitted = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      issue: "I-0001",
      role: "review",
      assignment: freshAssignment.id,
      report: freshAssignment.report,
      result: "passed",
      findingIds: ["F-0001", "F-0002"],
      author: "controller",
    }),
  );
  expect(resubmitted.status, resubmitted.stderr).toBe(0);
  expect(JSON.parse(resubmitted.stdout).execution).toBe("changes-requested");

  const beforeFreshVerification = await execute(repo, (service) =>
    service.integrationService.accept({ spec, issue: "I-0001", author: "controller" }),
  );
  expect(beforeFreshVerification.status).not.toBe(0);
  expect(beforeFreshVerification.stderr).toMatch(/F-0001.*blocking|blocking.*F-0001/i);

  const repeatedSnapshotFix = await update("F-0001", "fixed", {
    evidence: freshAssignment.snapshot,
  });
  expect(repeatedSnapshotFix.status).not.toBe(0);
  expect(repeatedSnapshotFix.stderr).toMatch(/observation|changed content|different snapshot/i);
  const blockedAccept = await execute(repo, (service) =>
    service.integrationService.accept({ spec, issue: "I-0001", author: "controller" }),
  );
  expect(blockedAccept.status).not.toBe(0);
  expect(blockedAccept.stderr).toMatch(/F-0001.*blocking|blocking.*F-0001/i);
});
