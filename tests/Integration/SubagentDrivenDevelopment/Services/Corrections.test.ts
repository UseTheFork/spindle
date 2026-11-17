import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { GitEvidence } from "@spindle/SubagentDrivenDevelopment/Evidence/GitEvidence";
import { ReportEvidence } from "@spindle/SubagentDrivenDevelopment/Evidence/ReportEvidence";
import { APPROVED_TASK_PLAN_EXCEPTION } from "@spindle/SubagentDrivenDevelopment/Models/Assignments";
import type {
  FeaturePaths,
  FeatureLedger,
  TicketDocument,
  TicketProgress,
} from "@spindle/SubagentDrivenDevelopment/Models/Workflow";
import { LedgerRepository } from "@spindle/SubagentDrivenDevelopment/Persistence/LedgerRepository";
import { TicketRepository } from "@spindle/SubagentDrivenDevelopment/Persistence/TicketRepository";
import { WorkspaceTransaction } from "@spindle/SubagentDrivenDevelopment/Persistence/WorkspaceTransaction";
import { TaskPlanPolicy } from "@spindle/SubagentDrivenDevelopment/Policies/TaskPlanPolicy";
import { WorkflowPolicy } from "@spindle/SubagentDrivenDevelopment/Policies/WorkflowPolicy";
import { FeatureInspectionService } from "@spindle/SubagentDrivenDevelopment/Services/FeatureInspectionService";
import {
  commitTicketWorkspace,
  execute,
  prepareImplementationForReview,
  prepareReviewAssignment,
  recordReviewCheck,
  serviceFixture,
} from "@test/Helpers/SubagentDrivenDevelopment/helpers";
import { nextSummary } from "@test/Helpers/SubagentDrivenDevelopment/StatusSummary";
import type { WorkflowServices } from "@test/Helpers/SubagentDrivenDevelopment/WorkflowServices";
import { expect, test, vi } from "vitest";

async function approvedExceptionFixture(
  options: {
    feature?: string;
    includeApproval?: boolean;
    execution?: TicketProgress["execution"];
  } = {},
) {
  const { repo, app, service } = await serviceFixture();
  const feature: FeaturePaths = {
    feature: options.feature ?? APPROVED_TASK_PLAN_EXCEPTION.feature,
    workspace: repo,
    spec: join(repo, "spec.md"),
    ledger: join(repo, "sdd.json"),
  };
  const commitSha = "a".repeat(40);
  const mergeSha = "b".repeat(40);
  const recordedAt = "2026-11-16T20:00:00.000Z";
  const required = [{ command: "pnpm test", addedAt: recordedAt, addedBy: "controller" }];
  const priorIntegration = {
    commitSha,
    mergeSha,
    postMerge: {
      status: "pending" as const,
      mergeSha,
      checks: { required, records: [] },
    },
    integratedAt: recordedAt,
    integratedBy: "controller",
    files: ["feature.ts"],
  };
  const recoveryIntegration = {
    commitSha: "c".repeat(40),
    mergeSha: "d".repeat(40),
    postMerge: {
      status: "passed" as const,
      mergeSha: "d".repeat(40),
      checks: {
        required,
        records: [
          {
            command: "pnpm test",
            result: "passed" as const,
            author: "controller",
            headSha: "d".repeat(40),
            recordedAt,
          },
        ],
      },
    },
    integratedAt: recordedAt,
    integratedBy: "controller",
    files: ["recovery.ts"],
  };
  const target: TicketProgress = {
    id: APPROVED_TASK_PLAN_EXCEPTION.ticket,
    title: "Existing integrated ticket",
    reporter: "requester",
    category: "enhancement",
    status: "open",
    blockedBy: [],
    tasks: [],
    execution: options.execution ?? "integrated",
    owner: "controller",
    baseSha: commitSha,
    worktree: {
      workspace: repo,
      branch: `tickets/${feature.feature}/${APPROVED_TASK_PLAN_EXCEPTION.ticket}`,
      baseSha: commitSha,
    },
    acceptedEvidence: { commitSha, files: ["feature.ts"] },
    integration: priorIntegration,
    assignment: {
      id: "prior-assignment",
      role: "implementation",
      action: "implement",
      controller: "controller",
      report: join(repo, "old-report.md"),
      requestedAt: recordedAt,
      status: "submitted",
      handoffs: [],
    },
    correctionAttempts: [],
  };
  const recovery: TicketProgress = {
    id: APPROVED_TASK_PLAN_EXCEPTION.recoveryTicket,
    title: "Recovery ticket",
    reporter: "requester",
    category: "enhancement",
    status: "closed",
    blockedBy: [],
    tasks: [],
    execution: "integrated",
    integration: recoveryIntegration,
  };
  const ledger: FeatureLedger = {
    schemaVersion: 4,
    featureId: "0001",
    title: "Ticket Task Dispatch",
    createdBy: "controller",
    createdAt: recordedAt,
    retrospectiveRequired: false,
    reviewPolicy: { version: 1, ticket: ["reviewer"], delivery: ["reviewer"] },
    tickets: [target, recovery],
    delivery: { execution: "unstarted", history: [] },
  };
  const ticket = (id: string, status: TicketDocument["status"], body: string): TicketDocument => ({
    metadata: { id },
    id,
    title: id,
    reporter: "requester",
    category: "enhancement",
    status,
    blocked_by: [],
    body,
    path: join(repo, "tickets", `${id}.md`),
    raw: body,
  });
  const targetTicket = ticket(APPROVED_TASK_PLAN_EXCEPTION.ticket, "open", "T-0004");
  const recoveryTicket = ticket(
    APPROVED_TASK_PLAN_EXCEPTION.recoveryTicket,
    "closed",
    options.includeApproval === false ? "T-0005" : APPROVED_TASK_PLAN_EXCEPTION.approvalComment,
  );
  const inspection = await app.make(FeatureInspectionService);
  const gitEvidence = await app.make(GitEvidence);
  const reports = await app.make(ReportEvidence);
  const tickets = await app.make(TicketRepository);
  const ledgers = await app.make(LedgerRepository);
  const transaction = await app.make(WorkspaceTransaction);
  const workflow = await app.make(WorkflowPolicy);
  vi.spyOn(inspection, "resolveFeature").mockReturnValue(feature);
  vi.spyOn(ledgers, "readLedger").mockReturnValue(ledger);
  vi.spyOn(tickets, "readTickets").mockReturnValue([targetTicket, recoveryTicket]);
  vi.spyOn(tickets, "requireTicket").mockImplementation((_documents, id) =>
    id === recoveryTicket.id ? recoveryTicket : targetTicket,
  );
  vi.spyOn(tickets, "appendAudit").mockImplementation(
    (body, author, details) => `${body}\n${author}: ${details}`,
  );
  vi.spyOn(tickets, "metadata").mockReturnValue(targetTicket.metadata);
  vi.spyOn(workflow, "requireProgress").mockReturnValue(target);
  vi.spyOn(gitEvidence, "commitIdentity").mockReturnValue({ headSha: commitSha });
  vi.spyOn(gitEvidence, "ticketWorkspace").mockReturnValue(repo);
  vi.spyOn(gitEvidence, "headSha").mockReturnValue(commitSha);
  vi.spyOn(gitEvidence, "gitBuffer").mockReturnValue(Buffer.alloc(0));
  vi.spyOn(gitEvidence, "assertTicketCodeCommitted").mockImplementation(() => undefined);
  vi.spyOn(reports, "assertReportPath").mockImplementation(() => undefined);
  const writeWorkflowState = vi
    .spyOn(transaction, "writeWorkflowState")
    .mockImplementation(() => undefined);
  return { repo, service, feature, ledger, target, targetTicket, writeWorkflowState };
}

test("the approved task-plan exception records one atomic, idempotent T-0004 correction", async () => {
  const { feature, service, target, writeWorkflowState } = await approvedExceptionFixture();
  expect(() => TaskPlanPolicy.assertAllAccepted(target)).toThrow(/no task plan/i);

  const options = {
    spec: feature.spec,
    ticket: APPROVED_TASK_PLAN_EXCEPTION.ticket,
    details: "Correct the approved T-0004 behavior.",
    approvedException: true,
    author: "controller",
  };
  const dispatched = service.correctionService.correct(options);

  expect(dispatched.execution).toBe("implementing");
  expect(dispatched.taskPlanException).toMatchObject({
    feature: APPROVED_TASK_PLAN_EXCEPTION.feature,
    ticket: APPROVED_TASK_PLAN_EXCEPTION.ticket,
    recoveryTicket: APPROVED_TASK_PLAN_EXCEPTION.recoveryTicket,
    scope: "one-corrective-cycle",
    controller: "controller",
    objective: options.details,
    approval: {
      author: "User",
      comment: APPROVED_TASK_PLAN_EXCEPTION.approvalComment,
      source: "tickets/T-0005.md",
    },
  });
  expect(dispatched.assignment).toMatchObject({
    action: "correct",
    findingIds: [],
    objective: options.details,
    approvedExceptionId: dispatched.taskPlanException?.id,
    status: "pending",
  });
  expect(dispatched.assignment?.checkFailure).toBeUndefined();
  expect(target.tasks).toEqual([]);
  expect(target.integration).toBeUndefined();
  expect(target.integrationHistory).toHaveLength(1);
  expect(target.acceptedEvidence?.commitSha).toBe("a".repeat(40));
  expect(target.correctionAttempts).toHaveLength(1);
  expect(writeWorkflowState).toHaveBeenCalledTimes(1);
  expect(() => TaskPlanPolicy.assertAllAccepted(target)).not.toThrow();

  const retried = service.correctionService.correct(options);
  expect(retried.idempotent).toBe(true);
  expect(retried.assignment?.id).toBe(dispatched.assignment?.id);
  expect(retried.taskPlanException?.id).toBe(dispatched.taskPlanException?.id);
  expect(writeWorkflowState).toHaveBeenCalledTimes(1);
  expect(() =>
    service.correctionService.correct({ ...options, details: "A second correction." }),
  ).toThrow(/already been used/i);
});

test.each([
  {
    label: "a different feature",
    fixture: { feature: "0002-another-feature" },
    options: {
      ticket: APPROVED_TASK_PLAN_EXCEPTION.ticket,
      author: "controller",
      details: "Correct the behavior.",
    },
    message: /limited to 0001-ticket-task-dispatch\/T-0004/i,
  },
  {
    label: "a different ticket",
    fixture: {},
    options: { ticket: "T-0003", author: "controller", details: "Correct the behavior." },
    message: /limited to 0001-ticket-task-dispatch\/T-0004/i,
  },
  {
    label: "a different owner",
    fixture: {},
    options: {
      ticket: APPROVED_TASK_PLAN_EXCEPTION.ticket,
      author: "not-controller",
      details: "Correct the behavior.",
    },
    message: /owned by controller/i,
  },
  {
    label: "an invalid lifecycle state",
    fixture: { execution: "reviewing" as const },
    options: {
      ticket: APPROVED_TASK_PLAN_EXCEPTION.ticket,
      author: "controller",
      details: "Correct the behavior.",
    },
    message: /current open, integrated, taskless/i,
  },
  {
    label: "missing approval context",
    fixture: { includeApproval: false },
    options: {
      ticket: APPROVED_TASK_PLAN_EXCEPTION.ticket,
      author: "controller",
      details: "Correct the behavior.",
    },
    message: /exact recorded user approval/i,
  },
])("the approved exception rejects $label", async ({ fixture: setup, options, message }) => {
  const { service, feature } = await approvedExceptionFixture(setup);
  expect(() =>
    service.correctionService.correct({
      spec: feature.spec,
      ...options,
      approvedException: true,
    }),
  ).toThrow(message);
});

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
