import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  commitTicketWorkspace,
  execute,
  prepareReadyTicket,
  prepareImplementationForReview,
  recordReviewCheck,
  prepareReviewedTicket,
  refreshReviewCheck,
} from "@test/Helpers/SubagentDrivenDevelopment/helpers";
import { expect, test } from "vitest";

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
    readFileSync(join(repo, ".spindle/features", "0001-ticket-flow", "sdd.json"), "utf8"),
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
  const ledgerPath = join(repo, ".spindle/features", "0001-ticket-flow", "sdd.json");
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
    join(repo, ".spindle/features", "0001-ticket-flow", "tickets", "T-0001.md"),
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
    readFileSync(join(repo, ".spindle/features", "0001-ticket-flow", "sdd.json"), "utf8"),
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
  const ledgerPath = join(repo, ".spindle/features", "0001-ticket-flow", "sdd.json");
  const ticketPath = join(repo, ".spindle/features", "0001-ticket-flow", "tickets", "T-0001.md");
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
    readFileSync(join(repo, ".spindle/features", "0001-ticket-flow", "sdd.json"), "utf8"),
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
    readFileSync(join(repo, ".spindle/features", "0001-ticket-flow", "sdd.json"), "utf8"),
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
