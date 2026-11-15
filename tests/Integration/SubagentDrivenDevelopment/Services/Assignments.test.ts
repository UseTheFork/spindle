import { readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import { nextSummary } from "@/SubagentDrivenDevelopment/Commands/StatusSummary";

import { runCli } from "../../../Helpers/Cli.ts";
import {
  execute,
  invokeAsync,
  prepareReadyTicket,
  prepareReviewAssignment,
} from "../../../Helpers/SubagentDrivenDevelopment/helpers";

test("implement reserves a ready ticket, creates its worktree, and resumes the same assignment", async () => {
  const { repo, git, spec, worktreeParent, baseSha } = await prepareReadyTicket();
  const dispatched = await execute(repo, (service) =>
    service.assignmentService.implement({
      spec,
      ticket: "T-0001",
      author: "controller",
      workspace: worktreeParent,
    }),
  );
  expect(dispatched.status, dispatched.stderr).toBe(0);
  const first = JSON.parse(dispatched.stdout) as {
    execution: string;
    assignment: {
      id: string;
      report: string;
      workspace: string;
      branch: string;
      status: string;
    };
    headSha: string;
  };
  expect(first.execution).toBe("implementing");
  expect(first.headSha).toBe(baseSha);
  expect(first.assignment).toMatchObject({
    workspace: join(worktreeParent, "0001-ticket-flow-T-0001"),
    branch: "tickets/0001-ticket-flow/T-0001",
    status: "pending",
  });
  expect(git("merge-base", "--is-ancestor", baseSha, "HEAD")).toBe("");
  expect(git("-C", first.assignment.workspace, "rev-parse", "HEAD")).toBe(baseSha);

  const repeat = await execute(repo, (service) =>
    service.assignmentService.implement({
      spec,
      ticket: "T-0001",
      author: "controller",
      workspace: worktreeParent,
    }),
  );
  expect(repeat.status, repeat.stderr).toBe(0);
  expect(JSON.parse(repeat.stdout).assignment).toEqual(first.assignment);

  const conflict = await execute(repo, (service) =>
    service.assignmentService.implement({
      spec,
      ticket: "T-0001",
      author: "replacement",
      workspace: worktreeParent,
    }),
  );
  expect(conflict.status).not.toBe(0);
  expect(conflict.stderr).toContain("Ticket T-0001 is owned by controller");
  expect(conflict.stderr).toContain("--actor replacement");
  expect(conflict.stderr).toContain(
    "resume --ticket T-0001 --feature .scratch/0001-ticket-flow --actor <acting-agent> --confirm-handoff",
  );

  const correctionConflict = await execute(repo, (service) =>
    service.correctionService.correct({
      spec,
      ticket: "T-0001",
      author: "replacement",
      findings: ["F-0001"],
      details: "Correct the finding",
    }),
  );
  expect(correctionConflict.status).not.toBe(0);
  expect(correctionConflict.stderr).toContain("Ticket T-0001 is owned by controller");
  expect(correctionConflict.stderr).toContain("--actor replacement");
  expect(correctionConflict.stderr).toContain("--confirm-handoff");

  const ledgerPath = join(repo, ".scratch", "0001-ticket-flow", "sdd.json");
  const ledgerBeforeConflicts = readFileSync(ledgerPath, "utf8");
  const selection = { spec, ticket: "T-0001", author: "replacement" };
  const otherConflicts: { name: string; run: Parameters<typeof execute>[1] }[] = [
    {
      name: "implementation submission",
      run: (service) =>
        service.submissionService.submit({ ...selection, assignment: first.assignment.id }),
    },
    {
      name: "specialist review",
      run: (service) =>
        service.reviewService.reviewRequire({
          ...selection,
          type: "sdd-task-reviewer",
          details: "Review the ticket",
        }),
    },
    {
      name: "finding registration",
      run: (service) =>
        service.findingService.findingCreate({
          ...selection,
          assignment: "review-assignment",
          blocking: true,
          summary: "Finding",
          details: "Finding details",
        }),
    },
    {
      name: "requirements decision",
      run: (service) =>
        service.requirementsService.requirementsDecide({
          ...selection,
          finding: "F-0001",
          decision: "approved",
          details: "Approved",
        }),
    },
  ];
  for (const { name, run } of otherConflicts) {
    const result = await execute(repo, run);
    expect(result.status, name).not.toBe(0);
    expect(result.stderr, name).toContain("Ticket T-0001 is owned by controller");
    expect(result.stderr, name).toContain("--actor replacement");
    expect(result.stderr, name).toContain("--confirm-handoff");
  }
  expect(readFileSync(ledgerPath, "utf8")).toBe(ledgerBeforeConflicts);

  const resumed = await execute(repo, (service) =>
    service.assignmentService.resume({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(resumed.status, resumed.stderr).toBe(0);
  expect(JSON.parse(resumed.stdout)).toMatchObject({
    gate: "implementing",
    nextAction: "await-implementation-report",
    assignment: first.assignment,
  });
});

test("implement refuses blocked and dependency-unready tickets without persisting an assignment", async () => {
  const { repo, git, spec } = await prepareReadyTicket();
  const second = await execute(repo, (service) =>
    service.ticketService.ticketCreate({
      spec,
      title: "Dependent ticket",
      reporter: "requester",
      category: "enhancement",
      author: "maintainer",
    }),
  );
  expect(second.status, second.stderr).toBe(0);
  const dependency = await execute(repo, (service) =>
    service.ticketService.ticketUpdate({
      spec,
      ticket: "T-0002",
      blockedBy: ["T-0001"],
      author: "maintainer",
    }),
  );
  expect(dependency.status, dependency.stderr).toBe(0);
  const before = readFileSync(join(repo, ".scratch", "0001-ticket-flow", "sdd.json"), "utf8");

  const unready = await execute(repo, (service) =>
    service.assignmentService.implement({
      spec,
      ticket: "T-0002",
      author: "controller",
    }),
  );
  expect(unready.status).not.toBe(0);
  expect(unready.stderr).toMatch(/open dependencies: T-0001/);
  expect(readFileSync(join(repo, ".scratch", "0001-ticket-flow", "sdd.json"), "utf8")).toBe(before);

  const blocked = await execute(repo, (service) =>
    service.ticketService.ticketUpdate({
      spec,
      ticket: "T-0001",
      blocker: "Requirements need clarification.",
      author: "maintainer",
    }),
  );
  expect(blocked.status, blocked.stderr).toBe(0);
  const beforeBlockedDispatch = readFileSync(
    join(repo, ".scratch", "0001-ticket-flow", "sdd.json"),
    "utf8",
  );
  const statusBeforeBlockedDispatch = git("status", "--porcelain=v1", "--untracked-files=all");
  const notReady = await execute(repo, (service) =>
    service.assignmentService.implement({
      spec,
      ticket: "T-0001",
      author: "controller",
    }),
  );
  expect(notReady.status).not.toBe(0);
  expect(notReady.stderr).toMatch(/not open and unblocked/);
  expect(readFileSync(join(repo, ".scratch", "0001-ticket-flow", "sdd.json"), "utf8")).toBe(
    beforeBlockedDispatch,
  );
  expect(git("status", "--porcelain=v1", "--untracked-files=all")).toBe(
    statusBeforeBlockedDispatch,
  );
});

test("resume requires a confirmed controller handoff and preserves assignment identity", async () => {
  const { repo, spec, worktreeParent } = await prepareReadyTicket();
  const dispatched = await execute(repo, (service) =>
    service.assignmentService.implement({
      spec,
      ticket: "T-0001",
      author: "controller",
      workspace: worktreeParent,
    }),
  );
  expect(dispatched.status, dispatched.stderr).toBe(0);
  const assignment = JSON.parse(dispatched.stdout).assignment;
  const ledger = join(repo, ".scratch", "0001-ticket-flow", "sdd.json");
  const before = readFileSync(ledger, "utf8");

  const unconfirmed = await execute(repo, (service) =>
    service.assignmentService.resume({ spec, ticket: "T-0001", author: "replacement" }),
  );
  expect(unconfirmed.status).not.toBe(0);
  expect(unconfirmed.stderr).toMatch(/--confirm-handoff/);
  expect(readFileSync(ledger, "utf8")).toBe(before);

  const handedOff = await execute(repo, (service) =>
    service.assignmentService.resume({
      spec,
      ticket: "T-0001",
      author: "replacement",
      confirmHandoff: true,
    }),
  );
  expect(handedOff.status, handedOff.stderr).toBe(0);
  expect(JSON.parse(handedOff.stdout)).toMatchObject({
    gate: "implementing",
    handoffRecorded: true,
    assignment: {
      id: assignment.id,
      report: assignment.report,
      controller: "replacement",
      handoffs: [{ from: "controller", to: "replacement", confirmedStopped: true }],
    },
  });
});

test("review, submission, integration, and sync share ticket ownership guidance", async () => {
  const { repo, spec, ticketId, assignment } = await prepareReviewAssignment();
  const ledger = join(repo, ".scratch", "0001-ticket-flow", "sdd.json");
  const before = readFileSync(ledger, "utf8");
  const selection = { spec, ticket: ticketId, author: "replacement" };
  const commands: { name: string; run: Parameters<typeof execute>[1] }[] = [
    { name: "review", run: (service) => service.reviewService.review(selection) },
    {
      name: "review submission",
      run: (service) =>
        service.submissionService.submit({
          ...selection,
          assignment: assignment.id,
          result: "passed",
        }),
    },
    {
      name: "integration",
      run: (service) => service.ticketIntegrationService.integrate(selection),
    },
  ];
  for (const { name, run } of commands) {
    const result = await execute(repo, run);
    expect(result.status, name).not.toBe(0);
    expect(result.stderr, name).toContain(`Ticket ${ticketId} is owned by controller`);
    expect(result.stderr, name).toContain("--actor replacement");
    expect(result.stderr, name).toContain("--confirm-handoff");
  }
  const sync = await invokeAsync(repo, [
    "sync",
    "--feature",
    spec.replace(/\/spec\.md$/, ""),
    "--ticket",
    ticketId,
    "--actor",
    "replacement",
  ]);
  expect(sync.status).not.toBe(0);
  expect(sync.stderr).toContain(`Ticket ${ticketId} is owned by controller`);
  expect(sync.stderr).toContain("--actor replacement");
  expect(sync.stderr).toContain("--confirm-handoff");
  expect(readFileSync(ledger, "utf8")).toBe(before);
});

test("implementation submission rejects missing, symlinked, and misdirected reports", async () => {
  const { repo, spec, worktreeParent } = await prepareReadyTicket();
  const dispatched = await execute(repo, (service) =>
    service.assignmentService.implement({
      spec,
      ticket: "T-0001",
      author: "controller",
      workspace: worktreeParent,
    }),
  );
  expect(dispatched.status, dispatched.stderr).toBe(0);
  const assignment = JSON.parse(dispatched.stdout).assignment as { id: string; report: string };
  const { id: assignmentId, report } = assignment;
  const ledger = join(repo, ".scratch", "0001-ticket-flow", "sdd.json");
  const outside = join(repo, "outside.md");
  writeFileSync(outside, "Do not follow this link.\n");
  symlinkSync(outside, report);
  const before = readFileSync(ledger, "utf8");

  const symlinked = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: assignmentId,
      author: "controller",
    }),
  );
  expect(symlinked.status).not.toBe(0);
  expect(symlinked.stderr).toMatch(/regular file/);
  expect(readFileSync(ledger, "utf8")).toBe(before);
  expect(readFileSync(outside, "utf8")).toBe("Do not follow this link.\n");

  rmSync(report);
  const missing = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: assignmentId,
      author: "controller",
    }),
  );
  expect(missing.status).not.toBe(0);
  expect(missing.stderr).toMatch(/missing or unavailable/);
  expect(readFileSync(ledger, "utf8")).toBe(before);
});

test("submission derives implementation role and report from the assignment", async () => {
  const { repo, spec, worktreeParent } = await prepareReadyTicket();
  const dispatched = await execute(repo, (service) =>
    service.assignmentService.implement({
      spec,
      ticket: "T-0001",
      author: "controller",
      workspace: worktreeParent,
    }),
  );
  expect(dispatched.status, dispatched.stderr).toBe(0);
  const assignment = JSON.parse(dispatched.stdout).assignment as { id: string; report: string };
  const unavailable = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: assignment.id,
      result: "unavailable",
      details: "The worker could not return a report.",
      author: "controller",
    }),
  );
  expect(unavailable.status, unavailable.stderr).toBe(0);
  expect(JSON.parse(unavailable.stdout).assignment.status).toBe("unavailable");

  const missing = await execute(repo, (service) => service.deliveryService.next({ spec }));
  expect(missing.status, missing.stderr).toBe(0);
  const missingStatus = JSON.parse(missing.stdout);
  expect(missingStatus.pendingAssignments).toContainEqual(
    expect.objectContaining({ id: assignment.id, status: "unavailable", reportPresent: false }),
  );
  expect(nextSummary(missingStatus).join("\n")).toContain(
    "report: missing  assignment: unavailable",
  );

  writeFileSync(assignment.report, "# Implementation report\n\nCompleted the work.\n");
  const present = await execute(repo, (service) => service.deliveryService.next({ spec }));
  expect(present.status, present.stderr).toBe(0);
  const presentStatus = JSON.parse(present.stdout);
  expect(presentStatus.pendingAssignments).toContainEqual(
    expect.objectContaining({ id: assignment.id, status: "unavailable", reportPresent: true }),
  );
  expect(nextSummary(presentStatus).join("\n")).toContain(
    `pnpm spindle sdd submit --feature .scratch/0001-ticket-flow --ticket T-0001 --assignment ${assignment.id} --actor <acting-agent>`,
  );
  const submitted = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: assignment.id,
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);
  expect(JSON.parse(submitted.stdout)).toMatchObject({
    assignment: { id: assignment.id, report: assignment.report, status: "submitted" },
    report: assignment.report,
  });
  const repeated = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: assignment.id,
      author: "controller",
    }),
  );
  expect(repeated.status, repeated.stderr).toBe(0);
  expect(JSON.parse(repeated.stdout).idempotent).toBe(true);
});

test("next identifies missing and failed ticket checks after implementation submission", async () => {
  const { repo, git, spec, worktreeParent } = await prepareReadyTicket();
  const command = "pnpm run test:export";
  const required = await execute(repo, (service) =>
    service.checksService.checksRequire({
      spec,
      ticket: "T-0001",
      command,
      author: "controller",
    }),
  );
  expect(required.status, required.stderr).toBe(0);

  const dispatched = await execute(repo, (service) =>
    service.assignmentService.implement({
      spec,
      ticket: "T-0001",
      author: "controller",
      workspace: worktreeParent,
    }),
  );
  expect(dispatched.status, dispatched.stderr).toBe(0);
  const assignment = JSON.parse(dispatched.stdout).assignment as {
    id: string;
    report: string;
    workspace: string;
  };
  writeFileSync(join(assignment.workspace, "export.ts"), "export const exportRows = [];\n");
  git("-C", assignment.workspace, "add", "export.ts");
  git("-C", assignment.workspace, "commit", "-qm", "implement export");
  writeFileSync(assignment.report, "# Implementation report\n\nExport behavior is implemented.\n");
  const submitted = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: assignment.id,
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);

  const missing = await execute(repo, (service) => service.deliveryService.next({ spec }));
  expect(missing.status, missing.stderr).toBe(0);
  expect(JSON.parse(missing.stdout).actions).toContainEqual({
    ticket: "T-0001",
    action: "checks",
    checkCommand: command,
  });

  const failed = await execute(repo, (service) =>
    service.checksService.checksRecord({
      spec,
      ticket: "T-0001",
      command,
      result: "failed",
      details: "The export assertion failed.",
      author: "controller",
    }),
  );
  expect(failed.status, failed.stderr).toBe(0);
  const afterFailure = await execute(repo, (service) => service.deliveryService.next({ spec }));
  expect(afterFailure.status, afterFailure.stderr).toBe(0);
  expect(JSON.parse(afterFailure.stdout).actions).toContainEqual({
    ticket: "T-0001",
    action: "correct",
    checkFailure: command,
    continuationRequired: false,
  });
});

test("next and status guide unstarted work to implement without changing workflow state", async () => {
  const { repo, spec } = await prepareReadyTicket();
  const before = readFileSync(join(repo, ".scratch", "0001-ticket-flow", "sdd.json"), "utf8");
  const [next, status] = await Promise.all([
    execute(repo, (service) => service.deliveryService.next({ spec })),
    execute(repo, (service) => service.featureInspectionService.status({ spec })),
  ]);
  expect(next.status, next.stderr).toBe(0);
  expect(status.status, status.stderr).toBe(0);
  expect(JSON.parse(next.stdout).actions).toEqual([{ ticket: "T-0001", action: "implement" }]);
  expect(JSON.parse(status.stdout).actions).toEqual(JSON.parse(next.stdout).actions);
  expect(readFileSync(join(repo, ".scratch", "0001-ticket-flow", "sdd.json"), "utf8")).toBe(before);
});

test("next reports assignment dispatch time and whether its report is ready to submit", async () => {
  const { repo, spec, worktreeParent } = await prepareReadyTicket();
  const dispatched = await execute(repo, (service) =>
    service.assignmentService.implement({
      spec,
      ticket: "T-0001",
      author: "controller",
      workspace: worktreeParent,
    }),
  );
  expect(dispatched.status, dispatched.stderr).toBe(0);
  const assignment = JSON.parse(dispatched.stdout).assignment as {
    id: string;
    report: string;
    requestedAt: string;
  };

  const missing = await execute(repo, (service) => service.deliveryService.next({ spec }));
  expect(missing.status, missing.stderr).toBe(0);
  expect(JSON.parse(missing.stdout).pendingAssignments).toContainEqual(
    expect.objectContaining({
      ticket: "T-0001",
      id: assignment.id,
      requestedAt: assignment.requestedAt,
      reportPresent: false,
    }),
  );

  writeFileSync(assignment.report, "# Implementation report\n\nReady for submission.\n");
  const present = await execute(repo, (service) => service.deliveryService.next({ spec }));
  expect(present.status, present.stderr).toBe(0);
  expect(JSON.parse(present.stdout).pendingAssignments).toContainEqual(
    expect.objectContaining({
      ticket: "T-0001",
      id: assignment.id,
      reportPresent: true,
    }),
  );
});

test("next prints named steps and submits a report only after it exists", async () => {
  const { repo, spec, worktreeParent } = await prepareReadyTicket();
  const feature = spec.replace(/\/spec\.md$/, "");
  const ready = runCli(repo, ["sdd", "next", "--feature", feature], process.env.PATH ?? "");
  expect(ready.status, ready.stderr).toBe(0);
  expect(ready.stdout).toContain("Feature 0001-ticket-flow: step tickets-in-progress");
  expect(ready.stdout).toContain("T-0001: step ticket:implement (ready)");
  expect(ready.stdout).toContain("pnpm spindle sdd implement --feature .scratch/0001-ticket-flow");

  const dispatched = await execute(repo, (service) =>
    service.assignmentService.implement({
      spec,
      ticket: "T-0001",
      author: "controller",
      workspace: worktreeParent,
    }),
  );
  expect(dispatched.status, dispatched.stderr).toBe(0);
  const assignment = JSON.parse(dispatched.stdout).assignment as {
    id: string;
    report: string;
  };

  const waiting = runCli(repo, ["sdd", "next", "--feature", feature], process.env.PATH ?? "");
  expect(waiting.status, waiting.stderr).toBe(0);
  expect(waiting.stdout).toMatch(/T-0001 implementation .* dispatched .+ ago  report: missing/);
  expect(waiting.stdout).toContain("No ready tickets. Wait for the open assignments.");

  writeFileSync(assignment.report, "# Implementation report\n\nCompleted.\n");
  const reportReady = runCli(repo, ["sdd", "next", "--feature", feature], process.env.PATH ?? "");
  expect(reportReady.status, reportReady.stderr).toBe(0);
  expect(reportReady.stdout).toMatch(/report: present, not submitted/);
  expect(reportReady.stdout).toContain(
    `pnpm spindle sdd submit --feature .scratch/0001-ticket-flow --ticket T-0001 --assignment ${assignment.id} --actor <acting-agent>`,
  );
});
