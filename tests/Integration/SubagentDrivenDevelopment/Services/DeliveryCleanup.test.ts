import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  cliOutput,
  invokeAsync,
  beginDeliveryFinalization,
  completeDeliveryFinalization,
  declareFinalDeliveryChecks,
  finalizeDelivery,
  recordFinalDeliveryCheck,
  prepareDeliveryReady,
} from "@test/Helpers/SubagentDrivenDevelopment/helpers";
import { expect, test, vi } from "vitest";

import { rehomeTaskWorktreeForFinalizationFixture } from "../Fixtures/TaskPlans";

vi.setConfig({ testTimeout: 60_000 });

async function prepareFinalization() {
  const prepared = await prepareDeliveryReady();
  rehomeTaskWorktreeForFinalizationFixture(prepared.spec, "T-0001", prepared.originalRepo);
  return prepared;
}

test("failed final-merge checks preserve worktrees until passing evidence is recorded", async () => {
  const prepared = await prepareFinalization();
  const command = "fixture final check";
  const pending = await beginDeliveryFinalization(prepared, { finalChecks: [command] });
  await declareFinalDeliveryChecks(pending, [command]);

  const failed = await recordFinalDeliveryCheck(
    pending,
    command,
    "failed",
    "The final-merge fixture check failed.",
  );
  expect(failed.status, failed.stderr).toBe(0);
  const paused = await completeDeliveryFinalization(pending);
  expect(paused.status, paused.stderr).toBe(0);
  expect(cliOutput(paused)).toMatchObject({
    finalValidation: "pending",
    cleanup: "retained",
    records: [{ command, result: "failed" }],
  });
  expect(existsSync(prepared.repo)).toBe(true);

  const passed = await recordFinalDeliveryCheck(pending, command);
  expect(passed.status, passed.stderr).toBe(0);
  const completed = await completeDeliveryFinalization(pending);
  expect(completed.status, completed.stderr).toBe(0);
  expect(cliOutput(completed)).toMatchObject({
    finished: true,
    cleanup: "complete",
  });
  expect(
    JSON.parse(readFileSync(pending.journal, "utf8")).records.map(
      (item: { result: string }) => item.result,
    ),
  ).toEqual(["failed", "passed"]);
});

test("final-merge check requirements are frozen after their initial declaration", async () => {
  const prepared = await prepareFinalization();
  const command = "fixture final check";
  const pending = await beginDeliveryFinalization(prepared, { finalChecks: [command] });
  await declareFinalDeliveryChecks(pending, [command]);
  const journalBefore = readFileSync(pending.journal, "utf8");

  const changedList = await invokeAsync(pending.originalWorkspace, [
    "checks",
    "require",
    "--feature",
    pending.originalSpec.replace(/\/spec\.md$/, ""),
    "--scope",
    "final",
    "--command",
    command,
    "--command",
    "late unreviewed check",
    "--actor",
    "controller",
  ]);
  expect(changedList.status).not.toBe(0);
  expect(changedList.stderr).toMatch(/final declared check list is frozen/i);
  expect(readFileSync(pending.journal, "utf8")).toBe(journalBefore);

  const recorded = await recordFinalDeliveryCheck(pending, command);
  expect(recorded.status, recorded.stderr).toBe(0);
  const completed = await completeDeliveryFinalization(pending);
  expect(completed.status, completed.stderr).toBe(0);
  expect(cliOutput(completed)).toMatchObject({ finished: true, cleanup: "complete" });
});

test("finalization cleanup remains bound to its recorded controller", async () => {
  const prepared = await prepareFinalization();
  const finalization = await finalizeDelivery(prepared);
  const journalBefore = readFileSync(finalization.pending.journal, "utf8");

  const replacementFinish = await invokeAsync(finalization.pending.originalWorkspace, [
    "finish",
    "--feature",
    finalization.pending.originalSpec.replace(/\/spec\.md$/, ""),
    "--actor",
    "replacement",
  ]);
  expect(replacementFinish.status).not.toBe(0);
  expect(replacementFinish.stderr).toContain("is owned by controller");
  expect(replacementFinish.stderr).toContain("--actor replacement");
  expect(replacementFinish.stderr).toContain("finalization journal cannot be handed off");
  expect(readFileSync(finalization.pending.journal, "utf8")).toBe(journalBefore);

  const repeated = await completeDeliveryFinalization(finalization.pending);
  expect(repeated.status, repeated.stderr).toBe(0);
  expect(cliOutput(repeated)).toMatchObject({ finished: true, cleanup: "complete" });
});

test("finalization status and next expose pending checks and completed cleanup", async () => {
  const prepared = await prepareFinalization();
  const report = join(
    prepared.repo,
    ".spindle/features",
    "0001-ticket-flow",
    "reports",
    "retrospective.md",
  );
  writeFileSync(report, "# Retrospective\n\nCompletion evidence.\n");
  const command = "fixture final check";
  const pending = await beginDeliveryFinalization(prepared, {
    report,
    finalChecks: [command],
  });
  const statusPending = await invokeAsync(pending.originalWorkspace, [
    "status",
    "--feature",
    pending.originalSpec.replace(/\/spec\.md$/, ""),
  ]);
  const nextPending = await invokeAsync(pending.originalWorkspace, [
    "next",
    "--feature",
    pending.originalSpec.replace(/\/spec\.md$/, ""),
  ]);
  expect(statusPending.status, statusPending.stderr).toBe(0);
  expect(nextPending.status, nextPending.stderr).toBe(0);
  expect(cliOutput(statusPending)).toMatchObject({
    finalValidation: "pending",
    cleanup: "retained",
  });
  expect(cliOutput(nextPending)).toEqual(cliOutput(statusPending));

  await declareFinalDeliveryChecks(pending, [command]);
  const recorded = await recordFinalDeliveryCheck(pending, command);
  expect(recorded.status, recorded.stderr).toBe(0);
  const completed = await completeDeliveryFinalization(pending);
  expect(completed.status, completed.stderr).toBe(0);
  expect(cliOutput(completed)).toMatchObject({
    finished: true,
    cleanup: "complete",
  });
  expect(existsSync(prepared.repo)).toBe(false);

  const statusComplete = await invokeAsync(pending.originalWorkspace, [
    "status",
    "--feature",
    pending.originalSpec.replace(/\/spec\.md$/, ""),
  ]);
  const nextComplete = await invokeAsync(pending.originalWorkspace, [
    "next",
    "--feature",
    pending.originalSpec.replace(/\/spec\.md$/, ""),
  ]);
  expect(statusComplete.status, statusComplete.stderr).toBe(0);
  expect(nextComplete.status, nextComplete.stderr).toBe(0);
  expect(cliOutput(statusComplete)).toMatchObject({
    finished: true,
    cleanup: "complete",
  });
  expect(cliOutput(nextComplete)).toEqual(cliOutput(statusComplete));

  const journalBeforeLateRecord = readFileSync(pending.journal, "utf8");
  const lateRecord = await recordFinalDeliveryCheck(
    pending,
    command,
    "failed",
    "A post-completion result is not part of final validation.",
  );
  expect(lateRecord.status).not.toBe(0);
  expect(lateRecord.stderr).toMatch(/only accepted during final validation/i);
  expect(readFileSync(pending.journal, "utf8")).toBe(journalBeforeLateRecord);
});
