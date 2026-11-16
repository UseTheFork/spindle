import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { runCli } from "@test/Helpers/Cli";
import {
  claimDelivery,
  commitTicketWorkspace,
  execute,
  commitRequirement,
  integrateReviewedTicket,
  beginDeliveryFinalization,
  finalizeDelivery,
  recordReviewCheck,
  prepareReviewedTicket,
  prepareDeliveryReady,
} from "@test/Helpers/SubagentDrivenDevelopment/helpers";
import { nextSummary } from "@test/Helpers/SubagentDrivenDevelopment/StatusSummary";
import { expect, test, vi } from "vitest";

import { acceptTaskPlan, rehomeTaskWorktreeForFinalizationFixture } from "../Fixtures/TaskPlans";

vi.setConfig({ testTimeout: 60_000 });

test("finish reports pending final validation without claiming the feature is complete", async () => {
  const prepared = await prepareDeliveryReady();
  rehomeTaskWorktreeForFinalizationFixture(prepared.spec, "T-0001", prepared.originalRepo);
  await beginDeliveryFinalization(prepared);
  const settingsPath = join(prepared.repo, ".spindle", "config.json");
  const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
  settings.spindle_package_manager = "npm run";
  writeFileSync(settingsPath, JSON.stringify(settings));
  const featureDirectory = prepared.spec.replace(/\/spec\.md$/, "");
  const result = runCli(
    prepared.repo,
    ["sdd", "finish", "--feature", featureDirectory, "--actor", "controller"],
    process.env.PATH ?? "",
  );

  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toMatch(/final validation is pending/i);
  expect(result.stdout).toContain("npm run spindle sdd checks record");
  expect(result.stdout).not.toMatch(/Finished feature delivery/i);
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
    id: string;
    report: string;
    workspace: string;
  };
  await acceptTaskPlan(first.repo, first.spec, secondId);
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
      assignment: implementationAssignment.id,
      author: "controller",
    }),
  );
  expect(submittedImplementation.status, submittedImplementation.stderr).toBe(0);
  const check = await recordReviewCheck(first.repo, first.spec, command, "passed", secondId);
  expect(check.status, check.stderr).toBe(0);
  const review = await execute(first.repo, (service) =>
    service.reviewService.review({
      spec: first.spec,
      ticket: secondId,
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
      assignment: ticketAssignment.id,
      result: "passed",
      author: "controller",
    }),
  );
  expect(submittedReview.status, submittedReview.stderr).toBe(0);
  await integrateReviewedTicket(
    { ...first, ticketId: secondId, ticketWorkspace: implementationAssignment.workspace },
    true,
  );

  await claimDelivery(first.repo, first.spec);
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
  const recordedDeliveryCheck = await execute(first.repo, (service) =>
    service.checksService.checksRecord({
      ticket: "",
      spec: first.spec,
      scope: "delivery",
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
      assignment: aggregateAssignment.id,
      result: "passed",
      author: "controller",
    }),
  );
  expect(aggregateSubmission.status, aggregateSubmission.stderr).toBe(0);

  const secondTicketPath = join(
    first.repo,
    ".spindle/features",
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
  commitRequirement(
    first.repo,
    ".spindle/features/0001-ticket-flow/tickets/T-0002.md",
    "revise second ticket requirements",
  );
  const staleFinish = await execute(first.repo, (service) =>
    service.deliveryService.finish({
      spec: first.spec,
      author: "controller",
    }),
  );
  expect(staleFinish.status).not.toBe(0);
  expect(staleFinish.stderr).toMatch(
    /final delivery checks are not current and passing|aggregate required reviews are not current and passing/i,
  );
  writeFileSync(secondTicketPath, originalTicket);
  commitRequirement(
    first.repo,
    ".spindle/features/0001-ticket-flow/tickets/T-0002.md",
    "restore second ticket requirements",
  );
  rehomeTaskWorktreeForFinalizationFixture(first.spec, "T-0001", first.originalRepo);
  rehomeTaskWorktreeForFinalizationFixture(first.spec, "T-0002", first.originalRepo);
  const finished = await finalizeDelivery(first);
  expect(finished.completed).toMatchObject({ finished: true, cleanup: "complete" });
});

test("status and next expose delivery assignments, blockers, and finish action without mutation", async () => {
  const { repo, git, spec } = await prepareDeliveryReady();
  const ledgerPath = join(repo, ".spindle/features", "0001-ticket-flow", "sdd.json");
  const ledgerBefore = readFileSync(ledgerPath, "utf8");
  const gitStatusBefore = git("status", "--porcelain");
  const status = await execute(repo, (service) =>
    service.featureInspectionService.status({ spec }),
  );
  const next = await execute(repo, (service) => service.deliveryService.next({ spec }));
  expect(status.status, status.stderr).toBe(0);
  expect(next.status, next.stderr).toBe(0);
  const statusDelivery = JSON.parse(status.stdout).delivery as {
    headSha: string;
    scope: string;
    execution: string;
    action: string;
    retrospectiveRequired: boolean;
    finished: boolean;
    findings: unknown[];
    finalChecks: { command: string }[];
    reviewAssignments: { agent: string; status: string; report: string }[];
    blockers: string[];
  };
  const nextDelivery = JSON.parse(next.stdout).delivery as typeof statusDelivery;
  expect(statusDelivery.scope).toBe("delivery");
  expect(statusDelivery.execution).toBe("reviewing");
  expect(statusDelivery.action).toBe("require-final-checks");
  expect(statusDelivery.headSha).toMatch(/^[0-9a-f]{40,64}$/);
  expect(statusDelivery.retrospectiveRequired).toBe(false);
  expect(statusDelivery.finished).toBe(false);
  expect(statusDelivery.findings).toEqual([]);
  expect(statusDelivery.finalChecks).toEqual([]);
  expect(statusDelivery.reviewAssignments.map(({ agent, status }) => ({ agent, status }))).toEqual([
    { agent: "sdd-reviewer", status: "submitted" },
  ]);
  expect(statusDelivery.blockers).toEqual([]);
  expect(nextDelivery).toEqual(statusDelivery);
  expect(nextSummary(JSON.parse(next.stdout)).join("\n")).toContain(
    "checks require --feature .spindle/features/0001-ticket-flow --scope final --command <check>",
  );
  expect(readFileSync(ledgerPath, "utf8")).toBe(ledgerBefore);
  expect(git("status", "--porcelain")).toBe(gitStatusBefore);
});
