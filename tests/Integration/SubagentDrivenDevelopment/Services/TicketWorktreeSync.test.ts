import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  cliOutput,
  execute,
  invokeAsync,
  recordReviewCheck,
} from "@test/Helpers/SubagentDrivenDevelopment/helpers";
import { nextSummary } from "@test/Helpers/SubagentDrivenDevelopment/StatusSummary";
import {
  gitAt,
  dispatch,
  acceptedTicket,
  integrate,
  integrateWithService,
} from "@test/Helpers/SubagentDrivenDevelopment/TicketWorktreeFixtures";
import { expect, test } from "vitest";

test("sync refuses a divergent ticket branch without moving it", async () => {
  const { root, spec, workspace } = await acceptedTicket();
  const integrated = await integrate(root, spec);
  expect(integrated.status, integrated.stderr).toBe(0);
  const args = [
    "checks",
    "require",
    "--feature",
    spec.replace(/\/spec\.md$/, ""),
    "--ticket",
    "T-0001",
    "--scope",
    "post-merge",
    "--command",
    "post-merge test",
    "--actor",
    "controller",
  ];
  const required = await invokeAsync(root, args);
  expect(required.status, required.stderr).toBe(0);
  const failed = await invokeAsync(root, [
    "checks",
    "record",
    "--feature",
    spec.replace(/\/spec\.md$/, ""),
    "--ticket",
    "T-0001",
    "--scope",
    "post-merge",
    "--command",
    "post-merge test",
    "--result",
    "failed",
    "--details",
    "Post-merge validation found a defect.",
    "--actor",
    "controller",
  ]);
  expect(failed.status, failed.stderr).toBe(0);
  gitAt(workspace, "commit", "--allow-empty", "-qm", "diverge after integration");
  const divergentHead = gitAt(workspace, "rev-parse", "HEAD");

  const synced = await invokeAsync(root, [
    "sync",
    "--feature",
    spec.replace(/\/spec\.md$/, ""),
    "--ticket",
    "T-0001",
    "--actor",
    "controller",
  ]);
  expect(synced.status).not.toBe(0);
  expect(synced.stderr).toMatch(/diverg|fast-forward/i);
  expect(gitAt(workspace, "rev-parse", "HEAD")).toBe(divergentHead);
});

test("sync adopts a manually rebased review baseline and archives submitted reviews", async () => {
  const { root, spec, workspace } = await acceptedTicket();
  const ledgerPath = join(dirname(spec), "sdd.json");
  const before = JSON.parse(readFileSync(ledgerPath, "utf8"));
  const oldBase = before.tickets[0].baseSha as string;
  const oldReview = before.tickets[0].reviewAssignments[0];
  writeFileSync(join(root, "independent.ts"), "export const independent = true;\n");
  gitAt(root, "add", "independent.ts");
  gitAt(root, "commit", "-qm", "advance feature baseline");
  const currentBase = gitAt(root, "rev-parse", "HEAD");
  gitAt(workspace, "rebase", currentBase);
  const ticketHead = gitAt(workspace, "rev-parse", "HEAD");

  const synced = await invokeAsync(root, [
    "sync",
    "--feature",
    spec.replace(/\/spec\.md$/, ""),
    "--ticket",
    "T-0001",
    "--actor",
    "controller",
  ]);
  expect(synced.status, synced.stderr).toBe(0);
  expect(cliOutput(synced)).toMatchObject({
    mode: "review-baseline",
    baseSha: currentBase,
    headSha: ticketHead,
  });
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  expect(ledger.tickets[0]).toMatchObject({
    baseSha: currentBase,
    worktree: { baseSha: currentBase },
    baselineHistory: [
      {
        from: oldBase,
        to: currentBase,
        ticketHead,
        author: "controller",
      },
    ],
    reviewHistory: [{ id: oldReview.id, status: "submitted" }],
  });
  expect(ledger.tickets[0].reviewAssignments).toBeUndefined();
  const repeated = await invokeAsync(root, [
    "sync",
    "--feature",
    spec.replace(/\/spec\.md$/, ""),
    "--ticket",
    "T-0001",
    "--actor",
    "controller",
  ]);
  expect(repeated.status, repeated.stderr).toBe(0);
  expect(cliOutput(repeated).idempotent).toBe(true);
});

test("a reviewed post-merge correction preserves failures and requires fresh checks on its new merge", async () => {
  const { root, spec, workspace, parent } = await acceptedTicket();
  const initial = await integrateWithService(root, spec);
  expect(initial.status, initial.stderr).toBe(0);
  const oldMerge = JSON.parse(initial.stdout).mergeCommit as string;
  const declared = await execute(root, (services) =>
    services.checksService.checksRequire({
      spec,
      ticket: "T-0001",
      scope: "post-merge",
      command: ["integration test", "smoke"],
      author: "controller",
    }),
  );
  expect(declared.status, declared.stderr).toBe(0);
  const failed = await execute(root, (services) =>
    services.checksService.checksRecord({
      spec,
      ticket: "T-0001",
      scope: "post-merge",
      command: "integration test",
      result: "failed",
      details: "Integration defect.",
      author: "controller",
    }),
  );
  expect(failed.status, failed.stderr).toBe(0);
  const second = await dispatch(root, spec, parent, "T-0002");
  writeFileSync(join(second.assignment.workspace, "second.ts"), "second ticket\n");
  gitAt(second.assignment.workspace, "add", "second.ts");
  gitAt(second.assignment.workspace, "commit", "-qm", "second ticket");
  writeFileSync(second.assignment.report, "# Second implementation\n");
  const secondSubmitted = await execute(root, (services) =>
    services.submissionService.submit({
      spec,
      ticket: "T-0002",
      assignment: second.assignment.id,
      author: "controller",
    }),
  );
  expect(secondSubmitted.status, secondSubmitted.stderr).toBe(0);
  const correctionOptions = {
    spec,
    ticket: "T-0001",
    checkFailure: "integration test",
    details: "Fix the integration defect.",
    author: "controller",
  };
  const beforeSync = await execute(root, (services) =>
    services.correctionService.correct(correctionOptions),
  );
  expect(beforeSync.status).not.toBe(0);
  expect(beforeSync.stderr).toMatch(/sdd sync/i);
  writeFileSync(join(workspace, "private.txt"), "preserve user work\n");
  const dirtySync = await execute(root, (services) =>
    services.ticketSyncService.sync({
      spec,
      ticket: "T-0001",
      author: "controller",
    }),
  );
  expect(dirtySync.status).not.toBe(0);
  expect(dirtySync.stderr).toMatch(/clean/i);
  expect(readFileSync(join(workspace, "private.txt"), "utf8")).toBe("preserve user work\n");
  rmSync(join(workspace, "private.txt"));
  const synced = await execute(root, (services) =>
    services.ticketSyncService.sync({
      spec,
      ticket: "T-0001",
      author: "controller",
    }),
  );
  expect(synced.status, synced.stderr).toBe(0);
  expect(JSON.parse(synced.stdout).mergeCommit).toBe(oldMerge);
  expect(gitAt(workspace, "rev-parse", "HEAD")).toBe(oldMerge);
  const repeatedSync = await execute(root, (services) =>
    services.ticketSyncService.sync({
      spec,
      ticket: "T-0001",
      author: "controller",
    }),
  );
  expect(repeatedSync.status, repeatedSync.stderr).toBe(0);
  expect(JSON.parse(repeatedSync.stdout).idempotent).toBe(true);
  const nextAfterSync = await invokeAsync(root, [
    "next",
    "--feature",
    spec.replace(/\/spec\.md$/, ""),
  ]);
  expect(nextAfterSync.status, nextAfterSync.stderr).toBe(0);
  const nextAfterSyncSummary = nextSummary(cliOutput(nextAfterSync)).join("\n");
  expect(nextAfterSyncSummary).toContain("step ticket:correct (judgment required)");
  expect(nextAfterSyncSummary).toContain("--check-failure 'integration test'");
  const unauthorized = await execute(root, (services) =>
    services.correctionService.correct({
      ...correctionOptions,
      author: "intruder",
    }),
  );
  expect(unauthorized.status).not.toBe(0);
  writeFileSync(join(workspace, "private.txt"), "preserve user work\n");
  const dirty = await execute(root, (services) =>
    services.correctionService.correct(correctionOptions),
  );
  expect(dirty.status).not.toBe(0);
  expect(readFileSync(join(workspace, "private.txt"), "utf8")).toBe("preserve user work\n");
  rmSync(join(workspace, "private.txt"));
  const originalSpec = readFileSync(spec, "utf8");
  writeFileSync(spec, `${originalSpec}\nChanged requirement.\n`);
  const stale = await execute(root, (services) =>
    services.correctionService.correct(correctionOptions),
  );
  expect(stale.status).not.toBe(0);
  expect(stale.stderr).toMatch(/uncommitted changes/i);
  writeFileSync(spec, originalSpec);
  const prerequisite = await execute(root, (services) =>
    services.ticketService.ticketUpdate({
      spec,
      ticket: "T-0001",
      blockedBy: ["T-0002"],
      author: "controller",
    }),
  );
  expect(prerequisite.status, prerequisite.stderr).toBe(0);
  const dependencyBlocked = await execute(root, (services) =>
    services.correctionService.correct(correctionOptions),
  );
  expect(dependencyBlocked.status).not.toBe(0);
  expect(dependencyBlocked.stderr).toMatch(/T-0002.*not closed/i);
  const cleared = await execute(root, (services) =>
    services.ticketService.ticketUpdate({
      spec,
      ticket: "T-0001",
      clearBlockedBy: true,
      author: "controller",
    }),
  );
  expect(cleared.status, cleared.stderr).toBe(0);
  const dispatched = await execute(root, (services) =>
    services.correctionService.correct(correctionOptions),
  );
  expect(dispatched.status, dispatched.stderr).toBe(0);
  const assignment = JSON.parse(dispatched.stdout).assignment as { id: string; report: string };
  let ledger = JSON.parse(readFileSync(join(dirname(spec), "sdd.json"), "utf8"));
  expect(ledger.tickets[0].integration).toBeUndefined();
  expect(ledger.tickets[0].integrationHistory[0].postMerge.checks.records[0].result).toBe("failed");
  writeFileSync(join(workspace, "first.ts"), "corrected\n");
  gitAt(workspace, "add", "first.ts");
  gitAt(workspace, "commit", "-qm", "fix integration defect");
  writeFileSync(assignment.report, "# Correction\n\nFixed integration.\n");
  const submitted = await execute(root, (services) =>
    services.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: assignment.id,
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);
  const check = await recordReviewCheck(root, spec, "test ticket", "passed");
  expect(check.status, check.stderr).toBe(0);
  const review = await execute(root, (services) =>
    services.reviewService.review({
      spec,
      ticket: "T-0001",
      author: "controller",
    }),
  );
  expect(review.status, review.stderr).toBe(0);
  const reviewer = JSON.parse(review.stdout).assignments[0] as { id: string; report: string };
  writeFileSync(reviewer.report, "# Review\n\nCorrected.\n");
  const approved = await execute(root, (services) =>
    services.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: reviewer.id,
      result: "passed",
      author: "controller",
    }),
  );
  expect(approved.status, approved.stderr).toBe(0);
  const merged = await integrateWithService(root, spec);
  expect(merged.status, merged.stderr).toBe(0);
  const newMerge = JSON.parse(merged.stdout).mergeCommit as string;
  expect(newMerge).not.toBe(oldMerge);
  ledger = JSON.parse(readFileSync(join(dirname(spec), "sdd.json"), "utf8"));
  expect(ledger.tickets[0].status).toBe("open");
  expect(ledger.tickets[0].integrationHistory[0].postMerge.checks.records[0].headSha).toBe(
    oldMerge,
  );
  expect(ledger.tickets[0].integration.postMerge.status).toBe("pending");
  expect(
    ledger.tickets[0].integration.postMerge.checks.required.map(
      (item: { command: string }) => item.command,
    ),
  ).toEqual(["integration test", "smoke"]);
  expect(ledger.tickets[0].integration.postMerge.checks.records).toEqual([]);
  const ledgerPath = join(dirname(spec), "sdd.json");
  const intactLedger = readFileSync(ledgerPath, "utf8");
  ledger.tickets[0].integration.postMerge.checks.required.pop();
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  const malformed = await execute(root, (services) =>
    services.featureInspectionService.status({ spec }),
  );
  expect(malformed.status).not.toBe(0);
  writeFileSync(ledgerPath, intactLedger);
  const omitted = await execute(root, (services) =>
    services.checksService.checksRequire({
      spec,
      ticket: "T-0001",
      scope: "post-merge",
      command: ["smoke"],
      author: "controller",
    }),
  );
  expect(omitted.status).not.toBe(0);
  const fresh = await execute(root, (services) =>
    services.checksService.checksRequire({
      spec,
      ticket: "T-0001",
      scope: "post-merge",
      command: ["integration test", "smoke"],
      author: "controller",
    }),
  );
  expect(fresh.status, fresh.stderr).toBe(0);
  const freshHeadSha = JSON.parse(fresh.stdout).headSha as string;
  expect(freshHeadSha).toBe(newMerge);
  const passed = await execute(root, (services) =>
    services.checksService.checksRecord({
      spec,
      ticket: "T-0001",
      scope: "post-merge",
      command: "integration test",
      result: "passed",
      author: "controller",
    }),
  );
  expect(passed.status, passed.stderr).toBe(0);
  const smoke = await execute(root, (services) =>
    services.checksService.checksRecord({
      spec,
      ticket: "T-0001",
      scope: "post-merge",
      command: "smoke",
      result: "passed",
      author: "controller",
    }),
  );
  expect(smoke.status, smoke.stderr).toBe(0);
  ledger = JSON.parse(readFileSync(join(dirname(spec), "sdd.json"), "utf8"));
  expect(ledger.tickets[0].integration.postMerge.checks.records[0].headSha).toBe(newMerge);
  expect(ledger.tickets[0].integrationHistory[0].postMerge.checks.records[0].result).toBe("failed");
});
