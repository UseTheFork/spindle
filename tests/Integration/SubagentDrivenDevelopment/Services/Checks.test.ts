import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import {
  commitAll,
  execute,
  commitTicketWorkspace,
  prepareImplementationForReview,
  prepareReadyTicket,
  recordReviewCheck,
} from "../../../Helpers/SubagentDrivenDevelopment/helpers";

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

  const dispatched = await execute(repo, (service) =>
    service.assignmentService.implement({
      spec,
      ticket: "T-0001",
      author: "controller",
      workspace: worktreeParent,
    }),
  );
  expect(dispatched.status, dispatched.stderr).toBe(0);
  const dispatch = JSON.parse(dispatched.stdout) as {
    headSha: string;
    assignment: {
      id: string;
      report: string;
      workspace: string;
    };
  };
  const assignment = dispatch.assignment;
  writeFileSync(join(assignment.workspace, "feature.ts"), "export const feature = true;\n");
  commitTicketWorkspace(assignment.workspace, "implement feature");
  writeFileSync(assignment.report, "# Implementation report\n\nCompleted.\n");
  const submitted = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: assignment.id,
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);
  expect(JSON.parse(submitted.stdout).headSha).toBe(
    git("-C", assignment.workspace, "rev-parse", "HEAD"),
  );
  const missing = await execute(repo, (service) =>
    service.reviewService.review({
      spec,
      ticket: "T-0001",
      author: "controller",
    }),
  );
  expect(missing.status).not.toBe(0);
  expect(missing.stderr).toMatch(/Required check .* is missing/);

  const failed = await recordReviewCheck(repo, spec, command, "failed");
  expect(failed.status, failed.stderr).toBe(0);
  const failedReview = await execute(repo, (service) =>
    service.reviewService.review({
      spec,
      ticket: "T-0001",
      author: "controller",
    }),
  );
  expect(failedReview.status).not.toBe(0);
  expect(failedReview.stderr).toMatch(/Required check .* is failed/);
});

test("checks record the exact ticket commit without accepting a caller-supplied identity", async () => {
  const prepared = await prepareImplementationForReview();
  const { repo, spec, command, ticketWorkspace, git } = prepared;
  const passed = await recordReviewCheck(repo, spec, command, "passed");
  expect(passed.status, passed.stderr).toBe(0);
  const before = JSON.parse(passed.stdout).record;
  expect(before.headSha).toBe(git("-C", ticketWorkspace, "rev-parse", "HEAD"));

  writeFileSync(join(ticketWorkspace, "feature.ts"), "export const feature = 'changed';\n");
  commitTicketWorkspace(ticketWorkspace, "change reviewed ticket content");
  const current = await recordReviewCheck(repo, spec, command, "passed");
  expect(current.status, current.stderr).toBe(0);
  expect(JSON.parse(current.stdout).record.headSha).toBe(
    git("-C", ticketWorkspace, "rev-parse", "HEAD"),
  );
  const records = JSON.parse(
    readFileSync(join(repo, ".scratch", "0001-ticket-flow", "sdd.json"), "utf8"),
  ).tickets[0].checks.records;
  expect(records.map((record: { headSha: string }) => record.headSha)).toEqual([
    before.headSha,
    JSON.parse(current.stdout).record.headSha,
  ]);
});

test("checks record explicit failure details and reject uncommitted code", async () => {
  const prepared = await prepareImplementationForReview();
  const { repo, spec, command, ticketWorkspace } = prepared;
  const recorded = await execute(repo, (service) =>
    service.checksService.checksRecord({
      spec,
      ticket: "T-0001",
      command,
      result: "passed",
      author: "controller",
    }),
  );
  expect(recorded.status, recorded.stderr).toBe(0);
  expect(JSON.parse(recorded.stdout).record).not.toHaveProperty("coveredPaths");
  const missingFailureDetails = await execute(repo, (service) =>
    service.checksService.checksRecord({
      spec,
      ticket: "T-0001",
      command,
      result: "failed",
      author: "controller",
    }),
  );
  expect(missingFailureDetails.status).not.toBe(0);
  expect(missingFailureDetails.stderr).toMatch(/details/i);
  const failed = await recordReviewCheck(repo, spec, command, "failed");
  expect(failed.status, failed.stderr).toBe(0);
  expect(JSON.parse(failed.stdout).record.details).toMatch(/required check failed/i);

  writeFileSync(join(ticketWorkspace, "unrelated.ts"), "export const unrelated = true;\n");
  const dirty = await execute(repo, (service) =>
    service.checksService.checksRecord({
      spec,
      ticket: "T-0001",
      command,
      result: "passed",
      author: "controller",
    }),
  );
  expect(dirty.status).not.toBe(0);
  expect(dirty.stderr).toMatch(/commit ticket code/i);
});

test("legacy path-scoped records remain readable and are not reused for new results", async () => {
  const { repo, spec, command, git } = await prepareImplementationForReview();
  const initial = await recordReviewCheck(repo, spec, command, "passed");
  expect(initial.status, initial.stderr).toBe(0);

  const ledgerPath = join(repo, ".scratch", "0001-ticket-flow", "sdd.json");
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  ledger.tickets[0].checks.records[0].coveredPaths = ["feature.ts"];
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  commitAll(repo, git, "preserve a legacy check record");

  const recorded = await recordReviewCheck(repo, spec, command, "passed");
  expect(recorded.status, recorded.stderr).toBe(0);
  expect(JSON.parse(recorded.stdout).record).not.toHaveProperty("coveredPaths");
  expect(JSON.parse(recorded.stdout).idempotent).not.toBe(true);

  const records = JSON.parse(readFileSync(ledgerPath, "utf8")).tickets[0].checks.records;
  expect(records).toHaveLength(2);
  expect(records[0].coveredPaths).toEqual(["feature.ts"]);
  const repeated = await recordReviewCheck(repo, spec, command, "passed");
  expect(repeated.status, repeated.stderr).toBe(0);
  expect(JSON.parse(repeated.stdout).idempotent).toBe(true);
});

test("ticket checks reject uncommitted code and bind the next result to the new commit", async () => {
  const prepared = await prepareImplementationForReview();
  const { repo, spec, ticketId, ticketWorkspace } = prepared;
  const initial = await execute(repo, (service) =>
    service.assignmentService.resume({ spec, ticket: ticketId, author: "controller" }),
  );
  expect(initial.status, initial.stderr).toBe(0);
  const original = JSON.parse(initial.stdout).headSha as string;

  writeFileSync(join(ticketWorkspace, "feature.ts"), "staged value\n");
  execFileSync("git", ["add", "feature.ts"], { cwd: ticketWorkspace });
  const dirty = await recordReviewCheck(repo, spec, prepared.command, "passed");
  expect(dirty.status).not.toBe(0);
  expect(dirty.stderr).toMatch(/commit ticket code/i);

  commitTicketWorkspace(ticketWorkspace, "commit staged code");
  const committed = await execute(repo, (service) =>
    service.assignmentService.resume({ spec, ticket: ticketId, author: "controller" }),
  );
  expect(committed.status, committed.stderr).toBe(0);
  expect(JSON.parse(committed.stdout).headSha).not.toBe(original);
  const recorded = await recordReviewCheck(repo, spec, prepared.command, "passed");
  expect(recorded.status, recorded.stderr).toBe(0);
  expect(JSON.parse(recorded.stdout).record.headSha).toBe(JSON.parse(committed.stdout).headSha);
});

test("a new code commit requires fresh checks", async () => {
  const { repo, spec, command, ticketWorkspace } = await prepareImplementationForReview();
  const recorded = await execute(repo, (service) =>
    service.checksService.checksRecord({
      spec,
      ticket: "T-0001",
      command,
      result: "passed",
      author: "controller",
    }),
  );
  expect(recorded.status, recorded.stderr).toBe(0);

  writeFileSync(join(ticketWorkspace, "unrelated.ts"), "export const unrelated = true;\n");
  commitTicketWorkspace(ticketWorkspace, "add another implementation file");
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

  const fresh = await recordReviewCheck(repo, spec, command, "passed");
  expect(fresh.status, fresh.stderr).toBe(0);
  const current = await review();
  expect(current.status, current.stderr).toBe(0);
});

test("checks reject uncommitted nested repositories", async () => {
  const prepared = await prepareImplementationForReview();
  const { repo, spec, command, ticketWorkspace } = prepared;
  const nested = join(ticketWorkspace, "vendor", "embedded");
  mkdirSync(nested, { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: nested });
  writeFileSync(join(nested, "nested.txt"), "not part of ticket identity\n");

  const recorded = await recordReviewCheck(repo, spec, command, "passed");
  expect(recorded.status).not.toBe(0);
  expect(recorded.stderr).toMatch(/commit ticket code/i);
  expect(
    JSON.parse(readFileSync(join(repo, ".scratch", "0001-ticket-flow", "sdd.json"), "utf8"))
      .tickets[0].checks.records,
  ).toEqual([]);
});

test("recording the same ticket check twice is idempotent", async () => {
  const { repo, spec, command } = await prepareImplementationForReview();
  const first = await recordReviewCheck(repo, spec, command, "passed");
  expect(first.status, first.stderr).toBe(0);
  const firstRecord = JSON.parse(first.stdout).record;

  const repeated = await recordReviewCheck(repo, spec, command, "passed");
  expect(repeated.status, repeated.stderr).toBe(0);
  expect(JSON.parse(repeated.stdout).idempotent).toBe(true);
  expect(JSON.parse(repeated.stdout).record).toEqual(firstRecord);
  expect(
    JSON.parse(readFileSync(join(repo, ".scratch", "0001-ticket-flow", "sdd.json"), "utf8"))
      .tickets[0].checks.records,
  ).toHaveLength(1);
});

test("committed requirements must reach the ticket branch before review", async () => {
  const { repo, git, spec, command, ticketWorkspace } = await prepareImplementationForReview();
  const originalCheck = await recordReviewCheck(repo, spec, command, "passed");
  expect(originalCheck.status, originalCheck.stderr).toBe(0);
  const ticketPath = join(repo, ".scratch", "0001-ticket-flow", "tickets", "T-0001.md");
  const ticketContent = readFileSync(ticketPath, "utf8");
  writeFileSync(
    ticketPath,
    ticketContent.replace(
      "[ACCEPTANCE CRITERIA]\n\n## Comments",
      "The revised scope excludes this behavior.\n\n## Comments",
    ),
  );
  commitAll(repo, git, "commit revised ticket requirements");

  const staleRequirements = await recordReviewCheck(repo, spec, command, "passed");
  expect(staleRequirements.status).not.toBe(0);
  expect(staleRequirements.stderr).toMatch(/current committed requirements/i);

  execFileSync("git", ["rebase", git("rev-parse", "HEAD")], {
    cwd: ticketWorkspace,
    encoding: "utf8",
  });
  const staleCheck = await execute(repo, (service) =>
    service.reviewService.review({
      spec,
      ticket: "T-0001",
      author: "controller",
    }),
  );
  expect(staleCheck.status).not.toBe(0);
  expect(staleCheck.stderr).toMatch(/Required check .* is stale/i);

  const currentCheck = await recordReviewCheck(repo, spec, command, "passed");
  expect(currentCheck.status, currentCheck.stderr).toBe(0);
  const reviewed = await execute(repo, (service) =>
    service.reviewService.review({
      spec,
      ticket: "T-0001",
      author: "controller",
    }),
  );
  expect(reviewed.status, reviewed.stderr).toBe(0);
  expect(JSON.parse(reviewed.stdout).assignments[0].headSha).toBe(
    git("-C", ticketWorkspace, "rev-parse", "HEAD"),
  );
});
