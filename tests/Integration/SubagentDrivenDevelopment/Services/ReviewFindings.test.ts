import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import { nextSummary } from "@/SubagentDrivenDevelopment/Commands/StatusSummary";

import {
  cliOutput,
  commitTicketWorkspace,
  execute,
  invokeAsync,
  prepareReadyTicket,
  prepareImplementationForReview,
  recordReviewCheck,
  prepareReviewAssignment,
  prepareReviewedTicket,
  refreshReviewCheck,
} from "../../../Helpers/SubagentDrivenDevelopment/helpers";
import type { WorkflowServices } from "../../../Helpers/SubagentDrivenDevelopment/WorkflowServices";
test("implement records the ticket baseline and controller while creating an isolated worktree", async () => {
  const { repo, git, spec, baseSha, worktreeParent } = await prepareReadyTicket();

  const dispatched = await execute(repo, (service) =>
    service.assignmentService.implement({
      spec,
      ticket: "T-0001",
      author: "controller",
      workspace: worktreeParent,
    }),
  );

  expect(dispatched.status, dispatched.stderr).toBe(0);
  const output = JSON.parse(dispatched.stdout) as {
    ticket: string;
    execution: string;
    assignment: { workspace: string; branch: string };
    headSha: string;
  };
  expect(output.ticket).toBe("T-0001");
  expect(output.execution).toBe("implementing");
  expect(output.headSha).toBe(baseSha);
  expect(output.assignment.workspace).toBe(join(worktreeParent, "0001-ticket-flow-T-0001"));
  expect(output.assignment.branch).toBe("tickets/0001-ticket-flow/T-0001");
  expect(output.headSha).toMatch(/^[0-9a-f]{40,64}$/);
  const ledger = JSON.parse(
    readFileSync(join(repo, ".scratch", "0001-ticket-flow", "sdd.json"), "utf8"),
  );
  expect(ledger.tickets[0]).toMatchObject({
    id: "T-0001",
    execution: "implementing",
    owner: "controller",
    baseSha,
    assignment: output.assignment,
  });
  expect(git("merge-base", "--is-ancestor", baseSha, "HEAD")).toBe("");
});

test("review requires current passing checks, derives inventory, and reuses its assignment", async () => {
  const { repo, spec, command, submission } = await prepareImplementationForReview();
  const review = async () =>
    await execute(repo, (service) =>
      service.reviewService.review({
        spec,
        ticket: "T-0001",
        author: "controller",
      }),
    );

  const missingCheck = await review();
  expect(missingCheck.status).not.toBe(0);
  expect(missingCheck.stderr).toMatch(/Required check .* is missing/);

  const failedCheck = await recordReviewCheck(repo, spec, command, "failed");
  expect(failedCheck.status, failedCheck.stderr).toBe(0);
  const failedReview = await review();
  expect(failedReview.status).not.toBe(0);
  expect(failedReview.stderr).toMatch(/Required check .* is failed/);

  const passingCheck = await recordReviewCheck(repo, spec, command, "passed");
  expect(passingCheck.status, passingCheck.stderr).toBe(0);
  const ledgerPath = join(repo, ".scratch", "0001-ticket-flow", "sdd.json");
  expect(JSON.parse(readFileSync(ledgerPath, "utf8")).tickets[0].reviewAssignments).toBe(undefined);

  const dispatched = await review();
  expect(dispatched.status, dispatched.stderr).toBe(0);
  const result = JSON.parse(dispatched.stdout) as {
    ticket: string;
    execution: string;
    assignments: {
      id: string;
      agent: string;
      role: string;
      scope: string;
      headSha: string;
      inventory: string[];
      report: string;
      status: string;
    }[];
  };
  expect(result.ticket).toBe("T-0001");
  expect(result.execution).toBe("reviewing");
  expect(result.assignments.length).toBe(1);
  const assignment = result.assignments[0]!;
  expect(assignment.id).toMatch(/^[0-9a-f-]{36}$/i);
  expect(assignment.agent).toBe("sdd-task-reviewer");
  expect(assignment.role).toBe("review");
  expect(assignment.scope).toBe("initial");
  expect(assignment.headSha).toBe(submission.headSha);
  expect(assignment.inventory).toEqual(["feature.ts"]);
  expect(assignment.report).toMatch(/T-0001-review-/);
  expect(assignment.status).toBe("pending");

  const status = await execute(repo, (service) =>
    service.featureInspectionService.status({ spec }),
  );
  expect(status.status, status.stderr).toBe(0);
  expect(JSON.parse(status.stdout).pendingAssignments).toEqual([
    expect.objectContaining({
      ticket: "T-0001",
      id: assignment.id,
      role: "review",
      action: "review",
      report: assignment.report,
      requestedAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
      reportPresent: false,
      status: "pending",
      agent: "sdd-task-reviewer",
      scope: "initial",
    }),
  ]);

  const repeated = await review();
  expect(repeated.status, repeated.stderr).toBe(0);
  expect(JSON.parse(repeated.stdout).assignments[0].id).toBe(assignment.id);
  expect(JSON.parse(repeated.stdout).idempotent).toBe(true);
  const persisted = JSON.parse(readFileSync(ledgerPath, "utf8"));
  expect(persisted.tickets[0].reviewAssignments.length).toBe(1);
  const ticketText = readFileSync(
    join(repo, ".scratch", "0001-ticket-flow", "tickets", "T-0001.md"),
    "utf8",
  );
  expect(ticketText.match(/Initial review assignment recorded/g)?.length).toBe(1);
});

test("rework requires fresh checks and a new review with the prior committed comparison base", async () => {
  const { repo, spec, command, ticketWorkspace, assignment } = await prepareReviewedTicket();
  writeFileSync(join(ticketWorkspace, "feature.ts"), "export const feature = 'reworked';\n");
  commitTicketWorkspace(ticketWorkspace, "rework approved implementation");
  const review = () =>
    execute(repo, (service) =>
      service.reviewService.review({
        spec,
        ticket: "T-0001",
        author: "controller",
      }),
    );
  const stale = await review();
  expect(stale.status).not.toBe(0);
  expect(stale.stderr).toMatch(/Required check .* is stale/i);

  const checks = await recordReviewCheck(repo, spec, command, "passed");
  expect(checks.status, checks.stderr).toBe(0);
  const reviewed = await review();
  expect(reviewed.status, reviewed.stderr).toBe(0);
  const rework = JSON.parse(reviewed.stdout).assignments[0];
  expect(rework.id).not.toBe(assignment.id);
  expect(rework.headSha).not.toBe(assignment.headSha);
  expect(rework.reworkBaseSha).toBe(assignment.headSha);
  expect(rework.status).toBe("pending");
  const ledger = JSON.parse(
    readFileSync(join(repo, ".scratch", "0001-ticket-flow", "sdd.json"), "utf8"),
  );
  expect(ledger.tickets[0].reviewHistory[0].id).toBe(assignment.id);
  expect(ledger.tickets[0].reviewAssignments[0].id).toBe(rework.id);

  const integration = await execute(repo, (service) =>
    service.ticketIntegrationService.integrate({
      spec,
      ticket: "T-0001",
      author: "controller",
    }),
  );
  expect(integration.status).not.toBe(0);
  expect(integration.stderr).toMatch(/review assignment .* pending/i);
});

test("required specialist reviews are justified, distinct, provenance-bound, and gate integration", async () => {
  const { repo, spec, command, submission } = await prepareImplementationForReview();
  const ledgerPath = join(repo, ".scratch", "0001-ticket-flow", "sdd.json");
  const ticketPath = join(repo, ".scratch", "0001-ticket-flow", "tickets", "T-0001.md");
  const requireReview = async (agent: string, details: string) =>
    await execute(repo, (service) =>
      service.reviewService.reviewRequire({
        spec,
        ticket: "T-0001",
        type: agent,
        details,
        author: "controller",
      }),
    );

  const originalLedger = readFileSync(ledgerPath, "utf8");
  const originalTicket = readFileSync(ticketPath, "utf8");
  const unknownAgent = await requireReview("not-in-catalog", "Inspect generated source API usage.");
  expect(unknownAgent.status).not.toBe(0);
  expect(unknownAgent.stderr).toMatch(/unknown.*agent|catalog/i);
  expect(readFileSync(ledgerPath, "utf8")).toBe(originalLedger);
  expect(readFileSync(ticketPath, "utf8")).toBe(originalTicket);

  const ineligibleAgent = await requireReview(
    "sdd-implementer",
    "Inspect generated source API usage.",
  );
  expect(ineligibleAgent.status).not.toBe(0);
  expect(ineligibleAgent.stderr).toMatch(/not explicitly marked review-eligible/i);
  expect(readFileSync(ledgerPath, "utf8")).toBe(originalLedger);
  expect(readFileSync(ticketPath, "utf8")).toBe(originalTicket);

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
  expect(registeredLedger.tickets[0].reviewRequirements.length).toBe(1);
  expect(registeredLedger.tickets[0].reviewRequirements[0].details).toBe(details);
  expect(readFileSync(ticketPath, "utf8")).toMatch(/Specialist review required/);

  const check = await recordReviewCheck(repo, spec, command, "passed");
  expect(check.status, check.stderr).toBe(0);
  const dispatched = await execute(repo, (service) =>
    service.reviewService.review({
      spec,
      ticket: "T-0001",
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
    { agent: "sdd-task-reviewer", role: "review", objective: undefined },
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

  const lateRequirement = await requireReview(
    "sdd-task-reviewer",
    "Check for an unrelated concern.",
  );
  expect(lateRequirement.status).not.toBe(0);
  expect(lateRequirement.stderr).toMatch(/review.*already.*assigned|frozen/i);
  expect(JSON.parse(readFileSync(ledgerPath, "utf8")).tickets[0].reviewRequirements.length).toBe(1);

  const defaultReviewer = assignments.find(
    (assignment) => assignment.agent === "sdd-task-reviewer",
  )!;
  const specialist = assignments.find((assignment) => assignment.agent === "sdd-code-reviewer")!;
  writeFileSync(defaultReviewer.report, "# Comprehensive review\n\nNo defects found.\n");
  writeFileSync(specialist.report, "# Specialist review\n\nNo API defects found.\n");

  const submit = async (assignment: (typeof assignments)[number]) =>
    await execute(repo, (service) =>
      service.submissionService.submit({
        spec,
        ticket: "T-0001",
        assignment: assignment.id,
        result: "passed",
        author: "controller",
      }),
    );
  const defaultSubmitted = await submit(defaultReviewer);
  expect(defaultSubmitted.status, defaultSubmitted.stderr).toBe(0);
  const incompleteIntegration = await execute(repo, (service) =>
    service.ticketIntegrationService.integrate({
      spec,
      ticket: "T-0001",
      author: "controller",
    }),
  );
  expect(incompleteIntegration.status).not.toBe(0);
  expect(incompleteIntegration.stderr).toMatch(/pending|coverage/i);

  const specialistSubmitted = await submit(specialist);
  expect(specialistSubmitted.status, specialistSubmitted.stderr).toBe(0);
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
  const integratedTicket = JSON.parse(
    readFileSync(join(repo, ".scratch", "0001-ticket-flow", "sdd.json"), "utf8"),
  ).tickets[0];
  expect(integratedTicket.execution).toBe("integrated");
  expect(integratedTicket.acceptedEvidence.commitSha).toBe(submission.headSha);
});

test("unavailable specialist submissions preserve the pinned objective separately from result details", async () => {
  const { repo, spec, command } = await prepareImplementationForReview();
  const required = await execute(repo, (service) =>
    service.reviewService.reviewRequire({
      spec,
      ticket: "T-0001",
      type: "sdd-code-reviewer",
      details: "Check generated declarations against the exported runtime API.",
      author: "controller",
    }),
  );
  expect(required.status, required.stderr).toBe(0);
  const check = await recordReviewCheck(repo, spec, command, "passed");
  expect(check.status, check.stderr).toBe(0);
  const dispatched = await execute(repo, (service) =>
    service.reviewService.review({
      spec,
      ticket: "T-0001",
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
      ticket: "T-0001",
      assignment: assignment.id,
      result: "unavailable",
      details: failureDetails,
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);
  const stored = JSON.parse(
    readFileSync(join(repo, ".scratch", "0001-ticket-flow", "sdd.json"), "utf8"),
  ).tickets[0].reviewAssignments.find(
    (candidate: { agent: string }) => candidate.agent === "sdd-code-reviewer",
  );
  expect(stored.role).toBe("review");
  expect(stored.objective).toBe("Check generated declarations against the exported runtime API.");
  expect(stored.details).toBe(failureDetails);
});

test("review freezes the Git-derived mixed-case inventory", async () => {
  const { repo, spec, command, ticketWorkspace } = await prepareImplementationForReview();
  writeFileSync(join(ticketWorkspace, "B.ts"), "export const upper = true;\n");
  writeFileSync(join(ticketWorkspace, "a.ts"), "export const lower = true;\n");
  commitTicketWorkspace(ticketWorkspace, "add mixed-case review files");
  const passingCheck = await refreshReviewCheck(repo, spec, command);
  expect(passingCheck.status, passingCheck.stderr).toBe(0);

  const dispatched = await execute(repo, (service) =>
    service.reviewService.review({
      spec,
      ticket: "T-0001",
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

test("finding registration is explicit, canonical, ticket-local, and idempotent", async () => {
  const { repo, spec, assignment } = await prepareReviewAssignment();
  writeFileSync(assignment.report, "# Review report\n\nThe change has a defect.\n");
  const create = async (
    extra: Partial<Parameters<WorkflowServices["findingService"]["findingCreate"]>[0]> = {},
  ) =>
    await execute(repo, (service) =>
      service.findingService.findingCreate({
        spec,
        ticket: "T-0001",
        assignment: assignment.id,
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
      blocking: boolean;
      status: string;
      summary: string;
      details: string;
      author: string;
      provenance: { report: string; headSha: string }[];
    };
  };
  expect(output.finding.id).toBe("F-0001");
  expect(output.finding).not.toHaveProperty("severity");
  expect(output.finding.blocking).toBe(true);
  expect(output.finding.status).toBe("open");
  expect(output.finding.summary).toBe("Incorrect result for empty input");
  expect(output.finding.details).toMatch(/empty input/);
  expect(output.finding.author).toBe("controller");
  expect(output.finding.provenance).toEqual([
    {
      report: assignment.report,
      headSha: assignment.headSha,
      author: "controller",
      summary: "Incorrect result for empty input",
      details: "The implementation returns a success result for empty input.",
    },
  ]);

  const repeated = await create();
  expect(repeated.status, repeated.stderr).toBe(0);
  expect(JSON.parse(repeated.stdout).finding.id).toBe("F-0001");
  expect(JSON.parse(repeated.stdout).idempotent).toBe(true);

  const cliRegistered = await invokeAsync(repo, [
    "finding",
    "create",
    "--feature",
    spec.replace(/\/spec\.md$/, ""),
    "--ticket",
    "T-0001",
    "--assignment",
    assignment.id,
    "--non-blocking",
    "--summary",
    "A CLI-registered observation",
    "--details",
    "The orchestrator registered this from the assigned review.",
    "--actor",
    "controller",
  ]);
  expect(cliRegistered.status, cliRegistered.stderr).toBe(0);
  expect(cliOutput(cliRegistered).finding.provenance[0].report).toBe(assignment.report);

  const beforeLegacyOptions = readFileSync(
    join(repo, ".scratch", "0001-ticket-flow", "sdd.json"),
    "utf8",
  );
  const legacyOptions = await invokeAsync(repo, [
    "finding",
    "create",
    "--feature",
    spec.replace(/\/spec\.md$/, ""),
    "--ticket",
    "T-0001",
    "--assignment",
    assignment.id,
    "--source",
    assignment.report,
    "--severity",
    "high",
    "--blocking",
    "--summary",
    "Legacy options",
    "--details",
    "This command must be rejected.",
    "--actor",
    "controller",
  ]);
  expect(legacyOptions.status).not.toBe(0);
  expect(legacyOptions.stderr).toMatch(/unknown option.*--source/i);
  expect(readFileSync(join(repo, ".scratch", "0001-ticket-flow", "sdd.json"), "utf8")).toBe(
    beforeLegacyOptions,
  );
  const legacySeverity = await invokeAsync(repo, [
    "finding",
    "create",
    "--feature",
    spec.replace(/\/spec\.md$/, ""),
    "--ticket",
    "T-0001",
    "--assignment",
    assignment.id,
    "--severity",
    "high",
    "--blocking",
    "--summary",
    "Legacy severity",
    "--details",
    "Severity is no longer an input.",
    "--actor",
    "controller",
  ]);
  expect(legacySeverity.status).not.toBe(0);
  expect(legacySeverity.stderr).toMatch(/unknown option.*--severity/i);
  expect(readFileSync(join(repo, ".scratch", "0001-ticket-flow", "sdd.json"), "utf8")).toBe(
    beforeLegacyOptions,
  );

  const ledger = JSON.parse(
    readFileSync(join(repo, ".scratch", "0001-ticket-flow", "sdd.json"), "utf8"),
  );
  expect(ledger.tickets[0].findings.length).toBe(2);
  expect(ledger.tickets[0].findings[0].id).toBe("F-0001");
  const ticketText = readFileSync(
    join(repo, ".scratch", "0001-ticket-flow", "tickets", "T-0001.md"),
    "utf8",
  );
  expect(ticketText).toMatch(/Finding F-0001 registered by controller/);

  const missingBlockingChoice = await execute(repo, (service) =>
    service.findingService.findingCreate({
      spec,
      ticket: "T-0001",
      assignment: assignment.id,
      summary: "Missing blocking choice",
      details: "The blocking policy was omitted.",
      author: "controller",
    }),
  );
  expect(missingBlockingChoice.status).not.toBe(0);
  expect(missingBlockingChoice.stderr).toMatch(/--blocking or --non-blocking/);
  expect(
    JSON.parse(readFileSync(join(repo, ".scratch", "0001-ticket-flow", "sdd.json"), "utf8"))
      .tickets[0].findings.length,
  ).toBe(2);
});

test("review submission derives the report and canonical findings from its assignment", async () => {
  const { repo, spec, assignment } = await prepareReviewAssignment();
  writeFileSync(assignment.report, "# Review report\n\nA blocking issue was found.\n");
  const finding = await execute(repo, (service) =>
    service.findingService.findingCreate({
      spec,
      ticket: "T-0001",
      assignment: assignment.id,
      blocking: true,
      summary: "Acceptance regression",
      details: "The behavior violates an acceptance requirement.",
      author: "controller",
    }),
  );
  expect(finding.status, finding.stderr).toBe(0);

  const submitted = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: assignment.id,
      result: "failed",
      details: "The registered blocker needs correction.",
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);
  expect(JSON.parse(submitted.stdout)).toMatchObject({
    assignment: {
      id: assignment.id,
      report: assignment.report,
      result: "failed",
      findingIds: ["F-0001"],
    },
    report: assignment.report,
    execution: "changes-requested",
  });
  expect(JSON.parse(submitted.stdout).assignment).not.toHaveProperty("noFindings");
});

test("finding IDs restart per ticket and require provenance from that ticket's review", async () => {
  const { repo, spec, assignment, worktreeParent } = await prepareReviewAssignment();
  writeFileSync(assignment.report, "# First ticket review\n\nFinding from the first ticket.\n");
  const firstFinding = await execute(repo, (service) =>
    service.findingService.findingCreate({
      spec,
      ticket: "T-0001",
      assignment: assignment.id,
      nonBlocking: true,
      summary: "First ticket observation",
      details: "This observation belongs to ticket one.",
      author: "controller",
    }),
  );
  expect(firstFinding.status, firstFinding.stderr).toBe(0);
  expect(JSON.parse(firstFinding.stdout).finding.id).toBe("F-0001");
  const firstStatus = await execute(repo, (service) =>
    service.featureInspectionService.status({ spec }),
  );
  expect(firstStatus.status, firstStatus.stderr).toBe(0);
  expect(JSON.parse(firstStatus.stdout).findings[0].finding.blocking).toBe(false);
  expect(
    JSON.parse(firstStatus.stdout).blockers.some((blocker: { reason: string }) =>
      /Finding F-0001/.test(blocker.reason),
    ),
  ).toBe(false);

  const created = await execute(repo, (service) =>
    service.ticketService.ticketCreate({
      spec,
      title: "Second ticket",
      reporter: "requester",
      category: "enhancement",
      author: "controller",
    }),
  );
  expect(created.status, created.stderr).toBe(0);
  const command = "just test::test tests/feature-two.test.ts";
  const required = await execute(repo, (service) =>
    service.checksService.checksRequire({ spec, ticket: "T-0002", command, author: "controller" }),
  );
  expect(required.status, required.stderr).toBe(0);
  const dispatched = await execute(repo, (service) =>
    service.assignmentService.implement({
      spec,
      ticket: "T-0002",
      author: "controller",
      workspace: worktreeParent,
    }),
  );
  expect(dispatched.status, dispatched.stderr).toBe(0);
  const implementation = await execute(repo, (service) =>
    service.assignmentService.implement({
      spec,
      ticket: "T-0002",
      author: "controller",
      workspace: worktreeParent,
    }),
  );
  expect(implementation.status, implementation.stderr).toBe(0);
  const secondWorktree = JSON.parse(dispatched.stdout).assignment.workspace as string;
  writeFileSync(join(secondWorktree, "feature-two.ts"), "export const second = true;\n");
  commitTicketWorkspace(secondWorktree, "implement second ticket");
  const implementationAssignment = JSON.parse(implementation.stdout).assignment as {
    id: string;
    report: string;
  };
  writeFileSync(implementationAssignment.report, "# Second implementation\n\nCompleted.\n");
  const submittedImplementation = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: "T-0002",
      assignment: implementationAssignment.id,
      author: "controller",
    }),
  );
  expect(submittedImplementation.status, submittedImplementation.stderr).toBe(0);
  const check = await execute(repo, (service) =>
    service.checksService.checksRecord({
      spec,
      ticket: "T-0002",
      command,
      result: "passed",
      author: "controller",
    }),
  );
  expect(check.status, check.stderr).toBe(0);
  expect(JSON.parse(check.stdout).record.headSha).toBe(
    JSON.parse(submittedImplementation.stdout).headSha,
  );
  const review = await execute(repo, (service) =>
    service.reviewService.review({
      spec,
      ticket: "T-0002",
      author: "controller",
    }),
  );
  expect(review.status, review.stderr).toBe(0);
  const secondAssignment = JSON.parse(review.stdout).assignments[0] as {
    id: string;
    report: string;
  };
  writeFileSync(secondAssignment.report, "# Second ticket review\n\nFinding from ticket two.\n");
  const wrongTicketAssignment = await execute(repo, (service) =>
    service.findingService.findingCreate({
      spec,
      ticket: "T-0002",
      assignment: assignment.id,
      blocking: true,
      summary: "Wrong ticket assignment",
      details: "This review assignment belongs to T-0001.",
      author: "controller",
    }),
  );
  expect(wrongTicketAssignment.status).not.toBe(0);
  expect(wrongTicketAssignment.stderr).toMatch(/review assignment not found for ticket T-0002/i);
  const secondFinding = await execute(repo, (service) =>
    service.findingService.findingCreate({
      spec,
      ticket: "T-0002",
      assignment: secondAssignment.id,
      blocking: true,
      summary: "Second ticket observation",
      details: "This observation belongs to ticket two.",
      author: "controller",
    }),
  );
  expect(secondFinding.status, secondFinding.stderr).toBe(0);
  expect(JSON.parse(secondFinding.stdout).finding.id).toBe("F-0001");
  expect(JSON.parse(secondFinding.stdout).finding.blocking).toBe(true);
});

test("review submission derives canonical findings and cannot bypass unresolved blockers", async () => {
  const { repo, spec, assignment } = await prepareReviewAssignment();
  writeFileSync(assignment.report, "# Review report\n\nA blocking ticket was found.\n");
  const createFinding = async (assignmentId = assignment.id) =>
    await execute(repo, (service) =>
      service.findingService.findingCreate({
        spec,
        ticket: "T-0001",
        assignment: assignmentId,
        blocking: true,
        summary: "Acceptance regression",
        details: "The behavior violates an acceptance requirement.",
        author: "controller",
      }),
    );
  const created = await createFinding();
  expect(created.status, created.stderr).toBe(0);
  const submit = async () =>
    await execute(repo, (service) =>
      service.submissionService.submit({
        spec,
        ticket: "T-0001",
        assignment: assignment.id,
        result: "passed",
        author: "controller",
      }),
    );

  const wrongAssignment = await createFinding(
    join(repo, ".scratch", "0001-ticket-flow", "reports", "T-0001-implementation.md"),
  );
  expect(wrongAssignment.status).not.toBe(0);
  expect(wrongAssignment.stderr).toMatch(/review assignment not found for ticket T-0001/i);

  const registered = await submit();
  expect(registered.status, registered.stderr).toBe(0);
  const result = JSON.parse(registered.stdout).assignment as {
    result: string;
    findingIds?: string[];
  };
  expect(JSON.parse(registered.stdout).execution).toBe("changes-requested");
  expect(result.result).toBe("passed");
  expect(result.findingIds).toEqual(["F-0001"]);
  const repeatedSubmission = await submit();
  expect(repeatedSubmission.status, repeatedSubmission.stderr).toBe(0);
  expect(JSON.parse(repeatedSubmission.stdout).idempotent).toBe(true);

  const ledgerPath = join(repo, ".scratch", "0001-ticket-flow", "sdd.json");
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  expect(ledger.tickets[0].reviewAssignments[0].findingIds).toEqual(["F-0001"]);
  const accepted = await execute(repo, (service) =>
    service.ticketIntegrationService.integrate({
      spec,
      ticket: "T-0001",
      author: "controller",
    }),
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
    { ticket: "T-0001", action: "adjudicate-findings" },
  ]);
  expect(JSON.stringify(JSON.parse(next.stdout).blockers)).toMatch(/F-0001/);
  expect(JSON.stringify(JSON.parse(status.stdout).blockers)).toMatch(/F-0001/);
  expect(JSON.parse(next.stdout).findings[0].finding.id).toBe("F-0001");
  expect(JSON.parse(status.stdout).findings[0].finding.id).toBe("F-0001");
});

test("submit rejects removed role, report, and finding declaration flags", async () => {
  const { repo, spec, assignment } = await prepareReviewAssignment();
  writeFileSync(assignment.report, "# Review report\n\nNo findings were registered.\n");
  for (const [flag, value] of [
    ["--role", "review"],
    ["--report", assignment.report],
    ["--findings", "F-0001"],
    ["--no-findings", undefined],
  ] as const) {
    const submitted = await invokeAsync(repo, [
      "submit",
      "--feature",
      spec.replace(/\/spec\.md$/, ""),
      "--ticket",
      "T-0001",
      "--assignment",
      assignment.id,
      flag,
      ...(value ? [value] : []),
      "--actor",
      "controller",
    ]);
    expect(submitted.status).not.toBe(0);
    expect(submitted.stderr).toMatch(/unknown option/i);
  }
});

test("review submission permits flag-like text in a parsed option value", async () => {
  const { repo, spec, assignment } = await prepareReviewAssignment();
  writeFileSync(assignment.report, "# Review report\n\nThe report is unavailable for review.\n");
  const details = "--findings";
  const submitted = await invokeAsync(repo, [
    "submit",
    "--feature",
    spec.replace(/\/spec\.md$/, ""),
    "--ticket",
    "T-0001",
    "--assignment",
    assignment.id,
    "--result",
    "unavailable",
    "--details",
    details,
    "--actor",
    "controller",
  ]);

  expect(submitted.status, submitted.stderr).toBe(0);
  const result = cliOutput(submitted) as {
    execution: string;
    assignment: { findingIds?: string[]; details?: string };
  };
  expect(result.execution).toBe("reviewing");
  expect(result.assignment.findingIds).toEqual([]);
  expect(result.assignment.details).toBe(details);
});

test("finding rulings persist, require evidence or rationale, and keep deferral from clearing blockers", async () => {
  const { repo, spec, command, assignment, ticketWorkspace } = await prepareReviewAssignment();
  writeFileSync(assignment.report, "# Review report\n\nRulings need explicit evidence.\n");
  const create = async (blocking: boolean, summary: string) =>
    await execute(repo, (service) =>
      service.findingService.findingCreate({
        spec,
        ticket: "T-0001",
        assignment: assignment.id,
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
        ticket: "T-0001",
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
    join(repo, ".scratch", "0001-ticket-flow", "sdd.json"),
    "utf8",
  );
  const prematureFix = await update("F-0001", "fixed");
  expect(prematureFix.status).not.toBe(0);
  expect(prematureFix.stderr).toMatch(/committed change since every finding observation/i);
  expect(readFileSync(join(repo, ".scratch", "0001-ticket-flow", "sdd.json"), "utf8")).toBe(
    beforeInvalidFix,
  );

  writeFileSync(join(ticketWorkspace, "feature.ts"), "export const feature = false;\n");
  commitTicketWorkspace(ticketWorkspace, "change finding evidence");
  const changedStatus = await execute(repo, (service) =>
    service.featureInspectionService.status({ spec }),
  );
  expect(changedStatus.status, changedStatus.stderr).toBe(0);
  const correctedHeadSha = JSON.parse(changedStatus.stdout).commits[0].headSha as string;
  expect(correctedHeadSha).not.toBe(assignment.headSha);
  const correctedCheck = await recordReviewCheck(repo, spec, command, "passed");
  expect(correctedCheck.status, correctedCheck.stderr).toBe(0);

  const fixed = await update("F-0001", "fixed");
  expect(fixed.status, fixed.stderr).toBe(0);
  expect(JSON.parse(fixed.stdout).finding.status).toBe("fixed");
  expect(JSON.parse(fixed.stdout).finding.verification.headSha).toBe(correctedHeadSha);

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
    followUp: "T-0002",
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
    followUp: "T-0002",
  });
  expect(deferred.status, deferred.stderr).toBe(0);
  expect(JSON.parse(deferred.stdout).finding.status).toBe("deferred");
  expect(JSON.parse(deferred.stdout).finding.followUp).toBe("T-0002");

  const prohibitedStatus = await update("F-0002", "wontfix", { details: "Not doing this." });
  expect(prohibitedStatus.status).not.toBe(0);
  expect(prohibitedStatus.stderr).toMatch(/Invalid finding status/);

  const repeated = await update("F-0002", "deferred", {
    details: "Postponed for later.",
    followUp: "T-0002",
  });
  expect(repeated.status, repeated.stderr).toBe(0);
  expect(JSON.parse(repeated.stdout).idempotent).toBe(true);
  const persisted = JSON.parse(
    readFileSync(join(repo, ".scratch", "0001-ticket-flow", "sdd.json"), "utf8"),
  );
  expect(persisted.tickets[0].findings[0].status).toBe("dismissed");
  expect(persisted.tickets[0].findings[1].status).toBe("deferred");
  expect(persisted.tickets[0].findings[1].history.at(-1).author).toBe("controller");
});

test("finding duplicates link explicitly while preserving every source report provenance", async () => {
  const { repo, spec, assignment } = await prepareReviewAssignment();
  const ledgerPath = join(repo, ".scratch", "0001-ticket-flow", "sdd.json");
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  const secondId = "review-two";
  const secondReport = join(
    repo,
    ".scratch",
    "0001-ticket-flow",
    "reports",
    `T-0001-review-${secondId}.md`,
  );
  const secondAssignment = {
    ...ledger.tickets[0].reviewAssignments[0],
    id: secondId,
    report: secondReport,
  };
  ledger.tickets[0].reviewAssignments.push(secondAssignment);
  const thirdId = "review-three";
  const thirdReport = join(
    repo,
    ".scratch",
    "0001-ticket-flow",
    "reports",
    `T-0001-review-${thirdId}.md`,
  );
  ledger.tickets[0].reviewAssignments.push({
    ...secondAssignment,
    id: thirdId,
    report: thirdReport,
  });
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  writeFileSync(assignment.report, "# First review\n\nA duplicated observation.\n");
  writeFileSync(secondReport, "# Second review\n\nThe same defect is observed.\n");
  writeFileSync(thirdReport, "# Third review\n\nThe same defect is observed.\n");

  const create = async (
    assignmentId: string,
    extra: Partial<Parameters<WorkflowServices["findingService"]["findingCreate"]>[0]> = {},
  ) =>
    await execute(repo, (service) =>
      service.findingService.findingCreate({
        spec,
        ticket: "T-0001",
        assignment: assignmentId,
        nonBlocking: true,
        summary: "Same underlying observation",
        details: "Both reports identify the same behavior.",
        ...extra,
        author: "controller",
      }),
    );

  const first = await create(assignment.id);
  expect(first.status, first.stderr).toBe(0);
  expect(JSON.parse(first.stdout).finding.id).toBe("F-0001");

  const linked = await create(secondId, { link: "F-0001" });
  expect(linked.status, linked.stderr).toBe(0);
  expect(JSON.parse(linked.stdout).finding.id).toBe("F-0001");
  expect(JSON.parse(linked.stdout).finding.provenance).toEqual([
    {
      report: assignment.report,
      headSha: assignment.headSha,
      author: "controller",
      summary: "Same underlying observation",
      details: "Both reports identify the same behavior.",
    },
    {
      report: secondReport,
      headSha: assignment.headSha,
      author: "controller",
      summary: "Same underlying observation",
      details: "Both reports identify the same behavior.",
    },
  ]);
  expect(JSON.parse(linked.stdout).idempotent).toBe(undefined);

  const repeatedLink = await create(secondId, { link: "F-0001" });
  expect(repeatedLink.status, repeatedLink.stderr).toBe(0);
  expect(JSON.parse(repeatedLink.stdout).idempotent).toBe(true);

  const independent = await create(thirdId);
  expect(independent.status, independent.stderr).toBe(0);
  expect(JSON.parse(independent.stdout).finding.id).toBe("F-0002");
  const persisted = JSON.parse(readFileSync(ledgerPath, "utf8"));
  expect(persisted.tickets[0].findings.length).toBe(2);
  expect(persisted.tickets[0].findings[0].provenance.length).toBe(2);
});

test("a fresh linked observation reopens resolved findings and blocks integration until reverified", async () => {
  const { repo, spec, assignment } = await prepareReviewAssignment();
  const initialProvenance: unknown[] = [];
  writeFileSync(assignment.report, "# Initial review\n\nTwo findings require correction.\n");
  const createFinding = async (blocking: boolean, summary: string) =>
    await execute(repo, (service) =>
      service.findingService.findingCreate({
        spec,
        ticket: "T-0001",
        assignment: assignment.id,
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
      ticket: "T-0001",
      assignment: assignment.id,
      result: "failed",
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
        ticket: "T-0001",
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
      ticket: "T-0001",
      author: "controller",
    }),
  );
  expect(freshReview.status, freshReview.stderr).toBe(0);
  const freshAssignment = JSON.parse(freshReview.stdout).assignments[0] as {
    id: string;
    headSha: string;
    report: string;
  };
  expect(freshAssignment.id).not.toBe(assignment.id);
  expect(freshAssignment.headSha).toBe(assignment.headSha);
  writeFileSync(freshAssignment.report, "# Fresh review\n\nBoth observations recur.\n");

  const link = async (finding: string, blocking: boolean, summary: string) =>
    await execute(repo, (service) =>
      service.findingService.findingCreate({
        spec,
        ticket: "T-0001",
        assignment: freshAssignment.id,
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
      ticket: "T-0001",
      assignment: freshAssignment.id,
      result: "passed",
      author: "controller",
    }),
  );
  expect(resubmitted.status, resubmitted.stderr).toBe(0);
  expect(JSON.parse(resubmitted.stdout).execution).toBe("changes-requested");

  const beforeFreshVerification = await execute(repo, (service) =>
    service.ticketIntegrationService.integrate({
      spec,
      ticket: "T-0001",
      author: "controller",
    }),
  );
  expect(beforeFreshVerification.status).not.toBe(0);
  expect(beforeFreshVerification.stderr).toMatch(/F-0001.*blocking|blocking.*F-0001/i);

  const repeatedCommitFix = await update("F-0001", "fixed", {});
  expect(repeatedCommitFix.status).not.toBe(0);
  expect(repeatedCommitFix.stderr).toMatch(/observation|changed content|different commit/i);
  const blockedAccept = await execute(repo, (service) =>
    service.ticketIntegrationService.integrate({
      spec,
      ticket: "T-0001",
      author: "controller",
    }),
  );
  expect(blockedAccept.status).not.toBe(0);
  expect(blockedAccept.stderr).toMatch(/F-0001.*blocking|blocking.*F-0001/i);
});

test("a failed review needs a registered finding and an unavailable review re-dispatches its reviewer", async () => {
  const { repo, spec, assignment } = await prepareReviewAssignment();
  const ledgerPath = join(repo, ".scratch", "0001-ticket-flow", "sdd.json");
  writeFileSync(assignment.report, "# Review report\n\nThe reviewer stopped early.\n");
  const submit = async (id: string, result: "passed" | "failed" | "unavailable") =>
    await execute(repo, (service) =>
      service.submissionService.submit({
        spec,
        ticket: "T-0001",
        assignment: id,
        result,
        ...(result === "passed" ? {} : { details: "The reviewer could not finish." }),
        author: "controller",
      }),
    );
  const next = async () => {
    const result = await execute(repo, (service) => service.deliveryService.next({ spec }));
    expect(result.status, result.stderr).toBe(0);
    return nextSummary(JSON.parse(result.stdout)).join("\n");
  };

  const ledgerBefore = readFileSync(ledgerPath, "utf8");
  const failed = await submit(assignment.id, "failed");
  expect(failed.status).not.toBe(0);
  expect(failed.stderr).toMatch(/failed review requires at least one registered finding/i);
  expect(failed.stderr).toContain(`--assignment ${assignment.id}`);
  expect(readFileSync(ledgerPath, "utf8")).toBe(ledgerBefore);

  const unavailable = await submit(assignment.id, "unavailable");
  expect(unavailable.status, unavailable.stderr).toBe(0);
  expect(JSON.parse(unavailable.stdout).execution).toBe("reviewing");
  const guidance = await next();
  expect(guidance).toContain("T-0001: step ticket:review (ready)");
  expect(guidance).toContain(
    `Review ${assignment.id} (${assignment.agent}) was unavailable; dispatch a new review round for that reviewer.`,
  );
  expect(guidance).toContain(
    "Next: pnpm spindle sdd review --feature .scratch/0001-ticket-flow --ticket T-0001 --actor <acting-agent>",
  );
  expect(guidance).not.toContain("cannot accept findings");
  expect(guidance).not.toContain("sdd correct");

  const redispatched = await execute(repo, (service) =>
    service.reviewService.review({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(redispatched.status, redispatched.stderr).toBe(0);
  const replacement = JSON.parse(redispatched.stdout).assignments[0] as typeof assignment;
  expect(replacement.id).not.toBe(assignment.id);
  expect(replacement.report).not.toBe(assignment.report);
  expect(replacement).toMatchObject({
    agent: assignment.agent,
    scope: "initial",
    status: "pending",
  });
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  expect(ledger.tickets[0].reviewHistory.map((item: { id: string }) => item.id)).toEqual([
    assignment.id,
  ]);
  expect(ledger.tickets[0].reviewAssignments.map((item: { id: string }) => item.id)).toEqual([
    replacement.id,
  ]);
  const repeated = await execute(repo, (service) =>
    service.reviewService.review({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(repeated.status, repeated.stderr).toBe(0);
  expect(JSON.parse(repeated.stdout)).toMatchObject({ idempotent: true });
  expect(JSON.parse(repeated.stdout).assignments[0].id).toBe(replacement.id);

  writeFileSync(replacement.report, "# Review report\n\nNo defects found.\n");
  const passed = await submit(replacement.id, "passed");
  expect(passed.status, passed.stderr).toBe(0);
  expect(await next()).toContain(
    "Next: pnpm spindle sdd integrate --feature .scratch/0001-ticket-flow --ticket T-0001 --actor <acting-agent>",
  );
});

test("parallel ticket reviews all submit before the failed result requests correction", async () => {
  const { repo, spec, command } = await prepareImplementationForReview();
  const ledgerPath = join(repo, ".scratch", "0001-ticket-flow", "sdd.json");
  const required = await execute(repo, (service) =>
    service.reviewService.reviewRequire({
      spec,
      ticket: "T-0001",
      type: "sdd-code-reviewer",
      details: "Check exported API compatibility.",
      author: "controller",
    }),
  );
  expect(required.status, required.stderr).toBe(0);
  expect((await recordReviewCheck(repo, spec, command, "passed")).status).toBe(0);
  const dispatched = await execute(repo, (service) =>
    service.reviewService.review({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(dispatched.status, dispatched.stderr).toBe(0);
  const assignments = JSON.parse(dispatched.stdout).assignments as {
    id: string;
    agent: string;
    report: string;
  }[];
  const general = assignments.find(({ agent }) => agent === "sdd-task-reviewer")!;
  const specialist = assignments.find(({ agent }) => agent === "sdd-code-reviewer")!;
  writeFileSync(general.report, "# Review\n\nA blocking defect.\n");
  writeFileSync(specialist.report, "# Specialist review\n\nNo API defects found.\n");
  const submit = async (id: string, result: "passed" | "failed") =>
    await execute(repo, (service) =>
      service.submissionService.submit({
        spec,
        ticket: "T-0001",
        assignment: id,
        result,
        ...(result === "failed" ? { details: "A blocking defect needs correction." } : {}),
        author: "controller",
      }),
    );
  const next = async () => {
    const result = await execute(repo, (service) => service.deliveryService.next({ spec }));
    expect(result.status, result.stderr).toBe(0);
    return nextSummary(JSON.parse(result.stdout)).join("\n");
  };

  const finding = await execute(repo, (service) =>
    service.findingService.findingCreate({
      spec,
      ticket: "T-0001",
      assignment: general.id,
      blocking: true,
      summary: "Blocking defect",
      details: "The implementation rejects valid input.",
      author: "controller",
    }),
  );
  expect(finding.status, finding.stderr).toBe(0);
  const failed = await submit(general.id, "failed");
  expect(failed.status, failed.stderr).toBe(0);
  expect(JSON.parse(failed.stdout).execution).toBe("reviewing");

  const waiting = await next();
  expect(waiting).toContain("T-0001: step ticket:review (awaiting report)");
  expect(waiting).toContain(
    `pnpm spindle sdd submit --feature .scratch/0001-ticket-flow --ticket T-0001 --assignment ${specialist.id} --result passed --actor <acting-agent>`,
  );
  expect(waiting).not.toContain("sdd correct");
  const earlyCorrection = await execute(repo, (service) =>
    service.correctionService.correct({
      spec,
      ticket: "T-0001",
      findings: ["F-0001"],
      details: "Accept valid input.",
      author: "controller",
    }),
  );
  expect(earlyCorrection.status).not.toBe(0);

  // Older ledgers entered changes-requested on the first failed review of a parallel batch.
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  ledger.tickets[0].execution = "changes-requested";
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  execFileSync("git", ["add", ledgerPath], { cwd: repo });
  execFileSync("git", ["commit", "-qm", "record legacy changes-requested review batch"], {
    cwd: repo,
  });
  const legacyStatus = await execute(repo, (service) =>
    service.featureInspectionService.status({ spec }),
  );
  expect(legacyStatus.status, legacyStatus.stderr).toBe(0);
  const legacy = JSON.parse(legacyStatus.stdout) as {
    actions: { ticket: string; action: string }[];
    pendingAssignments: { id: string }[];
  };
  expect(legacy.actions).toEqual([{ ticket: "T-0001", action: "await-review-report" }]);
  expect(legacy.pendingAssignments.map(({ id }) => id)).toEqual([specialist.id]);
  const legacyNext = await next();
  expect(legacyNext).toContain(`--assignment ${specialist.id} --result passed`);
  expect(legacyNext).not.toContain("sdd correct");

  const remaining = await submit(specialist.id, "passed");
  expect(remaining.status, remaining.stderr).toBe(0);
  expect(JSON.parse(remaining.stdout).execution).toBe("changes-requested");
  const correction = await next();
  expect(correction).toContain("Unresolved findings need a disposition on T-0001:");
  expect(correction).toContain("--finding F-0001 --status confirmed");
});
