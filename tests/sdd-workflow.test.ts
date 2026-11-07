import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";

import { runCli } from "./helpers.ts";

function fixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "sdd-workflow-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const repo = join(directory, "checkout");
  mkdirSync(repo);
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
  git("init", "-q");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  writeFileSync(join(repo, "tracked.txt"), "base\n");
  git("add", ".");
  git("commit", "-qm", "base");
  return { repo, git };
}

function invoke(repo: string, args: string[]) {
  return runCli(repo, ["sdd", ...args], process.env.PATH ?? "");
}

function invokeAsync(
  repo: string,
  args: string[],
  options: { preload?: string; killOnOutput?: string } = {},
) {
  const command = join(process.cwd(), "src", "index.ts");
  return new Promise<{
    status: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
  }>((resolveResult, reject) => {
    const childArgs = ["--import", import.meta.resolve("tsx")];
    if (options.preload) childArgs.push("--import", options.preload);
    childArgs.push(command, "sdd", ...args);
    const child = spawn(process.execPath, childArgs, {
      cwd: repo,
      env: { ...process.env, FORCE_COLOR: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let interrupted = false;
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      stdout += chunk;
      if (options.killOnOutput && !interrupted && stdout.includes(options.killOnOutput)) {
        interrupted = true;
        child.kill("SIGKILL");
      }
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (status, signal) => resolveResult({ status, signal, stdout, stderr }));
  });
}

function commitAll(repo: string, git: (...args: string[]) => string, message: string) {
  git("add", "-A");
  git("commit", "-qm", message);
}

function prepareClaimableIssue(t: TestContext) {
  const { repo, git } = fixture(t);
  const created = invoke(repo, ["create", "--title", "Claim flow", "--author", "maintainer"]);
  assert.equal(created.status, 0, created.stderr);
  const feature = JSON.parse(created.stdout) as { spec: string };
  commitAll(repo, git, "create feature");

  const issue = invoke(repo, [
    "issue",
    "create",
    "--spec",
    feature.spec,
    "--title",
    "Implement the flow",
    "--reporter",
    "requester",
    "--category",
    "enhancement",
    "--author",
    "maintainer",
  ]);
  assert.equal(issue.status, 0, issue.stderr);
  const triaged = invoke(repo, [
    "triage",
    "--spec",
    feature.spec,
    "--issue",
    "I-0001",
    "--status",
    "ready-for-agent",
    "--category",
    "enhancement",
    "--details",
    "Requirements are complete.",
    "--author",
    "maintainer",
  ]);
  assert.equal(triaged.status, 0, triaged.stderr);
  commitAll(repo, git, "prepare issue");
  const baseSha = git("rev-parse", "HEAD");
  return { repo, git, spec: feature.spec, baseSha };
}

test("claim records the clean starting revision and explicit controller", (t) => {
  const { repo, git, spec, baseSha } = prepareClaimableIssue(t);

  const claimed = invoke(repo, [
    "claim",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);

  assert.equal(claimed.status, 0, claimed.stderr);
  const output = JSON.parse(claimed.stdout) as {
    issue: string;
    execution: string;
    owner: string;
    baseSha: string;
  };
  assert.deepEqual(output, {
    issue: "I-0001",
    execution: "claimed",
    owner: "controller",
    baseSha,
  });
  const ledger = JSON.parse(
    readFileSync(join(repo, ".scratch", "0001-claim-flow", "sdd.json"), "utf8"),
  );
  assert.deepEqual(ledger.issues[0], {
    id: "I-0001",
    execution: "claimed",
    owner: "controller",
    baseSha,
  });
  assert.equal(git("rev-parse", "HEAD"), baseSha);
});

test("claim rejects staged, unstaged, and untracked changes without changing ownership or baseline", (t) => {
  const { repo, git, spec } = prepareClaimableIssue(t);
  const ledgerPath = join(repo, ".scratch", "0001-claim-flow", "sdd.json");
  const beforeLedger = readFileSync(ledgerPath, "utf8");
  const dirtyStates = [
    () => writeFileSync(join(repo, "tracked.txt"), "unstaged\n"),
    () => {
      writeFileSync(join(repo, "tracked.txt"), "staged\n");
      git("add", "tracked.txt");
    },
    () => writeFileSync(join(repo, "preparation.md"), "untracked preparation\n"),
  ];

  for (const [index, makeDirty] of dirtyStates.entries()) {
    makeDirty();
    const beforeStatus = git("status", "--porcelain=v1", "--untracked-files=all");
    const result = invoke(repo, [
      "claim",
      "--spec",
      spec,
      "--issue",
      "I-0001",
      "--author",
      "controller",
    ]);

    assert.notEqual(result.status, 0, `dirty state ${index} unexpectedly claimed`);
    assert.match(result.stderr, /dirty checkout/);
    assert.equal(readFileSync(ledgerPath, "utf8"), beforeLedger);
    assert.equal(git("status", "--porcelain=v1", "--untracked-files=all"), beforeStatus);
    if (index === 0) writeFileSync(join(repo, "tracked.txt"), "base\n");
    if (index === 1) {
      git("reset", "--", "tracked.txt");
      writeFileSync(join(repo, "tracked.txt"), "base\n");
    }
    if (index === 2) rmSync(join(repo, "preparation.md"));
  }
});

test("an unavailable implementation assignment can later submit once without duplicating history", (t) => {
  const { repo, spec } = prepareClaimableIssue(t);
  const claimed = invoke(repo, [
    "claim",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.equal(claimed.status, 0, claimed.stderr);
  const dispatched = invoke(repo, [
    "implement",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.equal(dispatched.status, 0, dispatched.stderr);
  const assignment = JSON.parse(dispatched.stdout).assignment as {
    id: string;
    role: string;
    action: string;
    report: string;
  };
  assert.equal(assignment.role, "implementation");
  assert.equal(assignment.action, "implement");
  assert.equal(assignment.report.endsWith("/reports/I-0001-implementation.md"), true);
  const repeatedDispatch = invoke(repo, [
    "implement",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.equal(repeatedDispatch.status, 0, repeatedDispatch.stderr);
  assert.equal(JSON.parse(repeatedDispatch.stdout).assignment.id, assignment.id);
  const unavailable = invoke(repo, [
    "submit",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--role",
    "implementation",
    "--unavailable",
    "--details",
    "Worker did not return a report yet.",
    "--author",
    "controller",
  ]);
  assert.equal(unavailable.status, 0, unavailable.stderr);
  assert.equal(JSON.parse(unavailable.stdout).unavailable, true);

  writeFileSync(assignment.report, "Implementation evidence.\n");
  const submitted = invoke(repo, [
    "submit",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--role",
    "implementation",
    "--report",
    assignment.report,
    "--author",
    "controller",
  ]);

  assert.equal(submitted.status, 0, submitted.stderr);
  const submission = JSON.parse(submitted.stdout);
  assert.equal(submission.execution, "reviewing");
  assert.equal(submission.assignment.id, assignment.id);
  assert.equal(submission.assignment.status, "submitted");
  assert.equal(submission.report, assignment.report);
  const submittedAt = submission.assignment.submittedAt;
  const repeated = invoke(repo, [
    "submit",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--role",
    "implementation",
    "--author",
    "controller",
  ]);
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.equal(JSON.parse(repeated.stdout).idempotent, true);
  assert.equal(JSON.parse(repeated.stdout).assignment.submittedAt, submittedAt);
  const issueBody = readFileSync(
    join(repo, ".scratch", "0001-claim-flow", "issues", "I-0001.md"),
    "utf8",
  );
  assert.equal(issueBody.match(/Implementation report submitted/g)?.length, 1);
});

test("resume preserves a dispatch and requires confirmation for a controller handoff", (t) => {
  const { repo, spec } = prepareClaimableIssue(t);
  for (const command of [
    ["claim", "--spec", spec, "--issue", "I-0001", "--author", "controller"],
    ["implement", "--spec", spec, "--issue", "I-0001", "--author", "controller"],
  ]) {
    const result = invoke(repo, command);
    assert.equal(result.status, 0, result.stderr);
  }
  const ledgerPath = join(repo, ".scratch", "0001-claim-flow", "sdd.json");
  const issuePath = join(repo, ".scratch", "0001-claim-flow", "issues", "I-0001.md");
  const originalLedger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  const originalAssignment = originalLedger.issues[0].assignment;
  const beforeStatus = readFileSync(ledgerPath, "utf8");
  const beforeIssue = readFileSync(issuePath, "utf8");

  const resumed = invoke(repo, [
    "resume",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.equal(resumed.status, 0, resumed.stderr);
  assert.equal(JSON.parse(resumed.stdout).gate, "implementing");
  assert.equal(JSON.parse(resumed.stdout).nextAction, "await-implementation-report");
  assert.deepEqual(JSON.parse(resumed.stdout).assignment, originalAssignment);
  assert.equal(readFileSync(ledgerPath, "utf8"), beforeStatus);
  assert.equal(readFileSync(issuePath, "utf8"), beforeIssue);
  const repeatedDispatch = invoke(repo, [
    "implement",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.equal(repeatedDispatch.status, 0, repeatedDispatch.stderr);
  assert.deepEqual(JSON.parse(repeatedDispatch.stdout).assignment, originalAssignment);
  assert.equal(readFileSync(ledgerPath, "utf8"), beforeStatus);
  assert.equal(readFileSync(issuePath, "utf8"), beforeIssue);

  const unconfirmed = invoke(repo, [
    "resume",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "replacement",
  ]);
  assert.notEqual(unconfirmed.status, 0);
  assert.match(unconfirmed.stderr, /--confirm-handoff/);
  assert.equal(readFileSync(ledgerPath, "utf8"), beforeStatus);
  assert.equal(readFileSync(issuePath, "utf8"), beforeIssue);

  const handedOff = invoke(repo, [
    "resume",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "replacement",
    "--confirm-handoff",
  ]);
  assert.equal(handedOff.status, 0, handedOff.stderr);
  const output = JSON.parse(handedOff.stdout);
  assert.equal(output.gate, "implementing");
  assert.equal(output.handoffRecorded, true);
  assert.equal(output.assignment.id, originalAssignment.id);
  assert.equal(output.assignment.report, originalAssignment.report);
  assert.equal(output.assignment.controller, "replacement");
  assert.deepEqual(output.assignment.handoffs.at(-1), {
    at: output.assignment.handoffs.at(-1).at,
    from: "controller",
    to: "replacement",
    confirmedStopped: true,
  });
});

test("resume recovers dispatch interrupted after replacing only the issue target", async (t) => {
  const { repo, spec } = prepareClaimableIssue(t);
  const claim = invoke(repo, [
    "claim",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.equal(claim.status, 0, claim.stderr);

  const workspace = join(repo, ".scratch", "0001-claim-flow");
  const issuePath = join(workspace, "issues", "I-0001.md");
  const ledgerPath = join(workspace, "sdd.json");
  const journalPath = join(workspace, ".sdd-write-recovery.json");
  const issueBefore = readFileSync(issuePath, "utf8");
  const ledgerBefore = readFileSync(ledgerPath, "utf8");
  const marker = "INTERRUPTED_AFTER_ISSUE_REPLACEMENT";
  const preload = join(repo, "interrupt-after-issue-replacement.mjs");
  writeFileSync(
    preload,
    [
      'import fs from "node:fs";',
      'import { syncBuiltinESMExports } from "node:module";',
      "const rename = fs.renameSync;",
      "fs.renameSync = (source, destination) => {",
      "  rename(source, destination);",
      '  if (String(destination).endsWith("/issues/I-0001.md")) {',
      `    process.stdout.write(${JSON.stringify(marker)});`,
      '    process.kill(process.pid, "SIGSTOP");',
      "  }",
      "};",
      "syncBuiltinESMExports();",
      "",
    ].join("\n"),
  );
  const interrupted = await invokeAsync(
    repo,
    ["implement", "--spec", spec, "--issue", "I-0001", "--author", "controller"],
    { preload, killOnOutput: marker },
  );

  assert.equal(interrupted.signal, "SIGKILL", interrupted.stderr);
  assert.match(interrupted.stdout, new RegExp(marker));
  assert.equal(readFileSync(issuePath, "utf8") === issueBefore, false);
  assert.equal(readFileSync(ledgerPath, "utf8"), ledgerBefore);
  assert.equal(existsSync(journalPath), true);

  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
    version: number;
    writes: { path: string; before: string | null; after: string }[];
  };
  assert.equal(journal.version, 1);
  const issueWrite = journal.writes.find((write) => write.path === "issues/I-0001.md");
  const ledgerWrite = journal.writes.find((write) => write.path === "sdd.json");
  assert.ok(issueWrite);
  assert.ok(ledgerWrite);
  assert.equal(issueWrite.before, issueBefore);
  assert.equal(issueWrite.after, readFileSync(issuePath, "utf8"));
  assert.equal(ledgerWrite.before, ledgerBefore);

  const intendedLedger = JSON.parse(ledgerWrite.after) as {
    issues: {
      execution: string;
      assignment?: { id: string; report: string };
    }[];
  };
  const intendedProgress = intendedLedger.issues[0];
  assert.ok(intendedProgress?.assignment);
  const originalAssignment = intendedProgress.assignment;
  assert.equal(intendedProgress.execution, "implementing");
  assert.equal(originalAssignment.report, join(workspace, "reports", "I-0001-implementation.md"));

  const resumed = invoke(repo, [
    "resume",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.equal(resumed.status, 0, resumed.stderr);
  const output = JSON.parse(resumed.stdout);
  assert.equal(output.gate, "implementing");
  assert.deepEqual(output.assignment, originalAssignment);
  assert.equal(output.assignment.id, originalAssignment.id);
  assert.equal(output.assignment.report, originalAssignment.report);
  assert.equal(readFileSync(ledgerPath, "utf8"), ledgerWrite.after);
  assert.equal(readFileSync(issuePath, "utf8"), issueWrite.after);
  assert.equal(existsSync(journalPath), false);
  const assignmentAudit = `Implementation assignment ${originalAssignment.id} recorded; role=implementation; report=${originalAssignment.report}. No agent was launched.`;
  assert.equal(issueWrite.after.split(assignmentAudit).length - 1, 1);
  assert.equal(readFileSync(issuePath, "utf8").split(assignmentAudit).length - 1, 1);
});

test("missing and misdirected reports remain pending without changing the assignment", (t) => {
  const { repo, spec } = prepareClaimableIssue(t);
  const ledgerPath = join(repo, ".scratch", "0001-claim-flow", "sdd.json");
  const beforeLedger = readFileSync(ledgerPath, "utf8");
  const invalidTransition = invoke(repo, [
    "implement",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.notEqual(invalidTransition.status, 0);
  assert.match(invalidTransition.stderr, /must be claimed/);
  assert.equal(readFileSync(ledgerPath, "utf8"), beforeLedger);
  const claimed = invoke(repo, [
    "claim",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.equal(claimed.status, 0, claimed.stderr);
  const implementation = invoke(repo, [
    "implement",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.equal(implementation.status, 0, implementation.stderr);
  const expectedReport = JSON.parse(implementation.stdout).assignment.report as string;
  const outsidePath = join(repo, "outside.md");
  writeFileSync(outsidePath, "Outside report.\n");
  rmSync(expectedReport, { force: true });
  symlinkSync(outsidePath, expectedReport);
  const beforeSymlinkLedger = readFileSync(ledgerPath, "utf8");
  const symlinkReport = invoke(repo, [
    "submit",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--role",
    "implementation",
    "--author",
    "controller",
  ]);
  assert.notEqual(symlinkReport.status, 0);
  assert.match(symlinkReport.stderr, /regular file/);
  assert.equal(readFileSync(ledgerPath, "utf8"), beforeSymlinkLedger);
  assert.equal(readFileSync(outsidePath, "utf8"), "Outside report.\n");

  rmSync(expectedReport);
  const beforeLedgerAfterDispatch = readFileSync(ledgerPath, "utf8");
  const missing = invoke(repo, [
    "submit",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--role",
    "implementation",
    "--author",
    "controller",
  ]);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /missing or unavailable/);
  assert.equal(readFileSync(ledgerPath, "utf8"), beforeLedgerAfterDispatch);

  const outsideReport = join(repo, "outside.md");
  writeFileSync(outsideReport, "Must not register an outside report.\n");
  const misdirected = invoke(repo, [
    "submit",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--role",
    "implementation",
    "--report",
    outsideReport,
    "--author",
    "controller",
  ]);
  assert.notEqual(misdirected.status, 0);
  assert.match(misdirected.stderr, /does not match the assigned destination/);
  assert.equal(readFileSync(ledgerPath, "utf8"), beforeLedgerAfterDispatch);
  assert.equal(readFileSync(outsideReport, "utf8"), "Must not register an outside report.\n");
});

test("next and expanded status expose claim actions without mutating workflow state", (t) => {
  const { repo, spec, git } = prepareClaimableIssue(t);
  const feature = join(repo, ".scratch", "0001-claim-flow");
  const beforeLedger = readFileSync(join(feature, "sdd.json"), "utf8");
  const beforeIssue = readFileSync(join(feature, "issues", "I-0001.md"), "utf8");
  const beforeGitStatus = git("status", "--porcelain=v1", "--untracked-files=all");

  const next = invoke(repo, ["next", "--spec", spec]);
  const status = invoke(repo, ["status", "--spec", spec]);

  assert.equal(next.status, 0, next.stderr);
  assert.equal(status.status, 0, status.stderr);
  assert.deepEqual(JSON.parse(next.stdout).actions, [{ issue: "I-0001", action: "claim" }]);
  assert.deepEqual(JSON.parse(next.stdout).pendingAssignments, []);
  assert.deepEqual(JSON.parse(next.stdout).blockers, []);
  assert.deepEqual(JSON.parse(status.stdout).actions, JSON.parse(next.stdout).actions);
  assert.deepEqual(JSON.parse(status.stdout).pendingAssignments, []);
  assert.deepEqual(JSON.parse(status.stdout).blockers, []);
  assert.equal(readFileSync(join(feature, "sdd.json"), "utf8"), beforeLedger);
  assert.equal(readFileSync(join(feature, "issues", "I-0001.md"), "utf8"), beforeIssue);
  assert.equal(git("status", "--porcelain=v1", "--untracked-files=all"), beforeGitStatus);

  for (const command of [
    ["claim", "--spec", spec, "--issue", "I-0001", "--author", "controller"],
    ["implement", "--spec", spec, "--issue", "I-0001", "--author", "controller"],
  ]) {
    const result = invoke(repo, command);
    assert.equal(result.status, 0, result.stderr);
  }
  const pendingLedger = readFileSync(join(feature, "sdd.json"), "utf8");
  const pendingIssue = readFileSync(join(feature, "issues", "I-0001.md"), "utf8");
  const pendingNext = invoke(repo, ["next", "--spec", spec]);
  const pendingStatus = invoke(repo, ["status", "--spec", spec]);
  assert.equal(pendingNext.status, 0, pendingNext.stderr);
  assert.equal(pendingStatus.status, 0, pendingStatus.stderr);
  assert.deepEqual(JSON.parse(pendingNext.stdout).actions, [
    { issue: "I-0001", action: "await-implementation-report" },
  ]);
  assert.deepEqual(JSON.parse(pendingNext.stdout).pendingAssignments[0], {
    issue: "I-0001",
    id: JSON.parse(pendingStatus.stdout).state.issues[0].assignment.id,
    role: "implementation",
    action: "implement",
    report: JSON.parse(pendingStatus.stdout).state.issues[0].assignment.report,
    status: "pending",
  });
  assert.deepEqual(
    JSON.parse(pendingStatus.stdout).actions,
    JSON.parse(pendingNext.stdout).actions,
  );
  assert.equal(readFileSync(join(feature, "sdd.json"), "utf8"), pendingLedger);
  assert.equal(readFileSync(join(feature, "issues", "I-0001.md"), "utf8"), pendingIssue);
});

test("next and status report dirty checkout as a claim blocker without changing it", (t) => {
  const { repo, spec, git } = prepareClaimableIssue(t);
  const preparationPath = join(repo, "preparation.md");
  writeFileSync(preparationPath, "Uncommitted preparation input.\n");
  const beforeStatus = git("status", "--porcelain=v1", "--untracked-files=all");
  const beforeLedger = readFileSync(join(repo, ".scratch", "0001-claim-flow", "sdd.json"), "utf8");

  const next = invoke(repo, ["next", "--spec", spec]);
  const status = invoke(repo, ["status", "--spec", spec]);

  assert.equal(next.status, 0, next.stderr);
  assert.equal(status.status, 0, status.stderr);
  assert.deepEqual(JSON.parse(next.stdout).actions, []);
  assert.match(JSON.parse(next.stdout).blockers[0].reason, /checkout is dirty/i);
  assert.deepEqual(JSON.parse(status.stdout).actions, []);
  assert.match(JSON.parse(status.stdout).blockers[0].reason, /checkout is dirty/i);
  assert.equal(readFileSync(preparationPath, "utf8"), "Uncommitted preparation input.\n");
  assert.equal(
    readFileSync(join(repo, ".scratch", "0001-claim-flow", "sdd.json"), "utf8"),
    beforeLedger,
  );
  assert.equal(git("status", "--porcelain=v1", "--untracked-files=all"), beforeStatus);
});

test("next does not recommend implementation from a claimed record without owner and baseline", (t) => {
  const { repo, spec } = prepareClaimableIssue(t);
  const ledgerPath = join(repo, ".scratch", "0001-claim-flow", "sdd.json");
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  ledger.issues[0].execution = "claimed";
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  const before = readFileSync(ledgerPath, "utf8");

  const next = invoke(repo, ["next", "--spec", spec]);

  assert.equal(next.status, 0, next.stderr);
  assert.deepEqual(JSON.parse(next.stdout).actions, []);
  assert.match(
    JSON.parse(next.stdout).blockers[0].reason,
    /claim has no recorded owner or baseline/i,
  );
  assert.equal(readFileSync(ledgerPath, "utf8"), before);

  const resumed = invoke(repo, [
    "resume",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.equal(resumed.status, 0, resumed.stderr);
  assert.equal(JSON.parse(resumed.stdout).nextAction, "resolve-claim-blocker");
  assert.equal(readFileSync(ledgerPath, "utf8"), before);
});

test("status and next block review when a registered implementation report disappears", (t) => {
  const { repo, spec } = prepareClaimableIssue(t);
  for (const command of [
    ["claim", "--spec", spec, "--issue", "I-0001", "--author", "controller"],
    ["implement", "--spec", spec, "--issue", "I-0001", "--author", "controller"],
  ]) {
    const result = invoke(repo, command);
    assert.equal(result.status, 0, result.stderr);
  }
  const reportPath = join(
    repo,
    ".scratch",
    "0001-claim-flow",
    "reports",
    "I-0001-implementation.md",
  );
  writeFileSync(reportPath, "Registered report.\n");
  const submitted = invoke(repo, [
    "submit",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--role",
    "implementation",
    "--author",
    "controller",
  ]);
  assert.equal(submitted.status, 0, submitted.stderr);
  rmSync(reportPath);
  const ledgerPath = join(repo, ".scratch", "0001-claim-flow", "sdd.json");
  const issuePath = join(repo, ".scratch", "0001-claim-flow", "issues", "I-0001.md");
  const beforeLedger = readFileSync(ledgerPath, "utf8");
  const beforeIssue = readFileSync(issuePath, "utf8");

  const next = invoke(repo, ["next", "--spec", spec]);
  const status = invoke(repo, ["status", "--spec", spec]);

  assert.equal(next.status, 0, next.stderr);
  assert.equal(status.status, 0, status.stderr);
  assert.deepEqual(JSON.parse(next.stdout).actions, []);
  assert.match(JSON.parse(next.stdout).blockers[0].reason, /report is missing/);
  assert.deepEqual(JSON.parse(status.stdout).actions, []);
  assert.match(JSON.parse(status.stdout).blockers[0].reason, /report is missing/);
  assert.equal(readFileSync(ledgerPath, "utf8"), beforeLedger);
  assert.equal(readFileSync(issuePath, "utf8"), beforeIssue);
  writeFileSync(reportPath, "Altered registered report.\n");
  const changedReport = invoke(repo, ["next", "--spec", spec]);
  assert.equal(changedReport.status, 0, changedReport.stderr);
  assert.deepEqual(JSON.parse(changedReport.stdout).actions, []);
  assert.match(JSON.parse(changedReport.stdout).blockers[0].reason, /content changed/);
  assert.equal(readFileSync(ledgerPath, "utf8"), beforeLedger);
  assert.equal(readFileSync(issuePath, "utf8"), beforeIssue);
});

test("claim keeps dependency-blocked issues unowned", (t) => {
  const { repo, git, spec } = prepareClaimableIssue(t);
  const created = invoke(repo, [
    "issue",
    "create",
    "--spec",
    spec,
    "--title",
    "Dependent issue",
    "--reporter",
    "requester",
    "--category",
    "enhancement",
    "--author",
    "maintainer",
  ]);
  assert.equal(created.status, 0, created.stderr);
  const updated = invoke(repo, [
    "issue",
    "update",
    "--spec",
    spec,
    "--issue",
    "I-0002",
    "--blocked-by",
    "I-0001",
    "--author",
    "maintainer",
  ]);
  assert.equal(updated.status, 0, updated.stderr);
  const triaged = invoke(repo, [
    "triage",
    "--spec",
    spec,
    "--issue",
    "I-0002",
    "--status",
    "ready-for-agent",
    "--category",
    "enhancement",
    "--details",
    "Ready after its prerequisite is integrated.",
    "--author",
    "maintainer",
  ]);
  assert.equal(triaged.status, 0, triaged.stderr);
  commitAll(repo, git, "prepare dependent issue");
  const ledgerPath = join(repo, ".scratch", "0001-claim-flow", "sdd.json");
  const before = readFileSync(ledgerPath, "utf8");

  const result = invoke(repo, [
    "claim",
    "--spec",
    spec,
    "--issue",
    "I-0002",
    "--author",
    "controller",
  ]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /dependencies that are not integrated: I-0001/);
  assert.equal(readFileSync(ledgerPath, "utf8"), before);
});

test("claim rejects issues that have not been triaged ready without recording ownership", (t) => {
  const { repo, git, spec } = prepareClaimableIssue(t);
  const triaged = invoke(repo, [
    "triage",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--status",
    "needs-info",
    "--category",
    "enhancement",
    "--details",
    "Requirements need clarification.",
    "--author",
    "maintainer",
  ]);
  assert.equal(triaged.status, 0, triaged.stderr);
  commitAll(repo, git, "return issue to triage");
  const ledgerPath = join(repo, ".scratch", "0001-claim-flow", "sdd.json");
  const before = readFileSync(ledgerPath, "utf8");

  const result = invoke(repo, [
    "claim",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not ready for an agent/);
  assert.equal(readFileSync(ledgerPath, "utf8"), before);
});

test("implementation dispatch rejects ignored and pre-existing report destinations without overwriting", (t) => {
  const ignored = prepareClaimableIssue(t);
  writeFileSync(
    join(ignored.repo, ".gitignore"),
    ".scratch/0001-claim-flow/reports/I-0001-implementation.md\n",
  );
  commitAll(ignored.repo, ignored.git, "ignore implementation report");
  const claim = invoke(ignored.repo, [
    "claim",
    "--spec",
    ignored.spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.equal(claim.status, 0, claim.stderr);
  const ignoredLedgerPath = join(ignored.repo, ".scratch", "0001-claim-flow", "sdd.json");
  const beforeIgnoredDispatch = readFileSync(ignoredLedgerPath, "utf8");
  const ignoredDispatch = invoke(ignored.repo, [
    "implement",
    "--spec",
    ignored.spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.notEqual(ignoredDispatch.status, 0);
  assert.match(ignoredDispatch.stderr, /path is ignored/);
  assert.equal(readFileSync(ignoredLedgerPath, "utf8"), beforeIgnoredDispatch);

  const existing = prepareClaimableIssue(t);
  const reportPath = join(
    existing.repo,
    ".scratch",
    "0001-claim-flow",
    "reports",
    "I-0001-implementation.md",
  );
  writeFileSync(reportPath, "User-owned report; do not overwrite.\n");
  commitAll(existing.repo, existing.git, "preserve existing report");
  const existingClaim = invoke(existing.repo, [
    "claim",
    "--spec",
    existing.spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.equal(existingClaim.status, 0, existingClaim.stderr);
  const existingLedgerPath = join(existing.repo, ".scratch", "0001-claim-flow", "sdd.json");
  const beforeExistingDispatch = readFileSync(existingLedgerPath, "utf8");
  const existingDispatch = invoke(existing.repo, [
    "implement",
    "--spec",
    existing.spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.notEqual(existingDispatch.status, 0);
  assert.match(existingDispatch.stderr, /already exists and was preserved/);
  assert.equal(readFileSync(reportPath, "utf8"), "User-owned report; do not overwrite.\n");
  assert.equal(readFileSync(existingLedgerPath, "utf8"), beforeExistingDispatch);
});

test("concurrent public CLI claims grant only one controller ownership", async (t) => {
  const { repo, git, spec, baseSha } = prepareClaimableIssue(t);
  const argumentsFor = (author: string) => [
    "claim",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    author,
  ];
  const results = await Promise.all([
    invokeAsync(repo, argumentsFor("controller-a")),
    invokeAsync(repo, argumentsFor("controller-b")),
  ]);

  assert.equal(results.filter((result) => result.status === 0).length, 1);
  assert.equal(results.filter((result) => result.status !== 0).length, 1);
  const ledger = JSON.parse(
    readFileSync(join(repo, ".scratch", "0001-claim-flow", "sdd.json"), "utf8"),
  );
  const progress = ledger.issues[0];
  assert.equal(progress.execution, "claimed");
  assert.ok(["controller-a", "controller-b"].includes(progress.owner));
  assert.equal(progress.baseSha, baseSha);
  assert.equal(git("rev-parse", "HEAD"), baseSha);
});

test("concurrent dispatch and submission reuse one assignment and one history entry", async (t) => {
  const { repo, git, spec, baseSha } = prepareClaimableIssue(t);
  const claim = invoke(repo, [
    "claim",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.equal(claim.status, 0, claim.stderr);
  const implementArgs = [
    "implement",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ];
  const dispatched = await Promise.all([
    invokeAsync(repo, implementArgs),
    invokeAsync(repo, implementArgs),
  ]);
  assert.deepEqual(
    dispatched.map((result) => result.status),
    [0, 0],
  );
  const firstAssignment = JSON.parse(dispatched[0]!.stdout).assignment;
  const secondAssignment = JSON.parse(dispatched[1]!.stdout).assignment;
  assert.equal(firstAssignment.id, secondAssignment.id);
  assert.equal(firstAssignment.report, secondAssignment.report);
  writeFileSync(firstAssignment.report, "Concurrent implementation report.\n");

  const submitArgs = [
    "submit",
    "--spec",
    spec,
    "--issue",
    "I-0001",
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

  assert.deepEqual(
    submissions.map((result) => result.status),
    [0, 0],
  );
  assert.equal(submissions.filter((result) => JSON.parse(result.stdout).idempotent).length, 1);
  const issueBody = readFileSync(
    join(repo, ".scratch", "0001-claim-flow", "issues", "I-0001.md"),
    "utf8",
  );
  assert.equal(issueBody.match(/Implementation report submitted/g)?.length, 1);
  const ledger = JSON.parse(
    readFileSync(join(repo, ".scratch", "0001-claim-flow", "sdd.json"), "utf8"),
  );
  assert.equal(ledger.issues[0].assignment.id, firstAssignment.id);
  assert.equal(ledger.issues[0].execution, "reviewing");
  assert.equal(git("rev-parse", "HEAD"), baseSha);
});
