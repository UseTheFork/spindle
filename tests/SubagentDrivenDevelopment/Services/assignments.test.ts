import { existsSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import { repoRoot } from "../../helpers/TemporaryDirectories.ts";
import { execute, invokeAsync, commitAll, prepareClaimableTicket } from "../helpers/helpers";
import type { WorkflowServices } from "../helpers/WorkflowServices";
test("resume preserves a dispatch and requires confirmation for a controller handoff", async () => {
  const { repo, spec } = await prepareClaimableTicket();
  for (const command of [
    (service: WorkflowServices) =>
      service.assignmentService.claim({ spec, ticket: "T-0001", author: "controller" }),
    (service: WorkflowServices) =>
      service.assignmentService.implement({ spec, ticket: "T-0001", author: "controller" }),
  ]) {
    const result = await execute(repo, command);
    expect(result.status, result.stderr).toBe(0);
  }
  const ledgerPath = join(repo, ".scratch", "0001-claim-flow", "sdd.json");
  const ticketPath = join(repo, ".scratch", "0001-claim-flow", "tickets", "T-0001.md");
  const originalLedger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  const originalAssignment = originalLedger.tickets[0].assignment;
  const beforeStatus = readFileSync(ledgerPath, "utf8");
  const beforeTicket = readFileSync(ticketPath, "utf8");

  const resumed = await execute(repo, (service) =>
    service.assignmentService.resume({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(resumed.status, resumed.stderr).toBe(0);
  expect(JSON.parse(resumed.stdout).gate).toBe("implementing");
  expect(JSON.parse(resumed.stdout).nextAction).toBe("await-implementation-report");
  expect(JSON.parse(resumed.stdout).assignment).toEqual(originalAssignment);
  expect(readFileSync(ledgerPath, "utf8")).toBe(beforeStatus);
  expect(readFileSync(ticketPath, "utf8")).toBe(beforeTicket);
  const repeatedDispatch = await execute(repo, (service) =>
    service.assignmentService.implement({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(repeatedDispatch.status, repeatedDispatch.stderr).toBe(0);
  expect(JSON.parse(repeatedDispatch.stdout).assignment).toEqual(originalAssignment);
  expect(readFileSync(ledgerPath, "utf8")).toBe(beforeStatus);
  expect(readFileSync(ticketPath, "utf8")).toBe(beforeTicket);

  const unconfirmed = await execute(repo, (service) =>
    service.assignmentService.resume({ spec, ticket: "T-0001", author: "replacement" }),
  );
  expect(unconfirmed.status).not.toBe(0);
  expect(unconfirmed.stderr).toMatch(/--confirm-handoff/);
  expect(readFileSync(ledgerPath, "utf8")).toBe(beforeStatus);
  expect(readFileSync(ticketPath, "utf8")).toBe(beforeTicket);

  const handedOff = await execute(repo, (service) =>
    service.assignmentService.resume({
      spec,
      ticket: "T-0001",
      author: "replacement",
      confirmHandoff: true,
    }),
  );
  expect(handedOff.status, handedOff.stderr).toBe(0);
  const output = JSON.parse(handedOff.stdout);
  expect(output.gate).toBe("implementing");
  expect(output.handoffRecorded).toBe(true);
  expect(output.assignment.id).toBe(originalAssignment.id);
  expect(output.assignment.report).toBe(originalAssignment.report);
  expect(output.assignment.controller).toBe("replacement");
  expect(output.assignment.handoffs.at(-1)).toEqual({
    at: output.assignment.handoffs.at(-1).at,
    from: "controller",
    to: "replacement",
    confirmedStopped: true,
  });
});

test("resume recovers dispatch interrupted after replacing only the ticket target", async () => {
  const { repo, spec } = await prepareClaimableTicket();
  const claim = await execute(repo, (service) =>
    service.assignmentService.claim({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(claim.status, claim.stderr).toBe(0);

  const workspace = join(repo, ".scratch", "0001-claim-flow");
  const ticketPath = join(workspace, "tickets", "T-0001.md");
  const ledgerPath = join(workspace, "sdd.json");
  const journalPath = join(workspace, ".sdd-write-recovery.json");
  const ticketBefore = readFileSync(ticketPath, "utf8");
  const ledgerBefore = readFileSync(ledgerPath, "utf8");
  const marker = "INTERRUPTED_AFTER_TICKET_REPLACEMENT";
  const preload = join(repoRoot, "tests/helpers/preloads/interrupt-after-ticket-replacement.ts");
  const interrupted = await invokeAsync(
    repo,
    ["implement", "--spec", spec, "--ticket", "T-0001", "--author", "controller"],
    {
      preload,
      killOnOutput: marker,
      env: {
        SPINDLE_TEST_INTERRUPT_TARGET: ticketPath,
        SPINDLE_TEST_INTERRUPT_MARKER: marker,
      },
    },
  );

  expect(interrupted.signal, interrupted.stderr).toBe("SIGKILL");
  expect(interrupted.stdout).toMatch(new RegExp(marker));
  expect(readFileSync(ticketPath, "utf8") === ticketBefore).toBe(false);
  expect(readFileSync(ledgerPath, "utf8")).toBe(ledgerBefore);
  expect(existsSync(journalPath)).toBe(true);

  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
    version: number;
    writes: { path: string; before: string | null; after: string }[];
  };
  expect(journal.version).toBe(1);
  const ticketWrite = journal.writes.find((write) => write.path === "tickets/T-0001.md")!;
  const ledgerWrite = journal.writes.find((write) => write.path === "sdd.json")!;
  expect(ticketWrite).toBeTruthy();
  expect(ledgerWrite).toBeTruthy();
  expect(ticketWrite.before).toBe(ticketBefore);
  expect(ticketWrite.after).toBe(readFileSync(ticketPath, "utf8"));
  expect(ledgerWrite.before).toBe(ledgerBefore);

  const intendedLedger = JSON.parse(ledgerWrite.after) as {
    tickets: {
      execution: string;
      assignment?: { id: string; report: string };
    }[];
  };
  const intendedProgress = intendedLedger.tickets[0];
  expect(intendedProgress?.assignment).toBeTruthy();
  const originalAssignment = intendedProgress.assignment!;
  expect(intendedProgress.execution).toBe("implementing");
  expect(originalAssignment.report).toBe(join(workspace, "reports", "T-0001-implementation.md"));

  const resumed = await execute(repo, (service) =>
    service.assignmentService.resume({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(resumed.status, resumed.stderr).toBe(0);
  const output = JSON.parse(resumed.stdout);
  expect(output.gate).toBe("implementing");
  expect(output.assignment).toEqual(originalAssignment);
  expect(output.assignment.id).toBe(originalAssignment.id);
  expect(output.assignment.report).toBe(originalAssignment.report);
  expect(readFileSync(ledgerPath, "utf8")).toBe(ledgerWrite.after);
  expect(readFileSync(ticketPath, "utf8")).toBe(ticketWrite.after);
  expect(existsSync(journalPath)).toBe(false);
  const assignmentAudit = `Implementation assignment ${originalAssignment.id} recorded; role=implementation; report=${originalAssignment.report}. No agent was launched.`;
  expect(ticketWrite.after.split(assignmentAudit).length - 1).toBe(1);
  expect(readFileSync(ticketPath, "utf8").split(assignmentAudit).length - 1).toBe(1);
});

test("missing and misdirected reports remain pending without changing the assignment", async () => {
  const { repo, spec } = await prepareClaimableTicket();
  const ledgerPath = join(repo, ".scratch", "0001-claim-flow", "sdd.json");
  const beforeLedger = readFileSync(ledgerPath, "utf8");
  const invalidTransition = await execute(repo, (service) =>
    service.assignmentService.implement({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(invalidTransition.status).not.toBe(0);
  expect(invalidTransition.stderr).toMatch(/must be claimed/);
  expect(readFileSync(ledgerPath, "utf8")).toBe(beforeLedger);
  const claimed = await execute(repo, (service) =>
    service.assignmentService.claim({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(claimed.status, claimed.stderr).toBe(0);
  const implementation = await execute(repo, (service) =>
    service.assignmentService.implement({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(implementation.status, implementation.stderr).toBe(0);
  const expectedReport = JSON.parse(implementation.stdout).assignment.report as string;
  const outsidePath = join(repo, "outside.md");
  writeFileSync(outsidePath, "Outside report.\n");
  rmSync(expectedReport, { force: true });
  symlinkSync(outsidePath, expectedReport);
  const beforeSymlinkLedger = readFileSync(ledgerPath, "utf8");
  const symlinkReport = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: "T-0001",
      role: "implementation",
      author: "controller",
    }),
  );
  expect(symlinkReport.status).not.toBe(0);
  expect(symlinkReport.stderr).toMatch(/regular file/);
  expect(readFileSync(ledgerPath, "utf8")).toBe(beforeSymlinkLedger);
  expect(readFileSync(outsidePath, "utf8")).toBe("Outside report.\n");

  rmSync(expectedReport);
  const beforeLedgerAfterDispatch = readFileSync(ledgerPath, "utf8");
  const missing = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: "T-0001",
      role: "implementation",
      author: "controller",
    }),
  );
  expect(missing.status).not.toBe(0);
  expect(missing.stderr).toMatch(/missing or unavailable/);
  expect(readFileSync(ledgerPath, "utf8")).toBe(beforeLedgerAfterDispatch);

  const outsideReport = join(repo, "outside.md");
  writeFileSync(outsideReport, "Must not register an outside report.\n");
  const misdirected = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: "T-0001",
      role: "implementation",
      report: outsideReport,
      author: "controller",
    }),
  );
  expect(misdirected.status).not.toBe(0);
  expect(misdirected.stderr).toMatch(/does not match the assigned destination/);
  expect(readFileSync(ledgerPath, "utf8")).toBe(beforeLedgerAfterDispatch);
  expect(readFileSync(outsideReport, "utf8")).toBe("Must not register an outside report.\n");
});

test("next and expanded status expose claim actions without mutating workflow state", async () => {
  const { repo, spec, git } = await prepareClaimableTicket();
  const feature = join(repo, ".scratch", "0001-claim-flow");
  const beforeLedger = readFileSync(join(feature, "sdd.json"), "utf8");
  const beforeTicket = readFileSync(join(feature, "tickets", "T-0001.md"), "utf8");
  const beforeGitStatus = git("status", "--porcelain=v1", "--untracked-files=all");

  const next = await execute(repo, (service) => service.deliveryService.next({ spec }));
  const status = await execute(repo, (service) =>
    service.featureInspectionService.status({ spec }),
  );

  expect(next.status, next.stderr).toBe(0);
  expect(status.status, status.stderr).toBe(0);
  expect(JSON.parse(next.stdout).actions).toEqual([{ ticket: "T-0001", action: "claim" }]);
  expect(JSON.parse(next.stdout).pendingAssignments).toEqual([]);
  expect(JSON.parse(next.stdout).blockers).toEqual([]);
  expect(JSON.parse(status.stdout).actions).toEqual(JSON.parse(next.stdout).actions);
  expect(JSON.parse(status.stdout).pendingAssignments).toEqual([]);
  expect(JSON.parse(status.stdout).blockers).toEqual([]);
  expect(readFileSync(join(feature, "sdd.json"), "utf8")).toBe(beforeLedger);
  expect(readFileSync(join(feature, "tickets", "T-0001.md"), "utf8")).toBe(beforeTicket);
  expect(git("status", "--porcelain=v1", "--untracked-files=all")).toBe(beforeGitStatus);

  for (const command of [
    (service: WorkflowServices) =>
      service.assignmentService.claim({ spec, ticket: "T-0001", author: "controller" }),
    (service: WorkflowServices) =>
      service.assignmentService.implement({ spec, ticket: "T-0001", author: "controller" }),
  ]) {
    const result = await execute(repo, command);
    expect(result.status, result.stderr).toBe(0);
  }
  const pendingLedger = readFileSync(join(feature, "sdd.json"), "utf8");
  const pendingTicket = readFileSync(join(feature, "tickets", "T-0001.md"), "utf8");
  const pendingNext = await execute(repo, (service) => service.deliveryService.next({ spec }));
  const pendingStatus = await execute(repo, (service) =>
    service.featureInspectionService.status({ spec }),
  );
  expect(pendingNext.status, pendingNext.stderr).toBe(0);
  expect(pendingStatus.status, pendingStatus.stderr).toBe(0);
  expect(JSON.parse(pendingNext.stdout).actions).toEqual([
    { ticket: "T-0001", action: "await-implementation-report" },
  ]);
  expect(JSON.parse(pendingNext.stdout).pendingAssignments[0]).toEqual({
    ticket: "T-0001",
    id: JSON.parse(pendingStatus.stdout).state.tickets[0].assignment.id,
    role: "implementation",
    action: "implement",
    report: JSON.parse(pendingStatus.stdout).state.tickets[0].assignment.report,
    status: "pending",
  });
  expect(JSON.parse(pendingStatus.stdout).actions).toEqual(JSON.parse(pendingNext.stdout).actions);
  expect(readFileSync(join(feature, "sdd.json"), "utf8")).toBe(pendingLedger);
  expect(readFileSync(join(feature, "tickets", "T-0001.md"), "utf8")).toBe(pendingTicket);
});

test("next and status report dirty checkout as a claim blocker without changing it", async () => {
  const { repo, spec, git } = await prepareClaimableTicket();
  const preparationPath = join(repo, "preparation.md");
  writeFileSync(preparationPath, "Uncommitted preparation input.\n");
  const beforeStatus = git("status", "--porcelain=v1", "--untracked-files=all");
  const beforeLedger = readFileSync(join(repo, ".scratch", "0001-claim-flow", "sdd.json"), "utf8");

  const next = await execute(repo, (service) => service.deliveryService.next({ spec }));
  const status = await execute(repo, (service) =>
    service.featureInspectionService.status({ spec }),
  );

  expect(next.status, next.stderr).toBe(0);
  expect(status.status, status.stderr).toBe(0);
  expect(JSON.parse(next.stdout).actions).toEqual([]);
  expect(JSON.parse(next.stdout).blockers[0].reason).toMatch(/checkout is dirty/i);
  expect(JSON.parse(status.stdout).actions).toEqual([]);
  expect(JSON.parse(status.stdout).blockers[0].reason).toMatch(/checkout is dirty/i);
  expect(readFileSync(preparationPath, "utf8")).toBe("Uncommitted preparation input.\n");
  expect(readFileSync(join(repo, ".scratch", "0001-claim-flow", "sdd.json"), "utf8")).toBe(
    beforeLedger,
  );
  expect(git("status", "--porcelain=v1", "--untracked-files=all")).toBe(beforeStatus);
});

test("next does not recommend implementation from a claimed record without owner and baseline", async () => {
  const { repo, spec } = await prepareClaimableTicket();
  const ledgerPath = join(repo, ".scratch", "0001-claim-flow", "sdd.json");
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  ledger.tickets[0].execution = "claimed";
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  const before = readFileSync(ledgerPath, "utf8");

  const next = await execute(repo, (service) => service.deliveryService.next({ spec }));

  expect(next.status, next.stderr).toBe(0);
  expect(JSON.parse(next.stdout).actions).toEqual([]);
  expect(JSON.parse(next.stdout).blockers[0].reason).toMatch(
    /claim has no recorded owner or baseline/i,
  );
  expect(readFileSync(ledgerPath, "utf8")).toBe(before);

  const resumed = await execute(repo, (service) =>
    service.assignmentService.resume({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(resumed.status, resumed.stderr).toBe(0);
  expect(JSON.parse(resumed.stdout).nextAction).toBe("resolve-claim-blocker");
  expect(readFileSync(ledgerPath, "utf8")).toBe(before);
});

test("status and next block review when a registered implementation report disappears", async () => {
  const { repo, spec } = await prepareClaimableTicket();
  for (const command of [
    (service: WorkflowServices) =>
      service.assignmentService.claim({ spec, ticket: "T-0001", author: "controller" }),
    (service: WorkflowServices) =>
      service.assignmentService.implement({ spec, ticket: "T-0001", author: "controller" }),
  ]) {
    const result = await execute(repo, command);
    expect(result.status, result.stderr).toBe(0);
  }
  const reportPath = join(
    repo,
    ".scratch",
    "0001-claim-flow",
    "reports",
    "T-0001-implementation.md",
  );
  writeFileSync(reportPath, "Registered report.\n");
  const submitted = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: "T-0001",
      role: "implementation",
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);
  rmSync(reportPath);
  const ledgerPath = join(repo, ".scratch", "0001-claim-flow", "sdd.json");
  const ticketPath = join(repo, ".scratch", "0001-claim-flow", "tickets", "T-0001.md");
  const beforeLedger = readFileSync(ledgerPath, "utf8");
  const beforeTicket = readFileSync(ticketPath, "utf8");

  const next = await execute(repo, (service) => service.deliveryService.next({ spec }));
  const status = await execute(repo, (service) =>
    service.featureInspectionService.status({ spec }),
  );

  expect(next.status, next.stderr).toBe(0);
  expect(status.status, status.stderr).toBe(0);
  expect(JSON.parse(next.stdout).actions).toEqual([]);
  expect(JSON.parse(next.stdout).blockers[0].reason).toMatch(/report is missing/);
  expect(JSON.parse(status.stdout).actions).toEqual([]);
  expect(JSON.parse(status.stdout).blockers[0].reason).toMatch(/report is missing/);
  expect(readFileSync(ledgerPath, "utf8")).toBe(beforeLedger);
  expect(readFileSync(ticketPath, "utf8")).toBe(beforeTicket);
  writeFileSync(reportPath, "Altered registered report.\n");
  const changedReport = await execute(repo, (service) => service.deliveryService.next({ spec }));
  expect(changedReport.status, changedReport.stderr).toBe(0);
  expect(JSON.parse(changedReport.stdout).actions).toEqual([]);
  expect(JSON.parse(changedReport.stdout).blockers[0].reason).toMatch(/content changed/);
  expect(readFileSync(ledgerPath, "utf8")).toBe(beforeLedger);
  expect(readFileSync(ticketPath, "utf8")).toBe(beforeTicket);
});

test("claim keeps dependency-blocked tickets unowned", async () => {
  const { repo, git, spec } = await prepareClaimableTicket();
  const created = await execute(repo, (service) =>
    service.ticketService.ticketCreate({
      spec,
      title: "Dependent ticket",
      reporter: "requester",
      category: "enhancement",
      author: "maintainer",
    }),
  );
  expect(created.status, created.stderr).toBe(0);
  const trackerUpdate = await execute(repo, (service) =>
    service.ticketService.ticketUpdate({
      spec,
      ticket: "T-0002",
      blockedBy: ["T-0001"],
      author: "maintainer",
    }),
  );
  expect(trackerUpdate.status, trackerUpdate.stderr).toBe(0);
  const updated = await execute(repo, (service) =>
    service.ticketService.ticketUpdate({
      spec,
      ticket: "T-0002",
      status: "open",
      author: "maintainer",
    }),
  );
  expect(updated.status, updated.stderr).toBe(0);
  commitAll(repo, git, "prepare dependent ticket");
  const ledgerPath = join(repo, ".scratch", "0001-claim-flow", "sdd.json");
  const before = readFileSync(ledgerPath, "utf8");

  const result = await execute(repo, (service) =>
    service.assignmentService.claim({ spec, ticket: "T-0002", author: "controller" }),
  );

  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/open dependencies: T-0001/);
  expect(readFileSync(ledgerPath, "utf8")).toBe(before);
});

test("claim rejects tickets that are blocked without recording ownership", async () => {
  const { repo, git, spec } = await prepareClaimableTicket();
  const updated = await execute(repo, (service) =>
    service.ticketService.ticketUpdate({
      spec,
      ticket: "T-0001",
      blocker: "Requirements need clarification.",
      author: "maintainer",
    }),
  );
  expect(updated.status, updated.stderr).toBe(0);
  commitAll(repo, git, "block ticket");
  const ledgerPath = join(repo, ".scratch", "0001-claim-flow", "sdd.json");
  const before = readFileSync(ledgerPath, "utf8");

  const result = await execute(repo, (service) =>
    service.assignmentService.claim({ spec, ticket: "T-0001", author: "controller" }),
  );

  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/not open and unblocked/);
  expect(readFileSync(ledgerPath, "utf8")).toBe(before);
});

test("implementation dispatch rejects ignored and pre-existing report destinations without overwriting", async () => {
  const ignored = await prepareClaimableTicket();
  writeFileSync(
    join(ignored.repo, ".gitignore"),
    ".scratch/0001-claim-flow/reports/T-0001-implementation.md\n",
  );
  commitAll(ignored.repo, ignored.git, "ignore implementation report");
  const claim = await execute(ignored.repo, (service) =>
    service.assignmentService.claim({ spec: ignored.spec, ticket: "T-0001", author: "controller" }),
  );
  expect(claim.status, claim.stderr).toBe(0);
  const ignoredLedgerPath = join(ignored.repo, ".scratch", "0001-claim-flow", "sdd.json");
  const beforeIgnoredDispatch = readFileSync(ignoredLedgerPath, "utf8");
  const ignoredDispatch = await execute(ignored.repo, (service) =>
    service.assignmentService.implement({
      spec: ignored.spec,
      ticket: "T-0001",
      author: "controller",
    }),
  );
  expect(ignoredDispatch.status).not.toBe(0);
  expect(ignoredDispatch.stderr).toMatch(/path is ignored/);
  expect(readFileSync(ignoredLedgerPath, "utf8")).toBe(beforeIgnoredDispatch);

  const existing = await prepareClaimableTicket();
  const reportPath = join(
    existing.repo,
    ".scratch",
    "0001-claim-flow",
    "reports",
    "T-0001-implementation.md",
  );
  writeFileSync(reportPath, "User-owned report; do not overwrite.\n");
  commitAll(existing.repo, existing.git, "preserve existing report");
  const existingClaim = await execute(existing.repo, (service) =>
    service.assignmentService.claim({
      spec: existing.spec,
      ticket: "T-0001",
      author: "controller",
    }),
  );
  expect(existingClaim.status, existingClaim.stderr).toBe(0);
  const existingLedgerPath = join(existing.repo, ".scratch", "0001-claim-flow", "sdd.json");
  const beforeExistingDispatch = readFileSync(existingLedgerPath, "utf8");
  const existingDispatch = await execute(existing.repo, (service) =>
    service.assignmentService.implement({
      spec: existing.spec,
      ticket: "T-0001",
      author: "controller",
    }),
  );
  expect(existingDispatch.status).not.toBe(0);
  expect(existingDispatch.stderr).toMatch(/already exists and was preserved/);
  expect(readFileSync(reportPath, "utf8")).toBe("User-owned report; do not overwrite.\n");
  expect(readFileSync(existingLedgerPath, "utf8")).toBe(beforeExistingDispatch);
});

test("concurrent public CLI claims grant only one controller ownership", async () => {
  const { repo, git, spec, baseSha } = await prepareClaimableTicket();
  const argumentsFor = (author: string) => [
    "claim",
    "--spec",
    spec,
    "--ticket",
    "T-0001",
    "--author",
    author,
  ];
  const results = await Promise.all([
    invokeAsync(repo, argumentsFor("controller-a")),
    invokeAsync(repo, argumentsFor("controller-b")),
  ]);

  expect(results.filter((result) => result.status === 0).length).toBe(1);
  expect(results.filter((result) => result.status !== 0).length).toBe(1);
  const ledger = JSON.parse(
    readFileSync(join(repo, ".scratch", "0001-claim-flow", "sdd.json"), "utf8"),
  );
  const progress = ledger.tickets[0];
  expect(progress.execution).toBe("claimed");
  expect(["controller-a", "controller-b"].includes(progress.owner)).toBeTruthy();
  expect(progress.baseSha).toBe(baseSha);
  expect(git("rev-parse", "HEAD")).toBe(baseSha);
});

test("concurrent dispatch and submission reuse one assignment and one history entry", async () => {
  const { repo, git, spec, baseSha } = await prepareClaimableTicket();
  const claim = await execute(repo, (service) =>
    service.assignmentService.claim({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(claim.status, claim.stderr).toBe(0);
  const implementArgs = [
    "implement",
    "--spec",
    spec,
    "--ticket",
    "T-0001",
    "--author",
    "controller",
  ];
  const dispatched = await Promise.all([
    invokeAsync(repo, implementArgs),
    invokeAsync(repo, implementArgs),
  ]);
  expect(dispatched.map((result) => result.status)).toEqual([0, 0]);
  const firstAssignment = JSON.parse(dispatched[0]!.stdout).assignment;
  const secondAssignment = JSON.parse(dispatched[1]!.stdout).assignment;
  expect(firstAssignment.id).toBe(secondAssignment.id);
  expect(firstAssignment.report).toBe(secondAssignment.report);
  writeFileSync(firstAssignment.report, "Concurrent implementation report.\n");

  const submitArgs = [
    "submit",
    "--spec",
    spec,
    "--ticket",
    "T-0001",
    "--role",
    "implementation",
    "--report",
    firstAssignment.report,
    "--author",
    "controller",
  ];
  const submissions = await Promise.all([
    invokeAsync(repo, submitArgs),
    invokeAsync(repo, submitArgs),
  ]);

  expect(submissions.map((result) => result.status)).toEqual([0, 0]);
  expect(submissions.filter((result) => JSON.parse(result.stdout).idempotent).length).toBe(1);
  const ticketBody = readFileSync(
    join(repo, ".scratch", "0001-claim-flow", "tickets", "T-0001.md"),
    "utf8",
  );
  expect(ticketBody.match(/Implementation report submitted/g)?.length).toBe(1);
  const ledger = JSON.parse(
    readFileSync(join(repo, ".scratch", "0001-claim-flow", "sdd.json"), "utf8"),
  );
  expect(ledger.tickets[0].assignment.id).toBe(firstAssignment.id);
  expect(ledger.tickets[0].execution).toBe("reviewing");
  expect(git("rev-parse", "HEAD")).toBe(baseSha);
});
