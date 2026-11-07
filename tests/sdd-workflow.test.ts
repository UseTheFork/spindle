import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import {
  chmodSync,
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
    snapshot: string;
    codeSnapshot: string;
    requirementsSnapshot: string;
    headSha: string;
  };
  assert.equal(output.issue, "I-0001");
  assert.equal(output.execution, "claimed");
  assert.equal(output.owner, "controller");
  assert.equal(output.baseSha, baseSha);
  assert.equal(output.headSha, baseSha);
  assert.match(output.snapshot, /^[0-9a-f]{64}$/);
  assert.match(output.codeSnapshot, /^[0-9a-f]{64}$/);
  assert.match(output.requirementsSnapshot, /^[0-9a-f]{64}$/);
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

test("checks require declares required commands and permits later additions", (t) => {
  const { repo, spec } = prepareClaimableIssue(t);
  const requireCheck = (command: string) =>
    invoke(repo, [
      "checks",
      "require",
      "--spec",
      spec,
      "--issue",
      "I-0001",
      "--command",
      command,
      "--author",
      "controller",
    ]);

  const initial = requireCheck("just test::test tests/unit.test.ts");
  assert.equal(initial.status, 0, initial.stderr);

  const added = requireCheck("just test::test tests/integration.test.ts");
  assert.equal(added.status, 0, added.stderr);
  const ledger = JSON.parse(
    readFileSync(join(repo, ".scratch", "0001-claim-flow", "sdd.json"), "utf8"),
  );
  assert.deepEqual(
    ledger.issues[0].checks.required.map((check: { command: string }) => check.command),
    ["just test::test tests/unit.test.ts", "just test::test tests/integration.test.ts"],
  );
  assert.equal(JSON.parse(initial.stdout).checks.required.length, 1);
  assert.equal(JSON.parse(added.stdout).checks.required.length, 2);
});

test("claim and resume report content identities that change for untracked code", (t) => {
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
  const baseline = JSON.parse(claim.stdout) as {
    snapshot: string;
    codeSnapshot: string;
    requirementsSnapshot: string;
  };
  assert.match(baseline.snapshot, /^[0-9a-f]{64}$/);
  assert.match(baseline.codeSnapshot, /^[0-9a-f]{64}$/);
  assert.match(baseline.requirementsSnapshot, /^[0-9a-f]{64}$/);

  writeFileSync(join(repo, "new-source.ts"), "export const changed = true;\n");
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
  const current = JSON.parse(resumed.stdout) as typeof baseline;
  assert.notEqual(current.codeSnapshot, baseline.codeSnapshot);
  assert.notEqual(current.snapshot, baseline.snapshot);
  assert.equal(current.requirementsSnapshot, baseline.requirementsSnapshot);
});

test("code identity distinguishes one untracked payload from two separately framed files", (t) => {
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

  const secondFileRecord = Buffer.from(
    "path\0b\0index-absent\0worktree-mode:420\0worktree-file\0Y",
  );
  writeFileSync(join(repo, "a"), Buffer.concat([Buffer.from("X"), secondFileRecord]));
  const oneFile = invoke(repo, [
    "resume",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.equal(oneFile.status, 0, oneFile.stderr);
  const oneFileIdentity = JSON.parse(oneFile.stdout).codeSnapshot as string;

  rmSync(join(repo, "a"));
  writeFileSync(join(repo, "a"), "X");
  writeFileSync(join(repo, "b"), "Y");
  const twoFiles = invoke(repo, [
    "resume",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.equal(twoFiles.status, 0, twoFiles.stderr);
  const twoFileIdentity = JSON.parse(twoFiles.stdout).codeSnapshot as string;

  assert.notEqual(oneFileIdentity, twoFileIdentity);
});

test("code identity rejects changed submodule revisions and dirty or untracked submodule content", (t) => {
  const { repo, git, spec } = prepareClaimableIssue(t);
  const command = "just test::test tests/example.test.ts";
  const required = invoke(repo, [
    "checks",
    "require",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--command",
    command,
    "--author",
    "controller",
  ]);
  assert.equal(required.status, 0, required.stderr);
  commitAll(repo, git, "declare required check");

  const source = join(repo, "..", "submodule-source");
  mkdirSync(source);
  execFileSync("git", ["init", "-q"], { cwd: source });
  execFileSync("git", ["config", "user.name", "Fixture"], { cwd: source });
  execFileSync("git", ["config", "user.email", "fixture@example.invalid"], { cwd: source });
  writeFileSync(join(source, "tracked.txt"), "submodule base\n");
  execFileSync("git", ["add", "."], { cwd: source });
  execFileSync("git", ["commit", "-qm", "submodule base"], { cwd: source });
  const submodulePath = "modules/example";
  git("-c", "protocol.file.allow=always", "submodule", "add", "-q", source, submodulePath);
  commitAll(repo, git, "add fixture submodule");

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
  const snapshot = JSON.parse(claim.stdout).snapshot as string;
  const recordArgs = [
    "checks",
    "record",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--snapshot",
    snapshot,
    "--command",
    command,
    "--result",
    "passed",
    "--author",
    "controller",
  ];

  const submodule = join(repo, submodulePath);
  writeFileSync(join(submodule, "tracked.txt"), "dirty tracked content\n");
  const dirtyRecord = invoke(repo, recordArgs);
  assert.notEqual(dirtyRecord.status, 0);
  assert.match(dirtyRecord.stderr, /submodule/i);
  const ledgerPath = join(repo, ".scratch", "0001-claim-flow", "sdd.json");
  assert.deepEqual(JSON.parse(readFileSync(ledgerPath, "utf8")).issues[0].checks.records, []);

  writeFileSync(join(submodule, "tracked.txt"), "submodule base\n");
  writeFileSync(join(submodule, "untracked.txt"), "untracked submodule content\n");
  const untrackedResume = invoke(repo, [
    "resume",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.notEqual(untrackedResume.status, 0);
  assert.match(untrackedResume.stderr, /submodule/i);

  rmSync(join(submodule, "untracked.txt"));
  writeFileSync(join(submodule, "tracked.txt"), "new submodule revision\n");
  execFileSync("git", ["add", "tracked.txt"], { cwd: submodule });
  execFileSync("git", ["commit", "-qm", "new submodule revision"], { cwd: submodule });
  const revisionResume = invoke(repo, [
    "resume",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.notEqual(revisionResume.status, 0);
  assert.match(revisionResume.stderr, /submodule/i);
});

test("nested untracked repositories cannot reuse identities or record check coverage", (t) => {
  const { repo, git, spec } = prepareClaimableIssue(t);
  const command = "just test::test tests/example.test.ts";
  const required = invoke(repo, [
    "checks",
    "require",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--command",
    command,
    "--author",
    "controller",
  ]);
  assert.equal(required.status, 0, required.stderr);
  commitAll(repo, git, "declare required check");

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
  const claimSnapshot = JSON.parse(claim.stdout).snapshot as string;

  const nested = join(repo, "vendor", "dependencies", "embedded");
  mkdirSync(nested, { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: nested });
  execFileSync("git", ["config", "user.name", "Fixture"], { cwd: nested });
  execFileSync("git", ["config", "user.email", "fixture@example.invalid"], { cwd: nested });
  writeFileSync(join(nested, "tracked.txt"), "nested repository base\n");
  execFileSync("git", ["add", "."], { cwd: nested });
  execFileSync("git", ["commit", "-qm", "nested repository base"], { cwd: nested });

  const resumeArgs = ["resume", "--spec", spec, "--issue", "I-0001", "--author", "controller"];
  const initialIdentity = invoke(repo, resumeArgs);
  const reusableSnapshot =
    initialIdentity.status === 0
      ? (JSON.parse(initialIdentity.stdout).snapshot as string)
      : claimSnapshot;
  if (initialIdentity.status !== 0) {
    assert.match(initialIdentity.stderr, /nested|repository|worktree/i);
  }

  writeFileSync(join(nested, "tracked.txt"), "nested repository changed\n");
  const changedIdentity = invoke(repo, resumeArgs);
  assert.notEqual(changedIdentity.status, 0);
  assert.match(changedIdentity.stderr, /nested|repository|worktree/i);

  const recorded = invoke(repo, [
    "checks",
    "record",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--snapshot",
    reusableSnapshot,
    "--command",
    command,
    "--result",
    "passed",
    "--author",
    "controller",
  ]);
  assert.notEqual(recorded.status, 0);
  assert.match(recorded.stderr, /nested|repository|worktree/i);
  const ledgerPath = join(repo, ".scratch", "0001-claim-flow", "sdd.json");
  assert.deepEqual(JSON.parse(readFileSync(ledgerPath, "utf8")).issues[0].checks.records, []);
});

test("missing known Gitlinks reject identity actions and check recording", (t) => {
  const { repo, git, spec } = prepareClaimableIssue(t);
  const command = "just test::test tests/example.test.ts";
  const required = invoke(repo, [
    "checks",
    "require",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--command",
    command,
    "--author",
    "controller",
  ]);
  assert.equal(required.status, 0, required.stderr);
  commitAll(repo, git, "declare required check");

  const source = join(repo, "..", "missing-submodule-source");
  mkdirSync(source);
  execFileSync("git", ["init", "-q"], { cwd: source });
  execFileSync("git", ["config", "user.name", "Fixture"], { cwd: source });
  execFileSync("git", ["config", "user.email", "fixture@example.invalid"], { cwd: source });
  writeFileSync(join(source, "tracked.txt"), "submodule base\n");
  execFileSync("git", ["add", "."], { cwd: source });
  execFileSync("git", ["commit", "-qm", "submodule base"], { cwd: source });
  const submodulePath = "modules/missing";
  git("-c", "protocol.file.allow=always", "submodule", "add", "-q", source, submodulePath);
  commitAll(repo, git, "add fixture submodule");

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
  const snapshot = JSON.parse(claim.stdout).snapshot as string;

  git("submodule", "deinit", "-f", "--", submodulePath);
  rmSync(join(repo, submodulePath), { recursive: true, force: true });

  const resume = invoke(repo, [
    "resume",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.notEqual(resume.status, 0);
  assert.match(resume.stderr, /missing or uninitialized/i);

  const recorded = invoke(repo, [
    "checks",
    "record",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--snapshot",
    snapshot,
    "--command",
    command,
    "--result",
    "passed",
    "--author",
    "controller",
  ]);
  assert.notEqual(recorded.status, 0);
  assert.match(recorded.stderr, /missing or uninitialized/i);
  const ledgerPath = join(repo, ".scratch", "0001-claim-flow", "sdd.json");
  assert.deepEqual(JSON.parse(readFileSync(ledgerPath, "utf8")).issues[0].checks.records, []);
});

test("content identity includes staged and unstaged working content relative to the claim baseline", (t) => {
  const { repo, git, spec } = prepareClaimableIssue(t);
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
  const baseline = JSON.parse(claim.stdout).codeSnapshot as string;

  writeFileSync(join(repo, "tracked.txt"), "staged content\n");
  git("add", "tracked.txt");
  const stagedResult = invoke(repo, [
    "resume",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.equal(stagedResult.status, 0, stagedResult.stderr);
  const staged = JSON.parse(stagedResult.stdout).codeSnapshot as string;
  assert.notEqual(staged, baseline);

  writeFileSync(join(repo, "tracked.txt"), "unstaged content\n");
  const unstagedResult = invoke(repo, [
    "resume",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.equal(unstagedResult.status, 0, unstagedResult.stderr);
  const stagedAndUnstaged = JSON.parse(unstagedResult.stdout).codeSnapshot as string;
  assert.notEqual(stagedAndUnstaged, staged);

  git("commit", "-qm", "commit staged content");
  const committedResult = invoke(repo, [
    "resume",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.equal(committedResult.status, 0, committedResult.stderr);
  assert.equal(JSON.parse(committedResult.stdout).codeSnapshot, stagedAndUnstaged);
});

test("content identity includes staged content even when the working tree is restored", (t) => {
  const { repo, git, spec } = prepareClaimableIssue(t);
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
  const baseline = JSON.parse(claim.stdout).codeSnapshot as string;
  writeFileSync(join(repo, "tracked.txt"), "staged-only content\n");
  git("add", "tracked.txt");
  writeFileSync(join(repo, "tracked.txt"), "base\n");

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
  assert.notEqual(JSON.parse(resumed.stdout).codeSnapshot, baseline);
});

test("content identity includes Git-tracked executable mode changes", (t) => {
  const { repo, git, spec } = prepareClaimableIssue(t);
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
  const baseline = JSON.parse(claim.stdout).codeSnapshot as string;
  chmodSync(join(repo, "tracked.txt"), 0o755);
  git("add", "tracked.txt");

  const stagedResult = invoke(repo, [
    "resume",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.equal(stagedResult.status, 0, stagedResult.stderr);
  const staged = JSON.parse(stagedResult.stdout).codeSnapshot as string;
  assert.notEqual(staged, baseline);

  chmodSync(join(repo, "tracked.txt"), 0o644);
  const unstagedResult = invoke(repo, [
    "resume",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.equal(unstagedResult.status, 0, unstagedResult.stderr);
  assert.notEqual(JSON.parse(unstagedResult.stdout).codeSnapshot, staged);
});

test("checks record stores one result against the supplied snapshot and is idempotent", (t) => {
  const { repo, git, spec } = prepareClaimableIssue(t);
  const command = "just test::test tests/example.test.ts";
  const required = invoke(repo, [
    "checks",
    "require",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--command",
    command,
    "--author",
    "controller",
  ]);
  assert.equal(required.status, 0, required.stderr);
  commitAll(repo, git, "declare required check");
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
  const snapshot = JSON.parse(claim.stdout).snapshot as string;
  const recordArgs = [
    "checks",
    "record",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--snapshot",
    snapshot,
    "--command",
    command,
    "--result",
    "passed",
    "--author",
    "controller",
  ];

  const recorded = invoke(repo, recordArgs);
  assert.equal(recorded.status, 0, recorded.stderr);
  assert.deepEqual(JSON.parse(recorded.stdout).record, {
    command,
    result: "passed",
    author: "controller",
    snapshot,
    codeSnapshot: JSON.parse(claim.stdout).codeSnapshot,
    requirementsSnapshot: JSON.parse(claim.stdout).requirementsSnapshot,
    headSha: JSON.parse(claim.stdout).headSha,
    recordedAt: JSON.parse(recorded.stdout).record.recordedAt,
  });
  const repeated = invoke(repo, recordArgs);
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.equal(JSON.parse(repeated.stdout).idempotent, true);
  const ledger = JSON.parse(
    readFileSync(join(repo, ".scratch", "0001-claim-flow", "sdd.json"), "utf8"),
  );
  assert.equal(ledger.issues[0].checks.records.length, 1);
});

test("content identity excludes ordinary comments but tracks requirement changes and decisions", (t) => {
  const { repo, git, spec } = prepareClaimableIssue(t);
  const required = invoke(repo, [
    "checks",
    "require",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--command",
    "just test::test tests/example.test.ts",
    "--author",
    "controller",
  ]);
  assert.equal(required.status, 0, required.stderr);
  commitAll(repo, git, "declare check");
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
  const initial = JSON.parse(claim.stdout) as {
    snapshot: string;
    codeSnapshot: string;
    requirementsSnapshot: string;
  };
  const command = "just test::test tests/example.test.ts";
  const recorded = invoke(repo, [
    "checks",
    "record",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--snapshot",
    initial.snapshot,
    "--command",
    command,
    "--result",
    "passed",
    "--author",
    "controller",
  ]);
  assert.equal(recorded.status, 0, recorded.stderr);
  const comment = invoke(repo, [
    "issue",
    "comment",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--details",
    "A routine progress note with no changed acceptance requirements.",
    "--author",
    "controller",
  ]);
  assert.equal(comment.status, 0, comment.stderr);
  const generatedReport = join(
    repo,
    ".scratch",
    "0001-claim-flow",
    "reports",
    "generated-report.md",
  );
  writeFileSync(generatedReport, "Generated report content.\n");
  const afterComment = JSON.parse(
    invoke(repo, ["resume", "--spec", spec, "--issue", "I-0001", "--author", "controller"]).stdout,
  ) as typeof initial;
  assert.equal(afterComment.snapshot, initial.snapshot);
  assert.equal(afterComment.codeSnapshot, initial.codeSnapshot);
  const afterCommentNext = invoke(repo, ["next", "--spec", spec]);
  assert.equal(afterCommentNext.status, 0, afterCommentNext.stderr);
  assert.equal(
    JSON.stringify(JSON.parse(afterCommentNext.stdout).blockers).includes("Required check"),
    false,
  );

  writeFileSync(
    spec,
    `${readFileSync(spec, "utf8")}\n## Requirements\n\nA changed feature requirement.\n`,
  );
  const afterSpecChangeResult = invoke(repo, [
    "resume",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.equal(afterSpecChangeResult.status, 0, afterSpecChangeResult.stderr);
  const afterSpecChange = JSON.parse(afterSpecChangeResult.stdout) as typeof initial;
  assert.equal(afterSpecChange.codeSnapshot, initial.codeSnapshot);
  assert.notEqual(afterSpecChange.requirementsSnapshot, initial.requirementsSnapshot);
  const staleNext = invoke(repo, ["next", "--spec", spec]);
  assert.equal(staleNext.status, 0, staleNext.stderr);
  assert.match(JSON.stringify(JSON.parse(staleNext.stdout).blockers), /Required check .* is stale/);

  const issuePath = join(repo, ".scratch", "0001-claim-flow", "issues", "I-0001.md");
  const issueContent = readFileSync(issuePath, "utf8");
  writeFileSync(
    issuePath,
    issueContent.replace(
      "## Requirements\n",
      "## Requirements\n\nAn issue-specific requirement changed.\n",
    ),
  );
  const afterIssueRequirementResult = invoke(repo, [
    "resume",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.equal(afterIssueRequirementResult.status, 0, afterIssueRequirementResult.stderr);
  const afterIssueRequirement = JSON.parse(afterIssueRequirementResult.stdout) as typeof initial;
  assert.equal(afterIssueRequirement.codeSnapshot, initial.codeSnapshot);
  assert.notEqual(afterIssueRequirement.requirementsSnapshot, afterSpecChange.requirementsSnapshot);

  const decision = invoke(repo, [
    "issue",
    "comment",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--details",
    "Requirements decision: retain the new acceptance requirement.",
    "--author",
    "controller",
  ]);
  assert.equal(decision.status, 0, decision.stderr);
  const afterDecisionResult = invoke(repo, [
    "resume",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.equal(afterDecisionResult.status, 0, afterDecisionResult.stderr);
  assert.notEqual(
    JSON.parse(afterDecisionResult.stdout).requirementsSnapshot,
    afterIssueRequirement.requirementsSnapshot,
  );
});

test("metadata-only commits preserve content coverage while changing Git provenance", (t) => {
  const { repo, git, spec } = prepareClaimableIssue(t);
  const command = "just test::test tests/example.test.ts";
  const required = invoke(repo, [
    "checks",
    "require",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--command",
    command,
    "--author",
    "controller",
  ]);
  assert.equal(required.status, 0, required.stderr);
  commitAll(repo, git, "declare check");
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
  const initial = JSON.parse(claim.stdout) as {
    snapshot: string;
    headSha: string;
  };
  const recorded = invoke(repo, [
    "checks",
    "record",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--snapshot",
    initial.snapshot,
    "--command",
    command,
    "--result",
    "passed",
    "--author",
    "controller",
  ]);
  assert.equal(recorded.status, 0, recorded.stderr);
  git("commit", "--allow-empty", "-m", "metadata-only revision");

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
  const current = JSON.parse(resumed.stdout) as typeof initial;
  assert.equal(current.snapshot, initial.snapshot);
  assert.notEqual(current.headSha, initial.headSha);
  const status = invoke(repo, ["status", "--spec", spec]);
  assert.equal(status.status, 0, status.stderr);
  assert.equal(
    JSON.parse(status.stdout).blockers.some((item: { reason: string }) =>
      item.reason.includes(`Required check ${command}`),
    ),
    false,
  );
});

test("checks record rejects malformed or stale snapshots and requires failure details without executing commands", (t) => {
  const { repo, git, spec } = prepareClaimableIssue(t);
  const sentinel = join(repo, "command-was-not-executed");
  const command = `touch ${sentinel}`;
  const required = invoke(repo, [
    "checks",
    "require",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--command",
    command,
    "--author",
    "controller",
  ]);
  assert.equal(required.status, 0, required.stderr);
  commitAll(repo, git, "declare check");
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
  const snapshot = JSON.parse(claim.stdout).snapshot as string;
  const ledgerPath = join(repo, ".scratch", "0001-claim-flow", "sdd.json");
  const before = readFileSync(ledgerPath, "utf8");
  const baseArgs = [
    "checks",
    "record",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--command",
    command,
    "--author",
    "controller",
  ];

  const malformed = invoke(repo, [
    ...baseArgs,
    "--snapshot",
    "not-a-snapshot",
    "--result",
    "passed",
  ]);
  assert.notEqual(malformed.status, 0);
  assert.match(malformed.stderr, /64-character hexadecimal/);
  const invalidResult = invoke(repo, [...baseArgs, "--snapshot", snapshot, "--result", "skipped"]);
  assert.notEqual(invalidResult.status, 0);
  assert.match(invalidResult.stderr, /Invalid check result/);
  const failedWithoutDetails = invoke(repo, [
    ...baseArgs,
    "--snapshot",
    snapshot,
    "--result",
    "failed",
  ]);
  assert.notEqual(failedWithoutDetails.status, 0);
  assert.match(failedWithoutDetails.stderr, /--details is required/);
  const unavailableWithoutDetails = invoke(repo, [
    ...baseArgs,
    "--snapshot",
    snapshot,
    "--result",
    "unavailable",
  ]);
  assert.notEqual(unavailableWithoutDetails.status, 0);
  assert.match(unavailableWithoutDetails.stderr, /--details is required/);
  assert.equal(readFileSync(ledgerPath, "utf8"), before);

  writeFileSync(join(repo, "new-source.ts"), "export const changed = true;\n");
  const stale = invoke(repo, [...baseArgs, "--snapshot", snapshot, "--result", "passed"]);
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /Snapshot is stale/);
  assert.equal(readFileSync(ledgerPath, "utf8"), before);

  const currentSnapshot = JSON.parse(
    invoke(repo, ["resume", "--spec", spec, "--issue", "I-0001", "--author", "controller"]).stdout,
  ).snapshot as string;
  const failed = invoke(repo, [
    ...baseArgs,
    "--snapshot",
    currentSnapshot,
    "--result",
    "failed",
    "--details",
    "The external check found a defect.",
  ]);
  assert.equal(failed.status, 0, failed.stderr);
  const unavailable = invoke(repo, [
    ...baseArgs,
    "--snapshot",
    currentSnapshot,
    "--result",
    "unavailable",
    "--details",
    "The configured external runner was unavailable.",
  ]);
  assert.equal(unavailable.status, 0, unavailable.stderr);
  const next = invoke(repo, ["next", "--spec", spec]);
  assert.equal(next.status, 0, next.stderr);
  assert.match(
    JSON.stringify(JSON.parse(next.stdout).blockers),
    /Required check .* is unavailable/,
  );
  assert.equal(existsSync(sentinel), false);
});

test("check removal requires rationale and invalidates accepted decisions while preserving history", (t) => {
  const { repo, git, spec } = prepareClaimableIssue(t);
  const firstCommand = "just test::test tests/first.test.ts";
  const requireFirst = invoke(repo, [
    "checks",
    "require",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--command",
    firstCommand,
    "--author",
    "controller",
  ]);
  assert.equal(requireFirst.status, 0, requireFirst.stderr);
  commitAll(repo, git, "declare first check");
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
  const claimOutput = JSON.parse(claim.stdout);
  const record = invoke(repo, [
    "checks",
    "record",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--snapshot",
    claimOutput.snapshot,
    "--command",
    firstCommand,
    "--result",
    "passed",
    "--author",
    "controller",
  ]);
  assert.equal(record.status, 0, record.stderr);

  const ledgerPath = join(repo, ".scratch", "0001-claim-flow", "sdd.json");
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  ledger.issues[0].execution = "accepted";
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  const beforeRemoval = readFileSync(ledgerPath, "utf8");
  const missingRationale = invoke(repo, [
    "checks",
    "require",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--command",
    firstCommand,
    "--remove",
    "--author",
    "controller",
  ]);
  assert.notEqual(missingRationale.status, 0);
  assert.match(missingRationale.stderr, /requires non-empty --details rationale/);
  assert.equal(readFileSync(ledgerPath, "utf8"), beforeRemoval);

  const removed = invoke(repo, [
    "checks",
    "require",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--command",
    firstCommand,
    "--remove",
    "--details",
    "The target is no longer supported.",
    "--author",
    "controller",
  ]);
  assert.equal(removed.status, 0, removed.stderr);
  const afterRemoval = JSON.parse(removed.stdout);
  assert.equal(
    afterRemoval.checks.required[0].removalDetails,
    "The target is no longer supported.",
  );
  assert.equal(afterRemoval.invalidatedDecision.from, "accepted");
  assert.equal(afterRemoval.invalidatedDecision.to, "reviewing");
  assert.notEqual(afterRemoval.requirementsSnapshot, claimOutput.requirementsSnapshot);
  const persisted = JSON.parse(readFileSync(ledgerPath, "utf8"));
  assert.equal(persisted.issues[0].execution, "reviewing");
  assert.equal(persisted.issues[0].checks.records.length, 1);
  assert.equal(persisted.issues[0].checks.invalidations.length, 1);

  const secondCommand = "just test::test tests/second.test.ts";
  const added = invoke(repo, [
    "checks",
    "require",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--command",
    secondCommand,
    "--author",
    "controller",
  ]);
  assert.equal(added.status, 0, added.stderr);
  assert.notEqual(JSON.parse(added.stdout).requirementsSnapshot, afterRemoval.requirementsSnapshot);
  const status = invoke(repo, ["status", "--spec", spec]);
  assert.equal(status.status, 0, status.stderr);
  assert.match(
    JSON.stringify(JSON.parse(status.stdout).blockers),
    /Required check .*second\.test\.ts.*missing/,
  );
});

test("status does not permit integration when a required check failed", (t) => {
  const { repo, git, spec } = prepareClaimableIssue(t);
  const command = "just test::test tests/required.test.ts";
  const required = invoke(repo, [
    "checks",
    "require",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--command",
    command,
    "--author",
    "controller",
  ]);
  assert.equal(required.status, 0, required.stderr);
  commitAll(repo, git, "declare check");
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
  const failed = invoke(repo, [
    "checks",
    "record",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--snapshot",
    JSON.parse(claim.stdout).snapshot,
    "--command",
    command,
    "--result",
    "failed",
    "--details",
    "The required check failed.",
    "--author",
    "controller",
  ]);
  assert.equal(failed.status, 0, failed.stderr);

  const ledgerPath = join(repo, ".scratch", "0001-claim-flow", "sdd.json");
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  ledger.issues[0].execution = "accepted";
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  const status = invoke(repo, ["status", "--spec", spec]);
  assert.equal(status.status, 0, status.stderr);
  assert.deepEqual(JSON.parse(status.stdout).actions, []);
  assert.match(JSON.stringify(JSON.parse(status.stdout).blockers), /Required check .* is failed/);
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
  assert.equal(JSON.parse(resumed.stdout).nextAction, "resolve-check-blocker");
});

test("stale checks on an integrated issue keep dependent issues blocked", (t) => {
  const { repo, git, spec } = prepareClaimableIssue(t);
  const command = "just test::test tests/required.test.ts";
  const required = invoke(repo, [
    "checks",
    "require",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--command",
    command,
    "--author",
    "controller",
  ]);
  assert.equal(required.status, 0, required.stderr);
  commitAll(repo, git, "declare check");
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
  const failed = invoke(repo, [
    "checks",
    "record",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--snapshot",
    JSON.parse(claim.stdout).snapshot,
    "--command",
    command,
    "--result",
    "failed",
    "--details",
    "The required check failed.",
    "--author",
    "controller",
  ]);
  assert.equal(failed.status, 0, failed.stderr);

  const ledgerPath = join(repo, ".scratch", "0001-claim-flow", "sdd.json");
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  ledger.issues[0].execution = "integrated";
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  const dependent = invoke(repo, [
    "issue",
    "create",
    "--spec",
    spec,
    "--title",
    "Wait for valid evidence",
    "--reporter",
    "requester",
    "--category",
    "enhancement",
    "--author",
    "maintainer",
  ]);
  assert.equal(dependent.status, 0, dependent.stderr);
  const dependency = invoke(repo, [
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
  assert.equal(dependency.status, 0, dependency.stderr);
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
    "Ready after the dependency satisfies all gates.",
    "--author",
    "maintainer",
  ]);
  assert.equal(triaged.status, 0, triaged.stderr);

  const ready = invoke(repo, ["ready", "--spec", spec]);
  assert.equal(ready.status, 0, ready.stderr);
  assert.deepEqual(JSON.parse(ready.stdout).unready, [{ issue: "I-0002", blockedBy: ["I-0001"] }]);
  const attemptedClaim = invoke(repo, [
    "claim",
    "--spec",
    spec,
    "--issue",
    "I-0002",
    "--author",
    "controller",
  ]);
  assert.notEqual(attemptedClaim.status, 0);
  assert.match(attemptedClaim.stderr, /dependencies that are not integrated: I-0001/);
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
