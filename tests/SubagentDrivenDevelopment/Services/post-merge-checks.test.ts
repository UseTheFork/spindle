import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { expect, test } from "vitest";

import { EXECUTION_STATES } from "@/SubagentDrivenDevelopment/Models/Workflow";
import {
  isDeliveryProgress,
  isIntegrationRecord,
} from "@/SubagentDrivenDevelopment/Persistence/ProgressSchema";

import { execute, fixture, invokeAsync } from "../helpers/helpers";

function git(root: string, ...args: string[]) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

async function setup() {
  const { repo } = fixture();
  const created = await execute(repo, (s) =>
    s.featureCreationService.create({ title: "Post merge", author: "controller" }),
  );
  expect(created.status, created.stderr).toBe(0);
  const parent = join(dirname(repo), "post-merge-workspaces");
  mkdirSync(parent);
  const started = await invokeAsync(repo, [
    "start",
    "--spec",
    JSON.parse(created.stdout).spec,
    "--workspace",
    parent,
    "--confirm-records",
  ]);
  expect(started.status, started.stderr).toBe(0);
  const { featureWorkspace: root, spec } = JSON.parse(started.stdout) as {
    featureWorkspace: string;
    spec: string;
  };
  for (const title of ["First", "Second"]) {
    const ticket = await execute(root, (s) =>
      s.ticketService.ticketCreate({
        spec,
        title,
        reporter: "requester",
        category: "enhancement",
        author: "controller",
      }),
    );
    expect(ticket.status, ticket.stderr).toBe(0);
  }
  git(root, "add", ".scratch");
  git(root, "commit", "-qm", "prepare");
  const sha = git(root, "rev-parse", "HEAD");
  const ledgerPath = join(dirname(spec), "sdd.json");
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  const first = ledger.tickets[0];
  const evidence = {
    snapshot: "a".repeat(64),
    codeSnapshot: "b".repeat(64),
    requirementsSnapshot: "c".repeat(64),
    files: ["source.ts"],
    contentDigest: "d".repeat(64),
  };
  Object.assign(first, {
    status: "in-progress",
    execution: "integrated",
    owner: "controller",
    baseSha: sha,
    acceptedEvidence: evidence,
    integration: {
      commitSha: sha,
      mergeSha: sha,
      postMerge: { status: "pending", mergeSha: sha },
      integratedAt: new Date().toISOString(),
      integratedBy: "controller",
      files: evidence.files,
      contentDigest: evidence.contentDigest,
    },
  });
  ledger.tickets[1].blockedBy = ["T-0001"];
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  return { root, spec, sha, ledgerPath };
}

function cli(root: string, spec: string, action: string, args: string[], author = "controller") {
  return invokeAsync(root, [
    "checks",
    action,
    "--spec",
    spec,
    "--ticket",
    "T-0001",
    "--scope",
    "post-merge",
    ...args,
    "--author",
    author,
  ]);
}

test("post-merge results freeze the complete list, preserve failures and close only after all pass", async () => {
  const { root, spec, sha, ledgerPath } = await setup();
  const require = await cli(root, spec, "require", [
    "--command",
    "test one",
    "--command",
    "test two",
  ]);
  expect(require.status, require.stderr).toBe(0);
  const snapshot = JSON.parse(require.stdout).snapshot as string;
  const pendingReady = await invokeAsync(root, ["ready", "--spec", spec]);
  expect(pendingReady.status, pendingReady.stderr).toBe(0);
  expect(JSON.parse(pendingReady.stdout).ready).not.toContain("T-0002");
  const failed = await cli(root, spec, "record", [
    "--snapshot",
    snapshot,
    "--command",
    "test one",
    "--result",
    "failed",
    "--details",
    "failed test",
  ]);
  expect(failed.status, failed.stderr).toBe(0);
  const frozen = await cli(root, spec, "require", ["--command", "test one"]);
  expect(frozen.status).not.toBe(0);
  expect(frozen.stderr).toContain("frozen");
  const passed = await cli(root, spec, "record", [
    "--snapshot",
    snapshot,
    "--command",
    "test one",
    "--result",
    "passed",
  ]);
  expect(passed.status, passed.stderr).toBe(0);
  let ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  expect(ledger.tickets[0].status).toBe("in-progress");
  const last = await cli(root, spec, "record", [
    "--snapshot",
    snapshot,
    "--command",
    "test two",
    "--result",
    "passed",
  ]);
  expect(last.status, last.stderr).toBe(0);
  ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  expect(ledger.tickets[0].status).toBe("closed");
  expect(ledger.tickets[0].integration.postMerge.status).toBe("passed");
  expect(
    ledger.tickets[0].integration.postMerge.checks.records.map((r: { result: string }) => r.result),
  ).toEqual(["failed", "passed", "passed"]);
  expect(
    ledger.tickets[0].integration.postMerge.checks.records.every(
      (r: { headSha: string }) => r.headSha === sha,
    ),
  ).toBe(true);
  const ready = await invokeAsync(root, ["ready", "--spec", spec]);
  expect(ready.status, ready.stderr).toBe(0);
  expect(JSON.parse(ready.stdout).ready).toContain("T-0002");
});

test("closure retry reports stale evidence and requires a fresh check", async () => {
  const { root, spec, ledgerPath } = await setup();
  const blocked = await execute(root, (services) =>
    services.ticketService.ticketUpdate({
      spec,
      ticket: "T-0001",
      blocker: "Approval pending",
      author: "controller",
    }),
  );
  expect(blocked.status, blocked.stderr).toBe(0);
  const declared = await cli(root, spec, "require", ["--command", "test"]);
  expect(declared.status, declared.stderr).toBe(0);
  const snapshot = JSON.parse(declared.stdout).snapshot as string;
  const recorded = await cli(root, spec, "record", [
    "--snapshot",
    snapshot,
    "--command",
    "test",
    "--result",
    "passed",
  ]);
  expect(recorded.status, recorded.stderr).toBe(0);
  const cleared = await execute(root, (services) =>
    services.ticketService.ticketUpdate({
      spec,
      ticket: "T-0001",
      clearBlocker: true,
      author: "controller",
    }),
  );
  expect(cleared.status, cleared.stderr).toBe(0);
  writeFileSync(spec, `${readFileSync(spec, "utf8")}\nNew requirement.\n`);
  const retry = await cli(root, spec, "require", ["--command", "test"]);
  expect(retry.status, retry.stderr).toBe(0);
  const outcome = JSON.parse(retry.stdout) as {
    snapshot: string;
    closed: boolean;
    closureBlocked: string[];
    retry: string;
  };
  expect(outcome).toMatchObject({
    closed: false,
    closureBlocked: [expect.stringMatching(/stale/i)],
    retry: expect.stringMatching(/record/i),
  });
  expect(outcome.snapshot).not.toBe(snapshot);
  expect(JSON.parse(readFileSync(ledgerPath, "utf8")).tickets[0].status).not.toBe("closed");
  const fresh = await cli(root, spec, "record", [
    "--snapshot",
    outcome.snapshot,
    "--command",
    "test",
    "--result",
    "passed",
  ]);
  expect(fresh.status, fresh.stderr).toBe(0);
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  expect(ledger.tickets[0].status).toBe("closed");
  expect(ledger.tickets[0].integration.postMerge.checks.records).toHaveLength(2);
});

test("post-merge rejects unauthorized, dirty, stale and wrong-branch evidence", async () => {
  const { root, spec } = await setup();
  const unauthorized = await cli(root, spec, "require", ["--command", "test"], "intruder");
  expect(unauthorized.status).not.toBe(0);
  const declared = await cli(root, spec, "require", ["--command", "test"]);
  expect(declared.status, declared.stderr).toBe(0);
  const snapshot = JSON.parse(declared.stdout).snapshot as string;
  const args = ["--snapshot", snapshot, "--command", "test", "--result", "passed"];
  writeFileSync(join(root, "dirty.ts"), "dirty");
  expect((await cli(root, spec, "record", args)).status).not.toBe(0);
  rmSync(join(root, "dirty.ts"));
  const originalSpec = readFileSync(spec, "utf8");
  writeFileSync(spec, `${originalSpec}\nchanged requirements\n`);
  const stale = await cli(root, spec, "record", args);
  expect(stale.status).not.toBe(0);
  expect(stale.stderr).toContain("stale");
  writeFileSync(spec, originalSpec);
  git(root, "checkout", "-qb", "wrong-branch");
  expect((await cli(root, spec, "record", args)).status).not.toBe(0);
  git(root, "checkout", "-q", "features/0001-post-merge");
  writeFileSync(join(root, "dirty.ts"), "new commit");
  git(root, "add", "dirty.ts");
  git(root, "commit", "-qm", "advance head");
  expect((await cli(root, spec, "record", args)).status).not.toBe(0);
});

test("pending unavailable results survive interruption and changed feature state requires fresh results", async () => {
  const { root, spec, ledgerPath } = await setup();
  const empty = await cli(root, spec, "require", ["--command", ""]);
  expect(empty.status).not.toBe(0);
  const duplicate = await cli(root, spec, "require", ["--command", "test", "--command", "test"]);
  expect(duplicate.status).not.toBe(0);
  const declared = await cli(root, spec, "require", ["--command", "first", "--command", "second"]);
  expect(declared.status, declared.stderr).toBe(0);
  const snapshot = JSON.parse(declared.stdout).snapshot as string;
  const unavailable = await cli(root, spec, "record", [
    "--snapshot",
    snapshot,
    "--command",
    "first",
    "--result",
    "unavailable",
    "--details",
    "offline",
  ]);
  expect(unavailable.status, unavailable.stderr).toBe(0);
  const specContent = readFileSync(spec, "utf8");
  writeFileSync(spec, `${specContent}\nUpdated feature requirements.\n`);
  const redeclared = await cli(root, spec, "require", [
    "--command",
    "first",
    "--command",
    "second",
  ]);
  expect(redeclared.status, redeclared.stderr).toBe(0);
  const fresh = JSON.parse(redeclared.stdout).snapshot as string;
  expect(fresh).not.toBe(snapshot);
  const second = await cli(root, spec, "record", [
    "--snapshot",
    fresh,
    "--command",
    "second",
    "--result",
    "passed",
  ]);
  expect(second.status, second.stderr).toBe(0);
  let ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  expect(ledger.tickets[0].status).toBe("in-progress");
  const first = await cli(root, spec, "record", [
    "--snapshot",
    fresh,
    "--command",
    "first",
    "--result",
    "passed",
  ]);
  expect(first.status, first.stderr).toBe(0);
  ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  expect(
    ledger.tickets[0].integration.postMerge.checks.records.map((r: { result: string }) => r.result),
  ).toEqual(["unavailable", "passed", "passed"]);
  expect(ledger.tickets[0].status).toBe("closed");
});

test("post-merge identity ignores independent ticket and report activity but tracks relevant requirements", async () => {
  const { root, spec, ledgerPath } = await setup();
  const commands = ["--command", "first", "--command", "second"];
  const declared = await cli(root, spec, "require", commands);
  expect(declared.status, declared.stderr).toBe(0);
  const snapshot = JSON.parse(declared.stdout).snapshot as string;
  const update = await execute(root, (services) =>
    services.ticketService.ticketUpdate({
      spec,
      ticket: "T-0002",
      title: "Independent work",
      author: "controller",
    }),
  );
  expect(update.status, update.stderr).toBe(0);
  const comment = await execute(root, (services) =>
    services.ticketService.ticketComment({
      spec,
      ticket: "T-0001",
      details: "Progress note.",
      author: "controller",
    }),
  );
  expect(comment.status, comment.stderr).toBe(0);
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  const report = join(dirname(spec), "reports", "T-0002-implementation.md");
  ledger.tickets[1].assignment = {
    id: "independent",
    role: "implementation",
    action: "implement",
    controller: "controller",
    report,
    requestedAt: new Date().toISOString(),
    status: "pending",
    handoffs: [],
  };
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  mkdirSync(dirname(report), { recursive: true });
  writeFileSync(report, "Independent ticket report.\n");
  const unchanged = await cli(root, spec, "require", commands);
  expect(unchanged.status, unchanged.stderr).toBe(0);
  expect(JSON.parse(unchanged.stdout).snapshot).toBe(snapshot);
  const first = await cli(root, spec, "record", [
    "--snapshot",
    snapshot,
    "--command",
    "first",
    "--result",
    "passed",
  ]);
  expect(first.status, first.stderr).toBe(0);
  const args = ["--snapshot", snapshot, "--command", "second", "--result", "passed"];
  const ticketPath = join(dirname(spec), "tickets", "T-0001.md");
  const ticket = readFileSync(ticketPath, "utf8");
  expect(ticket).toContain("## Requirements");
  writeFileSync(
    ticketPath,
    ticket.replace("## Requirements", "## Requirements\n\nNew ticket requirement."),
  );
  const ticketStale = await cli(root, spec, "record", args);
  expect(ticketStale.status).not.toBe(0);
  expect(ticketStale.stderr).toContain("stale");
  writeFileSync(ticketPath, ticket);
  const originalSpec = readFileSync(spec, "utf8");
  writeFileSync(spec, `${originalSpec}\nNew feature requirement.\n`);
  const specStale = await cli(root, spec, "record", args);
  expect(specStale.status).not.toBe(0);
  expect(specStale.stderr).toContain("stale");
  writeFileSync(spec, originalSpec);
  writeFileSync(report, "Independent ticket report updated again.\n");
  const second = await cli(root, spec, "record", args);
  expect(second.status, second.stderr).toBe(0);
});

test("integration schema rejects empty, missing, stale and failed passed evidence", () => {
  const sha = "a".repeat(40);
  const at = new Date().toISOString();
  const base = {
    commitSha: sha,
    mergeSha: sha,
    integratedAt: at,
    integratedBy: "controller",
    files: ["source.ts"],
    contentDigest: "d".repeat(64),
  };
  expect(isIntegrationRecord({ ...base, postMerge: { status: "passed", mergeSha: sha } })).toBe(
    false,
  );
  expect(
    isIntegrationRecord({
      ...base,
      postMerge: { status: "passed", mergeSha: sha, checks: { required: [], records: [] } },
    }),
  ).toBe(false);
  const required = [{ command: "test", addedAt: at, addedBy: "controller" }];
  const record = {
    command: "test",
    result: "failed",
    details: "bad",
    author: "controller",
    snapshot: "a".repeat(64),
    codeSnapshot: "b".repeat(64),
    requirementsSnapshot: "c".repeat(64),
    headSha: sha,
    recordedAt: at,
  };
  expect(
    isIntegrationRecord({
      ...base,
      postMerge: { status: "passed", mergeSha: sha, checks: { required, records: [record] } },
    }),
  ).toBe(false);
  expect(
    isIntegrationRecord({
      ...base,
      postMerge: {
        status: "passed",
        mergeSha: sha,
        checks: { required, records: [{ ...record, result: "passed" }, record] },
      },
    }),
  ).toBe(false);
  expect(
    isIntegrationRecord({
      ...base,
      postMerge: {
        status: "passed",
        mergeSha: sha,
        checks: { required, records: [{ ...record, result: "passed", headSha: "b".repeat(40) }] },
      },
    }),
  ).toBe(false);
});

test("legacy accepted and check-invalidation states are rejected", () => {
  expect(EXECUTION_STATES).not.toContain("accepted");
  expect(isDeliveryProgress({ execution: "accepted", history: [] })).toBe(false);
  expect(
    isDeliveryProgress({
      execution: "reviewing",
      history: [],
      checks: { required: [], records: [], invalidations: [] },
    }),
  ).toBe(false);
});
