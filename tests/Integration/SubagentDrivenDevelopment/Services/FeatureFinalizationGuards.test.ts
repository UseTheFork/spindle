import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { cliOutput, invokeAsync } from "@test/Helpers/SubagentDrivenDevelopment/helpers";
import { expect, test, vi } from "vitest";

import { git, readyFeature, recordFinal } from "../Fixtures/FeatureFinalizationFixture";

vi.setConfig({ testTimeout: 60_000 });

test.each([
  "dirty-original",
  "moved-original",
  "detached-original",
  "wrong-branch",
  "dirty-code",
  "missing-retrospective",
  "changed-review",
])("full finish rejects %s without committing records or destroying work", async (guard) => {
  const f = await readyFeature();
  const before = git(f.root, "rev-parse", "HEAD");
  if (guard === "dirty-original" || guard === "moved-original") {
    writeFileSync(join(f.original, "user.txt"), "preserve\n");
    if (guard === "moved-original") {
      git(f.original, "add", "user.txt");
      git(f.original, "commit", "-qm", "user movement");
    }
  } else if (guard === "detached-original") git(f.original, "checkout", "--detach", "-q");
  else if (guard === "wrong-branch") git(f.original, "checkout", "-qb", "user-branch");
  else if (guard === "dirty-code") writeFileSync(join(f.root, "user.ts"), "preserve\n");
  else if (guard === "changed-review") {
    const ledger = JSON.parse(readFileSync(join(dirname(f.spec), "sdd.json"), "utf8"));
    writeFileSync(ledger.delivery.reviewAssignments[0].report, "# changed report\n");
  }
  const result =
    guard === "missing-retrospective"
      ? await invokeAsync(f.root, [
          "finish",
          "--feature",
          f.spec.replace(/\/spec\.md$/, ""),
          "--actor",
          "controller",
        ])
      : await f.finish();
  expect(result.status).not.toBe(0);
  expect(git(f.root, "rev-parse", "HEAD")).toBe(before);
  expect(existsSync(f.root)).toBe(true);
  expect(existsSync(f.ticketRoot)).toBe(true);
});

test("finish relocates task worktrees and report paths embedded in finding history", async () => {
  const f = await readyFeature("feature.ts", { workflowPathsInWorktrees: true });
  const originalRecords = dirname(f.originalSpec);

  cliOutput(await f.finish());
  cliOutput(await recordFinal(f));
  const complete = cliOutput(
    await invokeAsync(f.original, [
      "finish",
      "--feature",
      originalRecords,
      "--actor",
      "controller",
    ]),
  );

  expect(complete).toMatchObject({ finished: true, cleanup: "complete" });
  const text = readFileSync(join(originalRecords, "sdd.json"), "utf8");
  expect(text).not.toContain(f.root);
  expect(text).not.toContain(f.ticketRoot);
  const ledger = JSON.parse(text);
  const task = ledger.tickets[0].tasks[0].assignment;
  expect(task.submittedAt).toEqual(expect.any(String));
  expect(task).not.toHaveProperty("worktree");
  expect(task.report).toBe(join(originalRecords, "reports", "T-0001-TASK-0001-ticket-worktree.md"));
  expect(existsSync(task.report)).toBe(true);
  const review = ledger.delivery.reviewAssignments[0].report;
  expect(dirname(review)).toBe(join(originalRecords, "reports"));
  expect(existsSync(review)).toBe(true);
  expect(
    ledger.delivery.findings[0].history[0].details.startsWith(
      `Registered from ${review} at commit `,
    ),
  ).toBe(true);
  const journal = JSON.parse(readFileSync(f.journal, "utf8"));
  expect(journal.mappings).toContainEqual({
    before: f.ticketRoot,
    after: "journal:execution-location",
  });
});

test("finish rejects an embedded worktree path that is not a feature report", async () => {
  const f = await readyFeature("feature.ts", { workflowPathsInWorktrees: true });
  const ledgerPath = join(dirname(f.spec), "sdd.json");
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  const entry = ledger.delivery.findings[0].history[0];
  entry.details = `${entry.details} Inspect ${join(f.ticketRoot, "feature.ts")}.`;
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  git(f.root, "add", ledgerPath);
  git(f.root, "commit", "-qm", "spindle: record embedded path");
  const before = git(f.root, "rev-parse", "HEAD");

  const result = await f.finish();

  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/Embedded workflow path cannot be silently rewritten/);
  expect(git(f.root, "rev-parse", "HEAD")).toBe(before);
  expect(existsSync(f.ticketRoot)).toBe(true);
});

test("finish rejects an unsubmitted task assignment that points at a ticket worktree", async () => {
  const f = await readyFeature("feature.ts", { workflowPathsInWorktrees: true });
  const ledgerPath = join(dirname(f.spec), "sdd.json");
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  const task = ledger.tickets[0].tasks[0];
  const {
    submittedAt: _submittedAt,
    reportSha256: _reportSha256,
    ...unsubmitted
  } = task.assignment;
  task.assignmentHistory = [...(task.assignmentHistory ?? []), { ...unsubmitted, id: "abandoned" }];
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  git(f.root, "add", ledgerPath);
  git(f.root, "commit", "-qm", "spindle: record unsubmitted assignment");
  const before = git(f.root, "rev-parse", "HEAD");

  const result = await f.finish();

  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain(
    `Cannot relocate an unsubmitted assignment worktree: ${f.ticketRoot}.`,
  );
  expect(git(f.root, "rev-parse", "HEAD")).toBe(before);
  expect(existsSync(f.ticketRoot)).toBe(true);
});
