import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import {
  commitAll,
  execute,
  commitTicketWorkspace,
  prepareReviewAssignment,
  prepareImplementationForReview,
  prepareReadyTicket,
  recordReviewCheck,
} from "../helpers/helpers";

test("required checks are declared before implementation and accept only explicit results", async () => {
  const { repo, git, spec, worktreeParent } = await prepareReadyTicket();
  const command = "just test::test tests/example.test.ts";
  const required = await execute(repo, (service) =>
    service.checksService.checksRequire({
      spec,
      ticket: "T-0001",
      command,
      author: "controller",
    }),
  );
  expect(required.status, required.stderr).toBe(0);
  expect(
    JSON.parse(required.stdout).checks.required.map((item: { command: string }) => item.command),
  ).toEqual([command]);
  commitAll(repo, git, "declare required check");

  const dispatched = await execute(repo, (service) =>
    service.assignmentService.implement({
      spec,
      ticket: "T-0001",
      author: "controller",
      workspace: worktreeParent,
    }),
  );
  expect(dispatched.status, dispatched.stderr).toBe(0);
  const assignment = JSON.parse(dispatched.stdout).assignment as { report: string };
  writeFileSync(assignment.report, "# Implementation report\n\nCompleted.\n");
  const submitted = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: "T-0001",
      role: "implementation",
      report: assignment.report,
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);
  const snapshot = JSON.parse(submitted.stdout).snapshot as string;
  const missing = await execute(repo, (service) =>
    service.reviewService.review({
      spec,
      ticket: "T-0001",
      inventory: JSON.stringify(["feature.ts"]),
      author: "controller",
    }),
  );
  expect(missing.status).not.toBe(0);
  expect(missing.stderr).toMatch(/Required check .* is missing/);

  const failed = await recordReviewCheck(repo, spec, command, snapshot, "failed");
  expect(failed.status, failed.stderr).toBe(0);
  const failedReview = await execute(repo, (service) =>
    service.reviewService.review({
      spec,
      ticket: "T-0001",
      inventory: JSON.stringify([]),
      author: "controller",
    }),
  );
  expect(failedReview.status).not.toBe(0);
  expect(failedReview.stderr).toMatch(/Required check .* is failed/);
});

test("passing check evidence becomes stale when reviewed ticket content changes", async () => {
  const prepared = await prepareImplementationForReview();
  const { repo, spec, command, submission, ticketWorkspace } = prepared;
  const passed = await recordReviewCheck(repo, spec, command, submission.snapshot, "passed");
  expect(passed.status, passed.stderr).toBe(0);
  const before = JSON.parse(
    readFileSync(join(repo, ".scratch", "0001-ticket-flow", "sdd.json"), "utf8"),
  ).tickets[0].checks.records[0];
  expect(before.result).toBe("passed");

  writeFileSync(join(ticketWorkspace, "feature.ts"), "export const feature = 'changed';\n");
  commitTicketWorkspace(ticketWorkspace, "change reviewed ticket content");
  const stale = await recordReviewCheck(repo, spec, command, submission.snapshot, "passed");
  expect(stale.status).not.toBe(0);
  expect(stale.stderr).toMatch(/snapshot is stale/i);
});

test("check coverage is limited to declared paths and records explicit failure details", async () => {
  const prepared = await prepareImplementationForReview();
  const { repo, spec, command, submission, ticketWorkspace } = prepared;
  const scoped = await execute(repo, (service) =>
    service.checksService.checksRecord({
      spec,
      ticket: "T-0001",
      snapshot: submission.snapshot,
      command,
      result: "passed",
      paths: ["feature.ts"],
      author: "controller",
    }),
  );
  expect(scoped.status, scoped.stderr).toBe(0);
  expect(JSON.parse(scoped.stdout).record.coveredPaths).toEqual(["feature.ts"]);
  const missingFailureDetails = await execute(repo, (service) =>
    service.checksService.checksRecord({
      spec,
      ticket: "T-0001",
      snapshot: submission.snapshot,
      command,
      result: "failed",
      author: "controller",
    }),
  );
  expect(missingFailureDetails.status).not.toBe(0);
  expect(missingFailureDetails.stderr).toMatch(/details/i);
  const failed = await recordReviewCheck(repo, spec, command, submission.snapshot, "failed");
  expect(failed.status, failed.stderr).toBe(0);
  expect(JSON.parse(failed.stdout).record.details).toMatch(/required check failed/i);

  writeFileSync(join(ticketWorkspace, "unrelated.ts"), "export const unrelated = true;\n");
  const staleScoped = await execute(repo, (service) =>
    service.checksService.checksRecord({
      spec,
      ticket: "T-0001",
      snapshot: submission.snapshot,
      command,
      result: "passed",
      paths: ["feature.ts"],
      author: "controller",
    }),
  );
  expect(staleScoped.status).not.toBe(0);
  expect(staleScoped.stderr).toMatch(/snapshot is stale/i);
});

test("check snapshots distinguish staged, unstaged, and mode changes in a ticket worktree", async () => {
  const prepared = await prepareImplementationForReview();
  const { repo, spec, ticketId, ticketWorkspace } = prepared;
  const initial = await execute(repo, (service) =>
    service.assignmentService.resume({ spec, ticket: ticketId, author: "controller" }),
  );
  expect(initial.status, initial.stderr).toBe(0);
  const original = JSON.parse(initial.stdout).codeSnapshot as string;

  writeFileSync(join(ticketWorkspace, "feature.ts"), "staged value\n");
  execFileSync("git", ["add", "feature.ts"], { cwd: ticketWorkspace });
  const staged = await execute(repo, (service) =>
    service.assignmentService.resume({ spec, ticket: ticketId, author: "controller" }),
  );
  expect(staged.status, staged.stderr).toBe(0);
  expect(JSON.parse(staged.stdout).codeSnapshot).not.toBe(original);

  writeFileSync(join(ticketWorkspace, "feature.ts"), "unstaged value\n");
  const unstaged = await execute(repo, (service) =>
    service.assignmentService.resume({ spec, ticket: ticketId, author: "controller" }),
  );
  expect(unstaged.status, unstaged.stderr).toBe(0);
  expect(JSON.parse(unstaged.stdout).codeSnapshot).not.toBe(JSON.parse(staged.stdout).codeSnapshot);
});

test("content identity rejects nested repositories instead of recording incomplete check evidence", async () => {
  const prepared = await prepareImplementationForReview();
  const { repo, spec, ticketId, command, submission, ticketWorkspace } = prepared;
  const nested = join(ticketWorkspace, "vendor", "embedded");
  mkdirSync(nested, { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: nested });
  writeFileSync(join(nested, "nested.txt"), "not part of ticket identity\n");

  const identity = await execute(repo, (service) =>
    service.assignmentService.resume({ spec, ticket: ticketId, author: "controller" }),
  );
  expect(identity.status).not.toBe(0);
  expect(identity.stderr).toMatch(/nested repository|worktree/i);
  const recorded = await recordReviewCheck(repo, spec, command, submission.snapshot, "passed");
  expect(recorded.status).not.toBe(0);
  expect(recorded.stderr).toMatch(/nested repository|worktree/i);
  expect(
    JSON.parse(readFileSync(join(repo, ".scratch", "0001-ticket-flow", "sdd.json"), "utf8"))
      .tickets[0].checks.records,
  ).toEqual([]);
});

test("ticket worktree identity rejects dirty, changed, and missing submodule content", async () => {
  const { repo, git, spec, worktreeParent } = await prepareReadyTicket();
  const source = join(repo, "..", "submodule-source");
  mkdirSync(source);
  const sourceGit = (...args: string[]) =>
    execFileSync("git", args, { cwd: source, encoding: "utf8" }).trim();
  sourceGit("init", "-q");
  sourceGit("config", "user.name", "Fixture");
  sourceGit("config", "user.email", "fixture@example.invalid");
  writeFileSync(join(source, "tracked.txt"), "submodule base\n");
  sourceGit("add", ".");
  sourceGit("commit", "-qm", "submodule base");
  const baseRevision = sourceGit("rev-parse", "HEAD");
  const submodulePath = "modules/example";
  git("-c", "protocol.file.allow=always", "submodule", "add", "-q", source, submodulePath);
  commitAll(repo, git, "add fixture submodule");

  const command = "just test::test tests/example.test.ts";
  const required = await execute(repo, (service) =>
    service.checksService.checksRequire({ spec, ticket: "T-0001", command, author: "controller" }),
  );
  expect(required.status, required.stderr).toBe(0);
  commitAll(repo, git, "declare required check");

  // The combined dispatch records ownership before identity evaluation. Recover the real ticket
  // worktree by initializing its known Gitlink, then exercise checks against that worktree.
  const dispatched = await execute(repo, (service) =>
    service.assignmentService.implement({
      spec,
      ticket: "T-0001",
      author: "controller",
      workspace: worktreeParent,
    }),
  );
  expect(dispatched.status).not.toBe(0);
  expect(dispatched.stderr).toMatch(/submodule/i);
  const ledgerPath = join(repo, ".scratch", "0001-ticket-flow", "sdd.json");
  const assigned = JSON.parse(readFileSync(ledgerPath, "utf8")).tickets[0];
  const ticketWorkspace = assigned.worktree.workspace as string;
  execFileSync(
    "git",
    ["-c", "protocol.file.allow=always", "submodule", "update", "--init", "--", submodulePath],
    { cwd: ticketWorkspace, encoding: "utf8" },
  );

  const resumed = await execute(repo, (service) =>
    service.assignmentService.resume({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(resumed.status, resumed.stderr).toBe(0);
  const snapshot = JSON.parse(resumed.stdout).snapshot as string;
  const submodule = join(ticketWorkspace, submodulePath);

  writeFileSync(join(submodule, "tracked.txt"), "dirty tracked content\n");
  const dirtyTracked = await recordReviewCheck(repo, spec, command, snapshot, "passed");
  expect(dirtyTracked.status).not.toBe(0);
  expect(dirtyTracked.stderr).toMatch(/submodule/i);
  expect(JSON.parse(readFileSync(ledgerPath, "utf8")).tickets[0].checks.records).toEqual([]);

  writeFileSync(join(submodule, "tracked.txt"), "submodule base\n");
  writeFileSync(join(submodule, "untracked.txt"), "untracked submodule content\n");
  const dirtyUntracked = await execute(repo, (service) =>
    service.assignmentService.resume({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(dirtyUntracked.status).not.toBe(0);
  expect(dirtyUntracked.stderr).toMatch(/submodule/i);

  rmSync(join(submodule, "untracked.txt"));
  writeFileSync(join(submodule, "tracked.txt"), "new submodule revision\n");
  execFileSync("git", ["add", "tracked.txt"], { cwd: submodule });
  execFileSync("git", ["commit", "-qm", "new submodule revision"], { cwd: submodule });
  const changedRevision = await execute(repo, (service) =>
    service.assignmentService.resume({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(changedRevision.status).not.toBe(0);
  expect(changedRevision.stderr).toMatch(/submodule/i);

  execFileSync("git", ["checkout", "-q", baseRevision], { cwd: submodule });
  rmSync(join(ticketWorkspace, submodulePath), { recursive: true, force: true });
  const missingGitlink = await recordReviewCheck(repo, spec, command, snapshot, "passed");
  expect(missingGitlink.status).not.toBe(0);
  expect(missingGitlink.stderr).toMatch(/missing or uninitialized/i);
  expect(JSON.parse(readFileSync(ledgerPath, "utf8")).tickets[0].checks.records).toEqual([]);
});

test("untracked code identity frames file boundaries distinctly in a ticket worktree", async () => {
  const { repo, spec, ticketWorkspace } = await prepareImplementationForReview();
  const secondFileRecord = Buffer.from(
    "path\0b\0index-absent\0worktree-mode:420\0worktree-file\0Y",
  );
  writeFileSync(join(ticketWorkspace, "a"), Buffer.concat([Buffer.from("X"), secondFileRecord]));
  const oneFile = await execute(repo, (service) =>
    service.assignmentService.resume({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(oneFile.status, oneFile.stderr).toBe(0);

  rmSync(join(ticketWorkspace, "a"));
  writeFileSync(join(ticketWorkspace, "a"), "X");
  writeFileSync(join(ticketWorkspace, "b"), "Y");
  const twoFiles = await execute(repo, (service) =>
    service.assignmentService.resume({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(twoFiles.status, twoFiles.stderr).toBe(0);
  expect(JSON.parse(oneFile.stdout).codeSnapshot).not.toBe(
    JSON.parse(twoFiles.stdout).codeSnapshot,
  );
});

test("recording the same ticket check twice is idempotent", async () => {
  const { repo, spec, command, submission } = await prepareImplementationForReview();
  const first = await recordReviewCheck(repo, spec, command, submission.snapshot, "passed");
  expect(first.status, first.stderr).toBe(0);
  const firstRecord = JSON.parse(first.stdout).record;

  const repeated = await recordReviewCheck(repo, spec, command, submission.snapshot, "passed");
  expect(repeated.status, repeated.stderr).toBe(0);
  expect(JSON.parse(repeated.stdout).idempotent).toBe(true);
  expect(JSON.parse(repeated.stdout).record).toEqual(firstRecord);
  expect(
    JSON.parse(readFileSync(join(repo, ".scratch", "0001-ticket-flow", "sdd.json"), "utf8"))
      .tickets[0].checks.records,
  ).toHaveLength(1);
});

test("an approved ticket requirements decision invalidates prior check evidence", async () => {
  const { repo, spec, command, submission, assignment } = await prepareReviewAssignment();
  writeFileSync(assignment.report, "# Review report\n\nA criterion is implicated.\n");
  const finding = await execute(repo, (service) =>
    service.findingService.findingCreate({
      spec,
      ticket: "T-0001",
      source: assignment.report,
      snapshot: assignment.snapshot,
      severity: "high",
      blocking: true,
      summary: "The accepted scope has changed",
      details: "The current ticket requirements include this behavior.",
      author: "controller",
    }),
  );
  expect(finding.status, finding.stderr).toBe(0);
  const submitted = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: "T-0001",
      role: "review",
      assignment: assignment.id,
      report: assignment.report,
      result: "passed",
      findingIds: ["F-0001"],
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);

  const ticketPath = join(repo, ".scratch", "0001-ticket-flow", "tickets", "T-0001.md");
  const ticketContent = readFileSync(ticketPath, "utf8");
  writeFileSync(
    ticketPath,
    ticketContent.replace(
      "[ACCEPTANCE CRITERIA]\n\n## Comments",
      "The revised scope excludes this behavior.\n\n## Comments",
    ),
  );
  const decision = await execute(repo, (service) =>
    service.requirementsService.requirementsDecide({
      spec,
      ticket: "T-0001",
      finding: "F-0001",
      decision: "approved",
      details: "The ticket scope explicitly excludes this behavior.",
      author: "controller",
    }),
  );
  expect(decision.status, decision.stderr).toBe(0);
  expect(JSON.parse(decision.stdout).decision.requirementsSnapshot).not.toBe(
    submission.requirementsSnapshot,
  );

  const stale = await recordReviewCheck(repo, spec, command, submission.snapshot, "passed");
  expect(stale.status).not.toBe(0);
  expect(stale.stderr).toMatch(/snapshot is stale/i);
});
