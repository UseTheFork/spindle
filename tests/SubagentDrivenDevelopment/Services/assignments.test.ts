import { readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import { execute, prepareReadyTicket } from "../helpers/helpers";

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
  expect(git("rev-parse", "HEAD")).toBe(baseSha);
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
  const report = JSON.parse(dispatched.stdout).assignment.report as string;
  const ledger = join(repo, ".scratch", "0001-ticket-flow", "sdd.json");
  const outside = join(repo, "outside.md");
  writeFileSync(outside, "Do not follow this link.\n");
  symlinkSync(outside, report);
  const before = readFileSync(ledger, "utf8");

  const symlinked = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: "T-0001",
      role: "implementation",
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
      role: "implementation",
      author: "controller",
    }),
  );
  expect(missing.status).not.toBe(0);
  expect(missing.stderr).toMatch(/missing or unavailable/);
  expect(readFileSync(ledger, "utf8")).toBe(before);

  const misdirected = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: "T-0001",
      role: "implementation",
      report: outside,
      author: "controller",
    }),
  );
  expect(misdirected.status).not.toBe(0);
  expect(misdirected.stderr).toMatch(/does not match the assigned destination/);
  expect(readFileSync(ledger, "utf8")).toBe(before);
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
