import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  commitRequirementAndRebaseTicket,
  commitTicketWorkspace,
  execute,
  prepareReviewAssignment,
  recordReviewCheck,
} from "@test/Helpers/SubagentDrivenDevelopment/helpers";
import { nextSummary } from "@test/Helpers/SubagentDrivenDevelopment/StatusSummary";
import type { WorkflowServices } from "@test/Helpers/SubagentDrivenDevelopment/WorkflowServices";
import { expect, test } from "vitest";

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
