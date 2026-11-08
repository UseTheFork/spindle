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

function prepareImplementationForReview(t: TestContext) {
  const { repo, git, spec } = prepareClaimableIssue(t);
  const command = "just test::test tests/feature.test.ts";
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
  writeFileSync(join(repo, "feature.ts"), "export const feature = true;\n");

  const implemented = invoke(repo, [
    "implement",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.equal(implemented.status, 0, implemented.stderr);
  const implementation = JSON.parse(implemented.stdout) as {
    assignment: { report: string };
  };
  writeFileSync(implementation.assignment.report, "# Implementation report\n\nCompleted.\n");
  const submitted = invoke(repo, [
    "submit",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--role",
    "implementation",
    "--report",
    implementation.assignment.report,
    "--author",
    "controller",
  ]);
  assert.equal(submitted.status, 0, submitted.stderr);
  return {
    repo,
    git,
    spec,
    command,
    report: implementation.assignment.report,
    submission: JSON.parse(submitted.stdout) as {
      snapshot: string;
      codeSnapshot: string;
      requirementsSnapshot: string;
    },
  };
}

function recordReviewCheck(
  repo: string,
  spec: string,
  command: string,
  snapshot: string,
  result: "passed" | "failed",
) {
  return invoke(repo, [
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
    result,
    ...(result === "failed" ? ["--details", "The required check failed."] : []),
    "--author",
    "controller",
  ]);
}

function prepareReviewAssignment(t: TestContext) {
  const prepared = prepareImplementationForReview(t);
  const passingCheck = recordReviewCheck(
    prepared.repo,
    prepared.spec,
    prepared.command,
    prepared.submission.snapshot,
    "passed",
  );
  assert.equal(passingCheck.status, 0, passingCheck.stderr);
  const dispatched = invoke(prepared.repo, [
    "review",
    "--spec",
    prepared.spec,
    "--issue",
    "I-0001",
    "--inventory",
    JSON.stringify(["feature.ts"]),
    "--author",
    "controller",
  ]);
  assert.equal(dispatched.status, 0, dispatched.stderr);
  return {
    ...prepared,
    assignment: JSON.parse(dispatched.stdout).assignments[0] as {
      id: string;
      agent: string;
      role: string;
      scope: string;
      snapshot: string;
      report: string;
      status: string;
    },
  };
}

function prepareAcceptedIssue(t: TestContext) {
  const prepared = prepareReviewAssignment(t);
  writeFileSync(prepared.assignment.report, "# Review report\n\nNo defects found.\n");
  const submitted = invoke(prepared.repo, [
    "submit",
    "--spec",
    prepared.spec,
    "--issue",
    "I-0001",
    "--role",
    "review",
    "--assignment",
    prepared.assignment.id,
    "--report",
    prepared.assignment.report,
    "--result",
    "passed",
    "--no-findings",
    "--author",
    "controller",
  ]);
  assert.equal(submitted.status, 0, submitted.stderr);
  const accepted = invoke(prepared.repo, [
    "accept",
    "--spec",
    prepared.spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.equal(accepted.status, 0, accepted.stderr);
  return prepared;
}

function refreshReviewCheck(repo: string, spec: string, command: string) {
  const status = invoke(repo, ["status", "--spec", spec]);
  assert.equal(status.status, 0, status.stderr);
  const snapshot = JSON.parse(status.stdout).snapshots[0].snapshot as string;
  return recordReviewCheck(repo, spec, command, snapshot, "passed");
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

test("review requires current passing checks and confirmed inventory and reuses its assignment", (t) => {
  const { repo, spec, command, submission } = prepareImplementationForReview(t);
  const review = (inventory: string[]) =>
    invoke(repo, [
      "review",
      "--spec",
      spec,
      "--issue",
      "I-0001",
      "--inventory",
      JSON.stringify(inventory),
      "--author",
      "controller",
    ]);

  const missingCheck = review(["feature.ts"]);
  assert.notEqual(missingCheck.status, 0);
  assert.match(missingCheck.stderr, /Required check .* is missing/);

  const failedCheck = recordReviewCheck(repo, spec, command, submission.snapshot, "failed");
  assert.equal(failedCheck.status, 0, failedCheck.stderr);
  const failedReview = review(["feature.ts"]);
  assert.notEqual(failedReview.status, 0);
  assert.match(failedReview.stderr, /Required check .* is failed/);

  const passingCheck = recordReviewCheck(repo, spec, command, submission.snapshot, "passed");
  assert.equal(passingCheck.status, 0, passingCheck.stderr);
  const wrongInventory = review([]);
  assert.notEqual(wrongInventory.status, 0);
  assert.match(wrongInventory.stderr, /inventory/i);
  const ledgerPath = join(repo, ".scratch", "0001-claim-flow", "sdd.json");
  assert.equal(JSON.parse(readFileSync(ledgerPath, "utf8")).issues[0].reviewAssignments, undefined);

  const dispatched = review(["feature.ts"]);
  assert.equal(dispatched.status, 0, dispatched.stderr);
  const result = JSON.parse(dispatched.stdout) as {
    issue: string;
    execution: string;
    assignments: {
      id: string;
      agent: string;
      role: string;
      scope: string;
      snapshot: string;
      inventory: string[];
      report: string;
      status: string;
    }[];
  };
  assert.equal(result.issue, "I-0001");
  assert.equal(result.execution, "reviewing");
  assert.equal(result.assignments.length, 1);
  const assignment = result.assignments[0]!;
  assert.match(assignment.id, /^[0-9a-f-]{36}$/i);
  assert.equal(assignment.agent, "sdd-reviewer");
  assert.equal(assignment.role, "review");
  assert.equal(assignment.scope, "initial");
  assert.equal(assignment.snapshot, submission.snapshot);
  assert.deepEqual(assignment.inventory, ["feature.ts"]);
  assert.match(assignment.report, /I-0001-review-/);
  assert.equal(assignment.status, "pending");

  const status = invoke(repo, ["status", "--spec", spec]);
  assert.equal(status.status, 0, status.stderr);
  assert.deepEqual(JSON.parse(status.stdout).pendingAssignments, [
    {
      issue: "I-0001",
      id: assignment.id,
      role: "review",
      action: "review",
      report: assignment.report,
      status: "pending",
      agent: "sdd-reviewer",
      scope: "initial",
    },
  ]);

  const repeated = review(["feature.ts"]);
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.equal(JSON.parse(repeated.stdout).assignments[0].id, assignment.id);
  assert.equal(JSON.parse(repeated.stdout).idempotent, true);
  const persisted = JSON.parse(readFileSync(ledgerPath, "utf8"));
  assert.equal(persisted.issues[0].reviewAssignments.length, 1);
  const issueText = readFileSync(
    join(repo, ".scratch", "0001-claim-flow", "issues", "I-0001.md"),
    "utf8",
  );
  assert.equal(issueText.match(/Initial review assignment recorded/g)?.length, 1);
});

test("required specialist reviews are justified, distinct, provenance-bound, and gate acceptance", (t) => {
  const { repo, spec, command, submission } = prepareImplementationForReview(t);
  const ledgerPath = join(repo, ".scratch", "0001-claim-flow", "sdd.json");
  const issuePath = join(repo, ".scratch", "0001-claim-flow", "issues", "I-0001.md");
  const requireReview = (agent: string, details: string) =>
    invoke(repo, [
      "review",
      "require",
      "--spec",
      spec,
      "--issue",
      "I-0001",
      "--agent",
      agent,
      "--details",
      details,
      "--author",
      "controller",
    ]);

  const originalLedger = readFileSync(ledgerPath, "utf8");
  const originalIssue = readFileSync(issuePath, "utf8");
  const unknownAgent = requireReview("not-in-catalog", "Inspect generated source API usage.");
  assert.notEqual(unknownAgent.status, 0);
  assert.match(unknownAgent.stderr, /unknown.*agent|catalog/i);
  assert.equal(readFileSync(ledgerPath, "utf8"), originalLedger);
  assert.equal(readFileSync(issuePath, "utf8"), originalIssue);

  const ineligibleAgent = requireReview("sdd-implementer", "Inspect generated source API usage.");
  assert.notEqual(ineligibleAgent.status, 0);
  assert.match(ineligibleAgent.stderr, /not explicitly marked review-eligible/i);
  assert.equal(readFileSync(ledgerPath, "utf8"), originalLedger);
  assert.equal(readFileSync(issuePath, "utf8"), originalIssue);

  const details = "Check that generated TypeScript declarations preserve exported API contracts.";
  const required = requireReview("sdd-code-reviewer", details);
  assert.equal(required.status, 0, required.stderr);
  const requirement = JSON.parse(required.stdout).requirement as {
    agent: string;
    details: string;
    author: string;
  };
  assert.equal(requirement.agent, "sdd-code-reviewer");
  assert.equal(requirement.details, details);
  assert.equal(requirement.author, "controller");

  const repeated = requireReview("sdd-code-reviewer", details);
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.equal(JSON.parse(repeated.stdout).idempotent, true);
  const conflicting = requireReview(
    "sdd-code-reviewer",
    "Replace the original objective with an unrelated review.",
  );
  assert.notEqual(conflicting.status, 0);
  assert.match(conflicting.stderr, /already pinned/i);
  const registeredLedger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  assert.equal(registeredLedger.issues[0].reviewRequirements.length, 1);
  assert.equal(registeredLedger.issues[0].reviewRequirements[0].details, details);
  assert.match(readFileSync(issuePath, "utf8"), /Specialist review required/);

  const check = recordReviewCheck(repo, spec, command, submission.snapshot, "passed");
  assert.equal(check.status, 0, check.stderr);
  const dispatched = invoke(repo, [
    "review",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--inventory",
    JSON.stringify(["feature.ts"]),
    "--author",
    "controller",
  ]);
  assert.equal(dispatched.status, 0, dispatched.stderr);
  const assignments = JSON.parse(dispatched.stdout).assignments as {
    id: string;
    agent: string;
    role: string;
    objective?: string;
    report: string;
    status: string;
  }[];
  assert.deepEqual(
    assignments.map(({ agent, role, objective }) => ({
      agent,
      role,
      objective,
    })),
    [
      { agent: "sdd-reviewer", role: "review", objective: undefined },
      { agent: "sdd-code-reviewer", role: "review", objective: details },
    ],
  );
  assert.equal(new Set(assignments.map((assignment) => assignment.id)).size, 2);
  assert.equal(new Set(assignments.map((assignment) => assignment.report)).size, 2);
  assert.ok(assignments.every((assignment) => assignment.status === "pending"));
  const status = invoke(repo, ["status", "--spec", spec]);
  assert.equal(status.status, 0, status.stderr);
  assert.equal(
    JSON.parse(status.stdout).pendingAssignments.find(
      (assignment: { agent?: string }) => assignment.agent === "sdd-code-reviewer",
    ).objective,
    details,
  );

  const lateRequirement = requireReview("sdd-reviewer", "Check for an unrelated concern.");
  assert.notEqual(lateRequirement.status, 0);
  assert.match(lateRequirement.stderr, /review.*already.*assigned|frozen/i);
  assert.equal(JSON.parse(readFileSync(ledgerPath, "utf8")).issues[0].reviewRequirements.length, 1);

  const defaultReviewer = assignments.find((assignment) => assignment.agent === "sdd-reviewer")!;
  const specialist = assignments.find((assignment) => assignment.agent === "sdd-code-reviewer")!;
  writeFileSync(defaultReviewer.report, "# Comprehensive review\n\nNo defects found.\n");
  writeFileSync(specialist.report, "# Specialist review\n\nNo API defects found.\n");

  const substitutedSource = invoke(repo, [
    "submit",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--role",
    "review",
    "--assignment",
    specialist.id,
    "--report",
    defaultReviewer.report,
    "--result",
    "passed",
    "--no-findings",
    "--author",
    "controller",
  ]);
  assert.notEqual(substitutedSource.status, 0);
  assert.match(substitutedSource.stderr, /assigned destination|assignment/i);

  const submit = (assignment: (typeof assignments)[number]) =>
    invoke(repo, [
      "submit",
      "--spec",
      spec,
      "--issue",
      "I-0001",
      "--role",
      "review",
      "--assignment",
      assignment.id,
      "--report",
      assignment.report,
      "--result",
      "passed",
      "--no-findings",
      "--author",
      "controller",
    ]);
  const defaultSubmitted = submit(defaultReviewer);
  assert.equal(defaultSubmitted.status, 0, defaultSubmitted.stderr);
  const incompleteAcceptance = invoke(repo, [
    "accept",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.notEqual(incompleteAcceptance.status, 0);
  assert.match(incompleteAcceptance.stderr, /pending|coverage/i);

  const specialistSubmitted = submit(specialist);
  assert.equal(specialistSubmitted.status, 0, specialistSubmitted.stderr);
  const accepted = invoke(repo, [
    "accept",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.deepEqual(
    JSON.parse(accepted.stdout).reviews.map((review: { agent: string }) => review.agent),
    ["sdd-reviewer", "sdd-code-reviewer"],
  );
});

test("unavailable specialist submissions preserve the pinned objective separately from result details", (t) => {
  const { repo, spec, command, submission } = prepareImplementationForReview(t);
  const required = invoke(repo, [
    "review",
    "require",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--agent",
    "sdd-code-reviewer",
    "--details",
    "Check generated declarations against the exported runtime API.",
    "--author",
    "controller",
  ]);
  assert.equal(required.status, 0, required.stderr);
  const check = recordReviewCheck(repo, spec, command, submission.snapshot, "passed");
  assert.equal(check.status, 0, check.stderr);
  const dispatched = invoke(repo, [
    "review",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--inventory",
    JSON.stringify(["feature.ts"]),
    "--author",
    "controller",
  ]);
  assert.equal(dispatched.status, 0, dispatched.stderr);
  const assignment = JSON.parse(dispatched.stdout).assignments.find(
    (candidate: { agent: string }) => candidate.agent === "sdd-code-reviewer",
  ) as { id: string; report: string };
  writeFileSync(assignment.report, "# Specialist review\n\nCould not complete the assessment.\n");
  const failureDetails = "The generated declaration fixture is unavailable.";
  const submitted = invoke(repo, [
    "submit",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--role",
    "review",
    "--assignment",
    assignment.id,
    "--report",
    assignment.report,
    "--result",
    "unavailable",
    "--no-findings",
    "--details",
    failureDetails,
    "--author",
    "controller",
  ]);
  assert.equal(submitted.status, 0, submitted.stderr);
  const stored = JSON.parse(
    readFileSync(join(repo, ".scratch", "0001-claim-flow", "sdd.json"), "utf8"),
  ).issues[0].reviewAssignments.find(
    (candidate: { agent: string }) => candidate.agent === "sdd-code-reviewer",
  );
  assert.equal(stored.role, "review");
  assert.equal(stored.objective, "Check generated declarations against the exported runtime API.");
  assert.equal(stored.details, failureDetails);
});

test("review accepts a Git-derived mixed-case inventory in its supplied order", (t) => {
  const { repo, spec, command } = prepareImplementationForReview(t);
  writeFileSync(join(repo, "B.ts"), "export const upper = true;\n");
  writeFileSync(join(repo, "a.ts"), "export const lower = true;\n");
  const passingCheck = refreshReviewCheck(repo, spec, command);
  assert.equal(passingCheck.status, 0, passingCheck.stderr);

  const dispatched = invoke(repo, [
    "review",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--inventory",
    JSON.stringify(["B.ts", "a.ts", "feature.ts"]),
    "--author",
    "controller",
  ]);

  assert.equal(dispatched.status, 0, dispatched.stderr);
  assert.deepEqual(JSON.parse(dispatched.stdout).assignments[0].inventory, [
    "B.ts",
    "a.ts",
    "feature.ts",
  ]);
});

test("finding registration is explicit, canonical, issue-local, and idempotent", (t) => {
  const { repo, spec, assignment } = prepareReviewAssignment(t);
  writeFileSync(assignment.report, "# Review report\n\nThe change has a defect.\n");
  const create = (extra: string[] = []) =>
    invoke(repo, [
      "finding",
      "create",
      "--spec",
      spec,
      "--issue",
      "I-0001",
      "--source",
      assignment.report,
      "--snapshot",
      assignment.snapshot,
      "--severity",
      "high",
      "--blocking",
      "--summary",
      "Incorrect result for empty input",
      "--details",
      "The implementation returns a success result for empty input.",
      "--author",
      "controller",
      ...extra,
    ]);

  const registered = create();
  assert.equal(registered.status, 0, registered.stderr);
  const output = JSON.parse(registered.stdout) as {
    finding: {
      id: string;
      severity: string;
      blocking: boolean;
      status: string;
      summary: string;
      details: string;
      author: string;
      provenance: { report: string; snapshot: string }[];
    };
  };
  assert.equal(output.finding.id, "F-0001");
  assert.equal(output.finding.severity, "high");
  assert.equal(output.finding.blocking, true);
  assert.equal(output.finding.status, "open");
  assert.equal(output.finding.summary, "Incorrect result for empty input");
  assert.match(output.finding.details, /empty input/);
  assert.equal(output.finding.author, "controller");
  assert.deepEqual(output.finding.provenance, [
    {
      report: assignment.report,
      snapshot: assignment.snapshot,
      author: "controller",
      summary: "Incorrect result for empty input",
      details: "The implementation returns a success result for empty input.",
    },
  ]);

  const repeated = create();
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.equal(JSON.parse(repeated.stdout).finding.id, "F-0001");
  assert.equal(JSON.parse(repeated.stdout).idempotent, true);

  const ledger = JSON.parse(
    readFileSync(join(repo, ".scratch", "0001-claim-flow", "sdd.json"), "utf8"),
  );
  assert.equal(ledger.issues[0].findings.length, 1);
  assert.equal(ledger.issues[0].findings[0].id, "F-0001");
  const issueText = readFileSync(
    join(repo, ".scratch", "0001-claim-flow", "issues", "I-0001.md"),
    "utf8",
  );
  assert.match(issueText, /Finding F-0001 registered by controller/);

  const missingBlockingChoice = invoke(repo, [
    "finding",
    "create",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--source",
    assignment.report,
    "--snapshot",
    assignment.snapshot,
    "--severity",
    "medium",
    "--summary",
    "Missing blocking choice",
    "--details",
    "The blocking policy was omitted.",
    "--author",
    "controller",
  ]);
  assert.notEqual(missingBlockingChoice.status, 0);
  assert.match(missingBlockingChoice.stderr, /--blocking or --non-blocking/);
  assert.equal(
    JSON.parse(readFileSync(join(repo, ".scratch", "0001-claim-flow", "sdd.json"), "utf8"))
      .issues[0].findings.length,
    1,
  );
});

test("finding IDs restart per issue and require provenance from that issue's review", (t) => {
  const { repo, git, spec, assignment } = prepareReviewAssignment(t);
  writeFileSync(assignment.report, "# First issue review\n\nFinding from the first issue.\n");
  const firstFinding = invoke(repo, [
    "finding",
    "create",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--source",
    assignment.report,
    "--snapshot",
    assignment.snapshot,
    "--severity",
    "high",
    "--non-blocking",
    "--summary",
    "First issue observation",
    "--details",
    "This observation belongs to issue one.",
    "--author",
    "controller",
  ]);
  assert.equal(firstFinding.status, 0, firstFinding.stderr);
  assert.equal(JSON.parse(firstFinding.stdout).finding.id, "F-0001");
  const firstStatus = invoke(repo, ["status", "--spec", spec]);
  assert.equal(firstStatus.status, 0, firstStatus.stderr);
  assert.equal(JSON.parse(firstStatus.stdout).findings[0].finding.severity, "high");
  assert.equal(JSON.parse(firstStatus.stdout).findings[0].finding.blocking, false);
  assert.equal(
    JSON.parse(firstStatus.stdout).blockers.some((blocker: { reason: string }) =>
      /Finding F-0001/.test(blocker.reason),
    ),
    false,
  );

  const created = invoke(repo, [
    "issue",
    "create",
    "--spec",
    spec,
    "--title",
    "Second issue",
    "--reporter",
    "requester",
    "--category",
    "enhancement",
    "--author",
    "controller",
  ]);
  assert.equal(created.status, 0, created.stderr);
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
    "Requirements are complete.",
    "--author",
    "controller",
  ]);
  assert.equal(triaged.status, 0, triaged.stderr);
  const command = "just test::test tests/feature-two.test.ts";
  const required = invoke(repo, [
    "checks",
    "require",
    "--spec",
    spec,
    "--issue",
    "I-0002",
    "--command",
    command,
    "--author",
    "controller",
  ]);
  assert.equal(required.status, 0, required.stderr);
  commitAll(repo, git, "prepare second issue");

  const claimed = invoke(repo, [
    "claim",
    "--spec",
    spec,
    "--issue",
    "I-0002",
    "--author",
    "controller",
  ]);
  assert.equal(claimed.status, 0, claimed.stderr);
  writeFileSync(join(repo, "feature-two.ts"), "export const second = true;\n");
  const implementation = invoke(repo, [
    "implement",
    "--spec",
    spec,
    "--issue",
    "I-0002",
    "--author",
    "controller",
  ]);
  assert.equal(implementation.status, 0, implementation.stderr);
  const implementationReport = JSON.parse(implementation.stdout).assignment.report as string;
  writeFileSync(implementationReport, "# Second implementation\n\nCompleted.\n");
  const submittedImplementation = invoke(repo, [
    "submit",
    "--spec",
    spec,
    "--issue",
    "I-0002",
    "--role",
    "implementation",
    "--report",
    implementationReport,
    "--author",
    "controller",
  ]);
  assert.equal(submittedImplementation.status, 0, submittedImplementation.stderr);
  const secondSnapshot = JSON.parse(submittedImplementation.stdout).snapshot as string;
  const check = invoke(repo, [
    "checks",
    "record",
    "--spec",
    spec,
    "--issue",
    "I-0002",
    "--snapshot",
    secondSnapshot,
    "--command",
    command,
    "--result",
    "passed",
    "--author",
    "controller",
  ]);
  assert.equal(check.status, 0, check.stderr);
  const review = invoke(repo, [
    "review",
    "--spec",
    spec,
    "--issue",
    "I-0002",
    "--inventory",
    JSON.stringify(["feature-two.ts"]),
    "--author",
    "controller",
  ]);
  assert.equal(review.status, 0, review.stderr);
  const secondAssignment = JSON.parse(review.stdout).assignments[0] as {
    report: string;
    snapshot: string;
  };
  writeFileSync(secondAssignment.report, "# Second issue review\n\nFinding from issue two.\n");
  const secondFinding = invoke(repo, [
    "finding",
    "create",
    "--spec",
    spec,
    "--issue",
    "I-0002",
    "--source",
    secondAssignment.report,
    "--snapshot",
    secondAssignment.snapshot,
    "--severity",
    "low",
    "--blocking",
    "--summary",
    "Second issue observation",
    "--details",
    "This observation belongs to issue two.",
    "--author",
    "controller",
  ]);
  assert.equal(secondFinding.status, 0, secondFinding.stderr);
  assert.equal(JSON.parse(secondFinding.stdout).finding.id, "F-0001");
  assert.equal(JSON.parse(secondFinding.stdout).finding.blocking, true);
});

test("review submission requires canonical findings or exclusive no-findings and cannot bypass blockers", (t) => {
  const { repo, spec, assignment } = prepareReviewAssignment(t);
  writeFileSync(assignment.report, "# Review report\n\nA blocking issue was found.\n");
  const createFinding = (source = assignment.report, snapshot = assignment.snapshot) =>
    invoke(repo, [
      "finding",
      "create",
      "--spec",
      spec,
      "--issue",
      "I-0001",
      "--source",
      source,
      "--snapshot",
      snapshot,
      "--severity",
      "low",
      "--blocking",
      "--summary",
      "Acceptance regression",
      "--details",
      "The behavior violates an acceptance requirement.",
      "--author",
      "controller",
    ]);
  const created = createFinding();
  assert.equal(created.status, 0, created.stderr);
  const submit = (extra: string[]) =>
    invoke(repo, [
      "submit",
      "--spec",
      spec,
      "--issue",
      "I-0001",
      "--role",
      "review",
      "--assignment",
      assignment.id,
      "--report",
      assignment.report,
      "--result",
      "passed",
      ...extra,
      "--author",
      "controller",
    ]);

  const undeclared = submit([]);
  assert.notEqual(undeclared.status, 0);
  assert.match(undeclared.stderr, /--findings or exclusive --no-findings/);

  const contradictory = submit(["--findings", "F-0001", "--no-findings"]);
  assert.notEqual(contradictory.status, 0);
  assert.match(contradictory.stderr, /cannot be combined|mutually exclusive/i);

  const unknownFinding = submit(["--findings", "F-9999"]);
  assert.notEqual(unknownFinding.status, 0);
  assert.match(unknownFinding.stderr, /finding F-9999|provenance/i);

  const falseNoFindings = submit(["--no-findings"]);
  assert.notEqual(falseNoFindings.status, 0);
  assert.match(falseNoFindings.stderr, /registered findings|cannot declare --no-findings/i);

  const wrongSource = createFinding(
    join(repo, ".scratch", "0001-claim-flow", "reports", "I-0001-implementation.md"),
    assignment.snapshot,
  );
  assert.notEqual(wrongSource.status, 0);
  assert.match(wrongSource.stderr, /source report and snapshot/i);

  const registered = submit(["--findings", "F-0001"]);
  assert.equal(registered.status, 0, registered.stderr);
  const result = JSON.parse(registered.stdout).assignment as {
    result: string;
    noFindings?: boolean;
    findingIds?: string[];
  };
  assert.equal(JSON.parse(registered.stdout).execution, "changes-requested");
  assert.equal(result.result, "passed");
  assert.equal(result.noFindings, undefined);
  assert.deepEqual(result.findingIds, ["F-0001"]);
  const repeatedSubmission = submit(["--findings", "F-0001"]);
  assert.equal(repeatedSubmission.status, 0, repeatedSubmission.stderr);
  assert.equal(JSON.parse(repeatedSubmission.stdout).idempotent, true);

  const ledgerPath = join(repo, ".scratch", "0001-claim-flow", "sdd.json");
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  assert.deepEqual(ledger.issues[0].reviewAssignments[0].findingIds, ["F-0001"]);
  const accepted = invoke(repo, [
    "accept",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.notEqual(accepted.status, 0);
  assert.match(accepted.stderr, /F-0001.*blocking|blocking.*F-0001/i);

  const next = invoke(repo, ["next", "--spec", spec]);
  const status = invoke(repo, ["status", "--spec", spec]);
  assert.equal(next.status, 0, next.stderr);
  assert.equal(status.status, 0, status.stderr);
  assert.deepEqual(JSON.parse(next.stdout).actions, [
    { issue: "I-0001", action: "adjudicate-findings" },
  ]);
  assert.match(JSON.stringify(JSON.parse(next.stdout).blockers), /F-0001/);
  assert.match(JSON.stringify(JSON.parse(status.stdout).blockers), /F-0001/);
  assert.equal(JSON.parse(next.stdout).findings[0].finding.id, "F-0001");
  assert.equal(JSON.parse(status.stdout).findings[0].finding.id, "F-0001");
});

test("review submission rejects equals-form declaration conflicts without registered findings", (t) => {
  const { repo, spec, assignment } = prepareReviewAssignment(t);
  writeFileSync(assignment.report, "# Review report\n\nNo findings were registered.\n");
  const submitted = invoke(repo, [
    "submit",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--role",
    "review",
    "--assignment",
    assignment.id,
    "--report",
    assignment.report,
    "--result",
    "passed",
    "--findings=F-0001",
    "--no-findings",
    "--author",
    "controller",
  ]);

  assert.notEqual(submitted.status, 0);
  assert.match(submitted.stderr, /cannot be combined|mutually exclusive/i);
});

test("review submission permits flag-like text in a parsed option value", (t) => {
  const { repo, spec, assignment } = prepareReviewAssignment(t);
  writeFileSync(assignment.report, "# Review report\n\nThe report is unavailable for review.\n");
  const details = "--findings";
  const submitted = invoke(repo, [
    "submit",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--role",
    "review",
    "--assignment",
    assignment.id,
    "--report",
    assignment.report,
    "--result",
    "failed",
    "--no-findings",
    "--details",
    details,
    "--author",
    "controller",
  ]);

  assert.equal(submitted.status, 0, submitted.stderr);
  const result = JSON.parse(submitted.stdout) as {
    execution: string;
    assignment: { noFindings?: boolean; details?: string };
  };
  assert.equal(result.execution, "changes-requested");
  assert.equal(result.assignment.noFindings, true);
  assert.equal(result.assignment.details, details);
});

test("finding rulings persist, require evidence or rationale, and keep deferral from clearing blockers", (t) => {
  const { repo, spec, command, assignment } = prepareReviewAssignment(t);
  writeFileSync(assignment.report, "# Review report\n\nRulings need explicit evidence.\n");
  const create = (blocking: boolean, summary: string) =>
    invoke(repo, [
      "finding",
      "create",
      "--spec",
      spec,
      "--issue",
      "I-0001",
      "--source",
      assignment.report,
      "--snapshot",
      assignment.snapshot,
      "--severity",
      "medium",
      blocking ? "--blocking" : "--non-blocking",
      "--summary",
      summary,
      "--details",
      "Finding details.",
      "--author",
      "controller",
    ]);
  const blocking = create(true, "Blocking finding");
  assert.equal(blocking.status, 0, blocking.stderr);
  const dismissible = create(false, "Nonblocking finding");
  assert.equal(dismissible.status, 0, dismissible.stderr);
  const update = (finding: string, status: string, extra: string[] = []) =>
    invoke(repo, [
      "finding",
      "update",
      "--spec",
      spec,
      "--issue",
      "I-0001",
      "--finding",
      finding,
      "--status",
      status,
      ...extra,
      "--author",
      "controller",
    ]);

  const confirmed = update("F-0001", "confirmed", ["--details", "Confirmed as valid."]);
  assert.equal(confirmed.status, 0, confirmed.stderr);
  assert.equal(JSON.parse(confirmed.stdout).finding.status, "confirmed");
  assert.match(
    JSON.stringify(JSON.parse(invoke(repo, ["status", "--spec", spec]).stdout).blockers),
    /F-0001/,
  );

  const beforeInvalidFix = readFileSync(
    join(repo, ".scratch", "0001-claim-flow", "sdd.json"),
    "utf8",
  );
  const missingEvidence = update("F-0001", "fixed");
  assert.notEqual(missingEvidence.status, 0);
  assert.match(missingEvidence.stderr, /--evidence/);
  assert.equal(
    readFileSync(join(repo, ".scratch", "0001-claim-flow", "sdd.json"), "utf8"),
    beforeInvalidFix,
  );

  const invalidEvidence = update("F-0001", "fixed", ["--evidence", "0".repeat(64)]);
  assert.notEqual(invalidEvidence.status, 0);
  assert.match(invalidEvidence.stderr, /current snapshot|verification evidence/i);
  assert.equal(
    readFileSync(join(repo, ".scratch", "0001-claim-flow", "sdd.json"), "utf8"),
    beforeInvalidFix,
  );

  const sameSnapshotFix = update("F-0001", "fixed", ["--evidence", assignment.snapshot]);
  assert.notEqual(sameSnapshotFix.status, 0);
  assert.match(sameSnapshotFix.stderr, /observation|changed content|different snapshot/i);
  assert.equal(
    readFileSync(join(repo, ".scratch", "0001-claim-flow", "sdd.json"), "utf8"),
    beforeInvalidFix,
  );

  writeFileSync(join(repo, "feature.ts"), "export const feature = false;\n");
  const changedStatus = invoke(repo, ["status", "--spec", spec]);
  assert.equal(changedStatus.status, 0, changedStatus.stderr);
  const correctedSnapshot = JSON.parse(changedStatus.stdout).snapshots[0].snapshot as string;
  assert.notEqual(correctedSnapshot, assignment.snapshot);
  const correctedCheck = recordReviewCheck(repo, spec, command, correctedSnapshot, "passed");
  assert.equal(correctedCheck.status, 0, correctedCheck.stderr);

  const fixed = update("F-0001", "fixed", ["--evidence", correctedSnapshot]);
  assert.equal(fixed.status, 0, fixed.stderr);
  assert.equal(JSON.parse(fixed.stdout).finding.status, "fixed");
  assert.equal(JSON.parse(fixed.stdout).finding.verification.snapshot, correctedSnapshot);

  const missingDismissal = update("F-0001", "dismissed");
  assert.notEqual(missingDismissal.status, 0);
  assert.match(missingDismissal.stderr, /--details/);
  const dismissed = update("F-0001", "dismissed", [
    "--details",
    "The report's claim is incorrect because empty input is rejected.",
  ]);
  assert.equal(dismissed.status, 0, dismissed.stderr);
  assert.equal(JSON.parse(dismissed.stdout).finding.status, "dismissed");

  const prohibitedDeferral = update("F-0001", "deferred", [
    "--details",
    "Postponed.",
    "--follow-up",
    "I-0002",
  ]);
  assert.notEqual(prohibitedDeferral.status, 0);
  assert.match(
    prohibitedDeferral.stderr,
    /blocking finding.*cannot be deferred|approved requirements decision/i,
  );

  const missingFollowUp = update("F-0002", "deferred", ["--details", "Postponed for later."]);
  assert.notEqual(missingFollowUp.status, 0);
  assert.match(missingFollowUp.stderr, /--follow-up/);
  const deferred = update("F-0002", "deferred", [
    "--details",
    "Postponed for later.",
    "--follow-up",
    "I-0002",
  ]);
  assert.equal(deferred.status, 0, deferred.stderr);
  assert.equal(JSON.parse(deferred.stdout).finding.status, "deferred");
  assert.equal(JSON.parse(deferred.stdout).finding.followUp, "I-0002");

  const prohibitedStatus = update("F-0002", "wontfix", ["--details", "Not doing this."]);
  assert.notEqual(prohibitedStatus.status, 0);
  assert.match(prohibitedStatus.stderr, /Invalid finding status/);

  const repeated = update("F-0002", "deferred", [
    "--details",
    "Postponed for later.",
    "--follow-up",
    "I-0002",
  ]);
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.equal(JSON.parse(repeated.stdout).idempotent, true);
  const persisted = JSON.parse(
    readFileSync(join(repo, ".scratch", "0001-claim-flow", "sdd.json"), "utf8"),
  );
  assert.equal(persisted.issues[0].findings[0].status, "dismissed");
  assert.equal(persisted.issues[0].findings[1].status, "deferred");
  assert.equal(persisted.issues[0].findings[1].history.at(-1).author, "controller");
});

test("finding duplicates link explicitly while preserving every source report provenance", (t) => {
  const { repo, spec, assignment } = prepareReviewAssignment(t);
  const ledgerPath = join(repo, ".scratch", "0001-claim-flow", "sdd.json");
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  const secondId = "review-two";
  const secondReport = join(
    repo,
    ".scratch",
    "0001-claim-flow",
    "reports",
    `I-0001-review-${secondId}.md`,
  );
  const secondAssignment = {
    ...ledger.issues[0].reviewAssignments[0],
    id: secondId,
    report: secondReport,
  };
  ledger.issues[0].reviewAssignments.push(secondAssignment);
  const thirdId = "review-three";
  const thirdReport = join(
    repo,
    ".scratch",
    "0001-claim-flow",
    "reports",
    `I-0001-review-${thirdId}.md`,
  );
  ledger.issues[0].reviewAssignments.push({
    ...secondAssignment,
    id: thirdId,
    report: thirdReport,
  });
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  writeFileSync(assignment.report, "# First review\n\nA duplicated observation.\n");
  writeFileSync(secondReport, "# Second review\n\nThe same defect is observed.\n");
  writeFileSync(thirdReport, "# Third review\n\nThe same defect is observed.\n");

  const create = (source: string, extra: string[] = []) =>
    invoke(repo, [
      "finding",
      "create",
      "--spec",
      spec,
      "--issue",
      "I-0001",
      "--source",
      source,
      "--snapshot",
      assignment.snapshot,
      "--severity",
      "medium",
      "--non-blocking",
      "--summary",
      "Same underlying observation",
      "--details",
      "Both reports identify the same behavior.",
      ...extra,
      "--author",
      "controller",
    ]);

  const first = create(assignment.report);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(JSON.parse(first.stdout).finding.id, "F-0001");

  const linked = create(secondReport, ["--link", "F-0001"]);
  assert.equal(linked.status, 0, linked.stderr);
  assert.equal(JSON.parse(linked.stdout).finding.id, "F-0001");
  assert.deepEqual(JSON.parse(linked.stdout).finding.provenance, [
    {
      report: assignment.report,
      snapshot: assignment.snapshot,
      author: "controller",
      summary: "Same underlying observation",
      details: "Both reports identify the same behavior.",
    },
    {
      report: secondReport,
      snapshot: assignment.snapshot,
      author: "controller",
      summary: "Same underlying observation",
      details: "Both reports identify the same behavior.",
    },
  ]);
  assert.equal(JSON.parse(linked.stdout).idempotent, undefined);

  const repeatedLink = create(secondReport, ["--link", "F-0001"]);
  assert.equal(repeatedLink.status, 0, repeatedLink.stderr);
  assert.equal(JSON.parse(repeatedLink.stdout).idempotent, true);

  const independent = create(thirdReport);
  assert.equal(independent.status, 0, independent.stderr);
  assert.equal(JSON.parse(independent.stdout).finding.id, "F-0002");
  const persisted = JSON.parse(readFileSync(ledgerPath, "utf8"));
  assert.equal(persisted.issues[0].findings.length, 2);
  assert.equal(persisted.issues[0].findings[0].provenance.length, 2);
});

test("a fresh linked observation reopens resolved findings and blocks acceptance until reverified", (t) => {
  const { repo, spec, assignment } = prepareReviewAssignment(t);
  const initialProvenance: unknown[] = [];
  writeFileSync(assignment.report, "# Initial review\n\nTwo findings require correction.\n");
  const createFinding = (blocking: boolean, summary: string) =>
    invoke(repo, [
      "finding",
      "create",
      "--spec",
      spec,
      "--issue",
      "I-0001",
      "--source",
      assignment.report,
      "--snapshot",
      assignment.snapshot,
      "--severity",
      "high",
      blocking ? "--blocking" : "--non-blocking",
      "--summary",
      summary,
      "--details",
      `${summary} was observed in the initial review.`,
      "--author",
      "controller",
    ]);

  const blocking = createFinding(true, "Blocking recurrence");
  assert.equal(blocking.status, 0, blocking.stderr);
  const nonBlocking = createFinding(false, "Nonblocking recurrence");
  assert.equal(nonBlocking.status, 0, nonBlocking.stderr);
  const firstCanonical = JSON.parse(blocking.stdout).finding;
  const secondCanonical = JSON.parse(nonBlocking.stdout).finding;
  initialProvenance.push(firstCanonical.provenance[0], secondCanonical.provenance[0]);

  const initialSubmission = invoke(repo, [
    "submit",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--role",
    "review",
    "--assignment",
    assignment.id,
    "--report",
    assignment.report,
    "--result",
    "failed",
    "--findings",
    "F-0001",
    "F-0002",
    "--details",
    "The blocking defect requires correction.",
    "--author",
    "controller",
  ]);
  assert.equal(initialSubmission.status, 0, initialSubmission.stderr);
  assert.equal(JSON.parse(initialSubmission.stdout).execution, "changes-requested");

  const update = (finding: string, status: string, extra: string[] = []) =>
    invoke(repo, [
      "finding",
      "update",
      "--spec",
      spec,
      "--issue",
      "I-0001",
      "--finding",
      finding,
      "--status",
      status,
      ...extra,
      "--author",
      "controller",
    ]);
  const dismissedBlocking = update("F-0001", "dismissed", [
    "--details",
    "The initial observation was invalid.",
  ]);
  assert.equal(dismissedBlocking.status, 0, dismissedBlocking.stderr);
  assert.equal(JSON.parse(dismissedBlocking.stdout).finding.status, "dismissed");
  const dismissed = update("F-0002", "dismissed", [
    "--details",
    "The original nonblocking observation was not valid.",
  ]);
  assert.equal(dismissed.status, 0, dismissed.stderr);
  assert.equal(JSON.parse(dismissed.stdout).finding.status, "dismissed");

  const freshReview = invoke(repo, [
    "review",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--inventory",
    JSON.stringify(["feature.ts"]),
    "--author",
    "controller",
  ]);
  assert.equal(freshReview.status, 0, freshReview.stderr);
  const freshAssignment = JSON.parse(freshReview.stdout).assignments[0] as {
    id: string;
    snapshot: string;
    report: string;
  };
  assert.notEqual(freshAssignment.id, assignment.id);
  assert.equal(freshAssignment.snapshot, assignment.snapshot);
  writeFileSync(freshAssignment.report, "# Fresh review\n\nBoth observations recur.\n");

  const link = (finding: string, blocking: boolean, summary: string) =>
    invoke(repo, [
      "finding",
      "create",
      "--spec",
      spec,
      "--issue",
      "I-0001",
      "--source",
      freshAssignment.report,
      "--snapshot",
      freshAssignment.snapshot,
      "--severity",
      "high",
      blocking ? "--blocking" : "--non-blocking",
      "--summary",
      summary,
      "--details",
      `${summary} was independently observed in the fresh review.`,
      "--link",
      finding,
      "--author",
      "controller",
    ]);
  const relinkedBlocking = link("F-0001", true, "Blocking recurrence");
  assert.equal(relinkedBlocking.status, 0, relinkedBlocking.stderr);
  const relinkedNonBlocking = link("F-0002", false, "Nonblocking recurrence");
  assert.equal(relinkedNonBlocking.status, 0, relinkedNonBlocking.stderr);

  const blockingAfterLink = JSON.parse(relinkedBlocking.stdout).finding;
  const nonBlockingAfterLink = JSON.parse(relinkedNonBlocking.stdout).finding;
  assert.equal(blockingAfterLink.status, "open");
  assert.equal(blockingAfterLink.blocking, true);
  assert.equal(blockingAfterLink.verification, undefined);
  assert.equal(nonBlockingAfterLink.status, "open");
  assert.equal(nonBlockingAfterLink.blocking, false);
  assert.equal(nonBlockingAfterLink.rulingDetails, undefined);
  assert.deepEqual(blockingAfterLink.provenance[0], initialProvenance[0]);
  assert.deepEqual(nonBlockingAfterLink.provenance[0], initialProvenance[1]);
  assert.equal(blockingAfterLink.provenance[1].report, freshAssignment.report);
  assert.equal(nonBlockingAfterLink.provenance[1].report, freshAssignment.report);

  const resubmitted = invoke(repo, [
    "submit",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--role",
    "review",
    "--assignment",
    freshAssignment.id,
    "--report",
    freshAssignment.report,
    "--result",
    "passed",
    "--findings",
    "F-0001",
    "F-0002",
    "--author",
    "controller",
  ]);
  assert.equal(resubmitted.status, 0, resubmitted.stderr);
  assert.equal(JSON.parse(resubmitted.stdout).execution, "changes-requested");

  const beforeFreshVerification = invoke(repo, [
    "accept",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.notEqual(beforeFreshVerification.status, 0);
  assert.match(beforeFreshVerification.stderr, /F-0001.*blocking|blocking.*F-0001/i);

  const repeatedSnapshotFix = update("F-0001", "fixed", ["--evidence", freshAssignment.snapshot]);
  assert.notEqual(repeatedSnapshotFix.status, 0);
  assert.match(repeatedSnapshotFix.stderr, /observation|changed content|different snapshot/i);
  const blockedAccept = invoke(repo, [
    "accept",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.notEqual(blockedAccept.status, 0);
  assert.match(blockedAccept.stderr, /F-0001.*blocking|blocking.*F-0001/i);
});

test("correct persists a finding-scoped attempt before returning an idempotent fix assignment", (t) => {
  const { repo, spec, assignment } = prepareReviewAssignment(t);
  writeFileSync(assignment.report, "# Initial review\n\nA blocking issue needs a fix.\n");
  const finding = invoke(repo, [
    "finding",
    "create",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--source",
    assignment.report,
    "--snapshot",
    assignment.snapshot,
    "--severity",
    "high",
    "--blocking",
    "--summary",
    "Incorrect empty-input behavior",
    "--details",
    "The implementation rejects an input that the requirements allow.",
    "--author",
    "controller",
  ]);
  assert.equal(finding.status, 0, finding.stderr);
  const confirmedFinding = invoke(repo, [
    "finding",
    "update",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--finding",
    "F-0001",
    "--status",
    "confirmed",
    "--author",
    "controller",
  ]);
  assert.equal(confirmedFinding.status, 0, confirmedFinding.stderr);
  const failedReview = invoke(repo, [
    "submit",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--role",
    "review",
    "--assignment",
    assignment.id,
    "--report",
    assignment.report,
    "--result",
    "failed",
    "--findings",
    "F-0001",
    "--details",
    "The implementation must be corrected.",
    "--author",
    "controller",
  ]);
  assert.equal(failedReview.status, 0, failedReview.stderr);

  const args = [
    "correct",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--findings",
    "F-0001",
    "--details",
    "Preserve the accepted empty-input behavior.",
    "--author",
    "controller",
  ];
  const dispatched = invoke(repo, args);
  assert.equal(dispatched.status, 0, dispatched.stderr);
  const first = JSON.parse(dispatched.stdout) as {
    execution: string;
    attempt: { number: number; findingIds: string[]; objective: string };
    assignment: { id: string; role: string; action: string; report: string; status: string };
  };
  assert.equal(first.execution, "implementing");
  assert.equal(first.attempt.number, 1);
  assert.deepEqual(first.attempt.findingIds, ["F-0001"]);
  assert.equal(first.attempt.objective, "Preserve the accepted empty-input behavior.");
  assert.equal(first.assignment.role, "implementation");
  assert.equal(first.assignment.action, "correct");
  assert.equal(first.assignment.status, "pending");
  assert.match(first.assignment.report, /round-1-fix\.md$/);

  const resumed = invoke(repo, args);
  assert.equal(resumed.status, 0, resumed.stderr);
  const repeated = JSON.parse(resumed.stdout) as typeof first & { idempotent?: boolean };
  assert.equal(repeated.idempotent, true);
  assert.equal(repeated.attempt.number, 1);
  assert.equal(repeated.assignment.id, first.assignment.id);
  assert.equal(repeated.assignment.report, first.assignment.report);
});

test("corrective implementation reports submit through the implementation evidence contract", (t) => {
  const { repo, spec, assignment } = prepareReviewAssignment(t);
  writeFileSync(assignment.report, "# Initial review\n\nA blocking issue needs a fix.\n");
  const finding = invoke(repo, [
    "finding",
    "create",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--source",
    assignment.report,
    "--snapshot",
    assignment.snapshot,
    "--severity",
    "high",
    "--blocking",
    "--summary",
    "Incorrect empty-input behavior",
    "--details",
    "The implementation rejects an input that the requirements allow.",
    "--author",
    "controller",
  ]);
  assert.equal(finding.status, 0, finding.stderr);
  const confirmedFinding = invoke(repo, [
    "finding",
    "update",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--finding",
    "F-0001",
    "--status",
    "confirmed",
    "--author",
    "controller",
  ]);
  assert.equal(confirmedFinding.status, 0, confirmedFinding.stderr);
  const failedReview = invoke(repo, [
    "submit",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--role",
    "review",
    "--assignment",
    assignment.id,
    "--report",
    assignment.report,
    "--result",
    "failed",
    "--findings",
    "F-0001",
    "--details",
    "The implementation must be corrected.",
    "--author",
    "controller",
  ]);
  assert.equal(failedReview.status, 0, failedReview.stderr);

  const dispatched = invoke(repo, [
    "correct",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--findings",
    "F-0001",
    "--details",
    "Preserve the accepted empty-input behavior.",
    "--author",
    "controller",
  ]);
  assert.equal(dispatched.status, 0, dispatched.stderr);
  const fix = JSON.parse(dispatched.stdout).assignment as {
    action: string;
    report: string;
  };
  writeFileSync(join(repo, "feature.ts"), "export const feature = 'corrected';\n");
  writeFileSync(fix.report, "# Correction report\n\nCorrected the finding.\n");

  const submitted = invoke(repo, [
    "submit",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--role",
    "implementation",
    "--report",
    fix.report,
    "--author",
    "controller",
  ]);
  assert.equal(submitted.status, 0, submitted.stderr);
  const result = JSON.parse(submitted.stdout) as {
    execution: string;
    assignment: { action: string; status: string };
  };
  assert.equal(result.execution, "reviewing");
  assert.equal(result.assignment.action, "correct");
  assert.equal(result.assignment.status, "submitted");
});

test("a current non-mechanical failed check can select a correction before initial review", (t) => {
  const { repo, spec, command, submission } = prepareImplementationForReview(t);
  const failed = recordReviewCheck(repo, spec, command, submission.snapshot, "failed");
  assert.equal(failed.status, 0, failed.stderr);

  const corrected = invoke(repo, [
    "correct",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--check-failure",
    command,
    "--details",
    "Address the behavior exposed by the failing check.",
    "--author",
    "controller",
  ]);
  assert.equal(corrected.status, 0, corrected.stderr);
  const output = JSON.parse(corrected.stdout) as {
    attempt: { number: number; checkFailure: string; findingIds: string[] };
    assignment: { action: string; report: string };
  };
  assert.equal(output.attempt.number, 1);
  assert.equal(output.attempt.checkFailure, command);
  assert.deepEqual(output.attempt.findingIds, []);
  assert.equal(output.assignment.action, "correct");
  assert.match(output.assignment.report, /round-1-fix\.md$/);
});

test("explicit progress assessments permit productive continuation beyond five attempts", (t) => {
  const { repo, spec, command, submission } = prepareImplementationForReview(t);
  const failed = recordReviewCheck(repo, spec, command, submission.snapshot, "failed");
  assert.equal(failed.status, 0, failed.stderr);
  let correction = invoke(repo, [
    "correct",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--check-failure",
    command,
    "--details",
    "Fix the first observed check failure.",
    "--author",
    "controller",
  ]);
  assert.equal(correction.status, 0, correction.stderr);
  let attemptNumber = 1;

  for (let nextAttempt = 1; nextAttempt <= 6; nextAttempt += 1) {
    const assigned = JSON.parse(correction.stdout).assignment as {
      report: string;
      attempt: number;
    };
    assert.equal(assigned.attempt, nextAttempt);
    writeFileSync(join(repo, "feature.ts"), `export const feature = ${nextAttempt};\n`);
    writeFileSync(assigned.report, `# Correction ${nextAttempt}\n\nProgress recorded.\n`);
    const submitted = invoke(repo, [
      "submit",
      "--spec",
      spec,
      "--issue",
      "I-0001",
      "--role",
      "implementation",
      "--report",
      assigned.report,
      "--author",
      "controller",
    ]);
    assert.equal(submitted.status, 0, submitted.stderr);
    if (nextAttempt < 6) {
      const currentSnapshot = JSON.parse(submitted.stdout).snapshot as string;
      const nextFailedCheck = recordReviewCheck(repo, spec, command, currentSnapshot, "failed");
      assert.equal(nextFailedCheck.status, 0, nextFailedCheck.stderr);
      const unassessed = invoke(repo, [
        "correct",
        "--spec",
        spec,
        "--issue",
        "I-0001",
        "--check-failure",
        command,
        "--details",
        `Address the newly observed behavior after correction ${nextAttempt}.`,
        "--decision",
        "continue",
        "--assessment",
        `Correction ${nextAttempt} changed the reviewed behavior; continue with the newly assessed failure.`,
        "--author",
        "controller",
      ]);
      assert.notEqual(unassessed.status, 0);
      assert.match(unassessed.stderr, /assessment-result/i);
      correction = invoke(repo, [
        "correct",
        "--spec",
        spec,
        "--issue",
        "I-0001",
        "--check-failure",
        command,
        "--details",
        `Address the newly observed behavior after correction ${nextAttempt}.`,
        "--decision",
        "continue",
        "--assessment",
        `Correction ${nextAttempt} changed the reviewed behavior; continue with the newly assessed failure.`,
        "--assessment-result",
        "productive",
        "--author",
        "controller",
      ]);
      assert.equal(correction.status, 0, correction.stderr);
      attemptNumber = JSON.parse(correction.stdout).attempt.number as number;
    }
  }

  assert.equal(attemptNumber, 6);
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
  const attempts = JSON.parse(resumed.stdout).correctionAttempts as {
    number: number;
    assignment: { status: string };
    progressAssessment?: { decision: string; details: string };
    checks?: unknown[];
  }[];
  assert.equal(attempts.length, 6);
  assert.deepEqual(
    attempts.map((attempt) => attempt.number),
    [1, 2, 3, 4, 5, 6],
  );
  assert.ok(attempts.every((attempt) => attempt.assignment.status === "submitted"));
  assert.ok(
    attempts.slice(0, 5).every((attempt) => attempt.progressAssessment?.decision === "continue"),
  );
  assert.ok(attempts.every((attempt) => (attempt.checks?.length ?? 0) > 0));
});

test("a progress pause records adjudication and resume preserves it without dispatching a fix", (t) => {
  const { repo, spec, command, submission } = prepareImplementationForReview(t);
  const failed = recordReviewCheck(repo, spec, command, submission.snapshot, "failed");
  assert.equal(failed.status, 0, failed.stderr);

  const paused = invoke(repo, [
    "correct",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--decision",
    "pause",
    "--reason",
    "no-progress",
    "--details",
    "The repeated check failure has no demonstrated progress; request controller adjudication.",
    "--author",
    "controller",
  ]);
  assert.equal(paused.status, 0, paused.stderr);
  const pause = JSON.parse(paused.stdout) as {
    paused: boolean;
    adjudication: { status: string; reason: string; details: string };
    assignment?: unknown;
  };
  assert.equal(pause.paused, true);
  assert.equal(pause.adjudication.status, "pending");
  assert.equal(pause.adjudication.reason, "no-progress");
  assert.equal(pause.assignment, undefined);

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
  const resume = JSON.parse(resumed.stdout) as {
    adjudication?: { status: string; reason: string };
    correctionAttempts?: unknown[];
  };
  assert.equal(resume.adjudication?.status, "pending");
  assert.equal(resume.adjudication?.reason, "no-progress");
  assert.deepEqual(resume.correctionAttempts, []);
});

test("corrective review findings retain assignment provenance for the next progress decision", (t) => {
  const { repo, spec, command, assignment } = prepareReviewAssignment(t);
  writeFileSync(assignment.report, "# Initial review\n\nA blocking issue needs a fix.\n");
  const finding = invoke(repo, [
    "finding",
    "create",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--source",
    assignment.report,
    "--snapshot",
    assignment.snapshot,
    "--severity",
    "high",
    "--blocking",
    "--summary",
    "Incorrect empty-input behavior",
    "--details",
    "The implementation rejects an input that the requirements allow.",
    "--author",
    "controller",
  ]);
  assert.equal(finding.status, 0, finding.stderr);
  const confirmedFinding = invoke(repo, [
    "finding",
    "update",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--finding",
    "F-0001",
    "--status",
    "confirmed",
    "--author",
    "controller",
  ]);
  assert.equal(confirmedFinding.status, 0, confirmedFinding.stderr);
  const failedReview = invoke(repo, [
    "submit",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--role",
    "review",
    "--assignment",
    assignment.id,
    "--report",
    assignment.report,
    "--result",
    "failed",
    "--findings",
    "F-0001",
    "--details",
    "The implementation must be corrected.",
    "--author",
    "controller",
  ]);
  assert.equal(failedReview.status, 0, failedReview.stderr);

  const corrected = invoke(repo, [
    "correct",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--findings",
    "F-0001",
    "--details",
    "Preserve the accepted empty-input behavior.",
    "--author",
    "controller",
  ]);
  assert.equal(corrected.status, 0, corrected.stderr);
  const fix = JSON.parse(corrected.stdout).assignment as { report: string };
  writeFileSync(join(repo, "feature.ts"), "export const feature = 'fixed';\n");
  writeFileSync(fix.report, "# Correction report\n\nCorrected F-0001.\n");
  const submitted = invoke(repo, [
    "submit",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--role",
    "implementation",
    "--report",
    fix.report,
    "--author",
    "controller",
  ]);
  assert.equal(submitted.status, 0, submitted.stderr);
  const fixedSnapshot = JSON.parse(submitted.stdout).snapshot as string;
  const passingCheck = recordReviewCheck(repo, spec, command, fixedSnapshot, "passed");
  assert.equal(passingCheck.status, 0, passingCheck.stderr);

  const dispatched = invoke(repo, [
    "review",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--inventory",
    JSON.stringify(["feature.ts"]),
    "--author",
    "controller",
  ]);
  assert.equal(dispatched.status, 0, dispatched.stderr);
  const correctiveReview = JSON.parse(dispatched.stdout).assignments[0] as {
    scope: string;
    attempt?: number;
    snapshot: string;
  };
  assert.equal(correctiveReview.scope, "corrective");
  assert.equal(correctiveReview.attempt, 1);
  assert.equal(correctiveReview.snapshot, fixedSnapshot);

  writeFileSync(
    JSON.parse(dispatched.stdout).assignments[0].report,
    "# Corrective review\n\nA separate actionable defect remains.\n",
  );
  const correctiveFinding = invoke(repo, [
    "finding",
    "create",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--source",
    JSON.parse(dispatched.stdout).assignments[0].report,
    "--snapshot",
    fixedSnapshot,
    "--severity",
    "medium",
    "--blocking",
    "--summary",
    "A new regression remains",
    "--details",
    "The correction introduced a second issue that needs a separate fix.",
    "--author",
    "controller",
  ]);
  assert.equal(correctiveFinding.status, 0, correctiveFinding.stderr);
  assert.equal(JSON.parse(correctiveFinding.stdout).finding.id, "F-0002");
  const failedCorrectiveReview = invoke(repo, [
    "submit",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--role",
    "review",
    "--assignment",
    correctiveReview.id,
    "--report",
    JSON.parse(dispatched.stdout).assignments[0].report,
    "--result",
    "failed",
    "--findings",
    "F-0002",
    "--details",
    "The new blocker requires another assessed correction.",
    "--author",
    "controller",
  ]);
  assert.equal(failedCorrectiveReview.status, 0, failedCorrectiveReview.stderr);
  assert.equal(JSON.parse(failedCorrectiveReview.stdout).execution, "changes-requested");
});

test("resume returns pending corrective reviews after initial review coverage is submitted", (t) => {
  const { repo, spec, command, assignment } = prepareReviewAssignment(t);
  writeFileSync(assignment.report, "# Initial review\n\nA blocking issue needs a fix.\n");
  const finding = invoke(repo, [
    "finding",
    "create",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--source",
    assignment.report,
    "--snapshot",
    assignment.snapshot,
    "--severity",
    "high",
    "--blocking",
    "--summary",
    "Incorrect empty-input behavior",
    "--details",
    "The implementation rejects an input that the requirements allow.",
    "--author",
    "controller",
  ]);
  assert.equal(finding.status, 0, finding.stderr);
  const confirmedFinding = invoke(repo, [
    "finding",
    "update",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--finding",
    "F-0001",
    "--status",
    "confirmed",
    "--author",
    "controller",
  ]);
  assert.equal(confirmedFinding.status, 0, confirmedFinding.stderr);
  const submittedInitialReview = invoke(repo, [
    "submit",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--role",
    "review",
    "--assignment",
    assignment.id,
    "--report",
    assignment.report,
    "--result",
    "failed",
    "--findings",
    "F-0001",
    "--details",
    "The implementation must be corrected.",
    "--author",
    "controller",
  ]);
  assert.equal(submittedInitialReview.status, 0, submittedInitialReview.stderr);

  const correction = invoke(repo, [
    "correct",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--findings",
    "F-0001",
    "--details",
    "Correct the empty-input behavior.",
    "--author",
    "controller",
  ]);
  assert.equal(correction.status, 0, correction.stderr);
  const implementation = JSON.parse(correction.stdout).assignment as { report: string };
  writeFileSync(join(repo, "feature.ts"), "export const feature = 'fixed';\n");
  writeFileSync(implementation.report, "# Correction report\n\nCorrected F-0001.\n");
  const submittedCorrection = invoke(repo, [
    "submit",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--role",
    "implementation",
    "--report",
    implementation.report,
    "--author",
    "controller",
  ]);
  assert.equal(submittedCorrection.status, 0, submittedCorrection.stderr);
  const correctedSnapshot = JSON.parse(submittedCorrection.stdout).snapshot as string;
  assert.notEqual(correctedSnapshot, assignment.snapshot);
  const passingCheck = recordReviewCheck(repo, spec, command, correctedSnapshot, "passed");
  assert.equal(passingCheck.status, 0, passingCheck.stderr);

  const dispatchedReview = invoke(repo, [
    "review",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--inventory",
    JSON.stringify(["feature.ts"]),
    "--author",
    "controller",
  ]);
  assert.equal(dispatchedReview.status, 0, dispatchedReview.stderr);
  const correctiveAssignments = JSON.parse(dispatchedReview.stdout).assignments as {
    id: string;
    scope: string;
    status: string;
  }[];
  assert.equal(correctiveAssignments.length, 1);
  assert.equal(correctiveAssignments[0]?.scope, "corrective");
  assert.equal(correctiveAssignments[0]?.status, "pending");

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
  const result = JSON.parse(resumed.stdout) as {
    nextAction: string;
    reviewAssignments: { id: string; scope: string; status: string }[];
    blocker?: string;
  };
  assert.equal(result.nextAction, "await-review-report");
  assert.equal(result.blocker, undefined);
  assert.deepEqual(
    result.reviewAssignments.map(({ id, scope, status }) => ({ id, scope, status })),
    correctiveAssignments.map(({ id, scope, status }) => ({ id, scope, status })),
  );
});

test("a verified corrective review can complete acceptance while retaining initial coverage", (t) => {
  const { repo, spec, command, assignment } = prepareReviewAssignment(t);
  writeFileSync(assignment.report, "# Initial review\n\nA blocking issue needs a fix.\n");
  const finding = invoke(repo, [
    "finding",
    "create",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--source",
    assignment.report,
    "--snapshot",
    assignment.snapshot,
    "--severity",
    "high",
    "--blocking",
    "--summary",
    "Incorrect empty-input behavior",
    "--details",
    "The implementation rejects an input that the requirements allow.",
    "--author",
    "controller",
  ]);
  assert.equal(finding.status, 0, finding.stderr);
  const confirmedFinding = invoke(repo, [
    "finding",
    "update",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--finding",
    "F-0001",
    "--status",
    "confirmed",
    "--author",
    "controller",
  ]);
  assert.equal(confirmedFinding.status, 0, confirmedFinding.stderr);
  const failedReview = invoke(repo, [
    "submit",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--role",
    "review",
    "--assignment",
    assignment.id,
    "--report",
    assignment.report,
    "--result",
    "failed",
    "--findings",
    "F-0001",
    "--details",
    "The implementation must be corrected.",
    "--author",
    "controller",
  ]);
  assert.equal(failedReview.status, 0, failedReview.stderr);

  const correction = invoke(repo, [
    "correct",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--findings",
    "F-0001",
    "--details",
    "Preserve the accepted empty-input behavior.",
    "--author",
    "controller",
  ]);
  assert.equal(correction.status, 0, correction.stderr);
  const fix = JSON.parse(correction.stdout).assignment as { report: string };
  writeFileSync(join(repo, "feature.ts"), "export const feature = 'fixed';\n");
  writeFileSync(fix.report, "# Correction report\n\nCorrected F-0001.\n");
  const implementation = invoke(repo, [
    "submit",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--role",
    "implementation",
    "--report",
    fix.report,
    "--author",
    "controller",
  ]);
  assert.equal(implementation.status, 0, implementation.stderr);
  const fixedSnapshot = JSON.parse(implementation.stdout).snapshot as string;
  const passingCheck = recordReviewCheck(repo, spec, command, fixedSnapshot, "passed");
  assert.equal(passingCheck.status, 0, passingCheck.stderr);
  const verified = invoke(repo, [
    "finding",
    "update",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--finding",
    "F-0001",
    "--status",
    "fixed",
    "--evidence",
    fixedSnapshot,
    "--author",
    "controller",
  ]);
  assert.equal(verified.status, 0, verified.stderr);

  const dispatched = invoke(repo, [
    "review",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--inventory",
    JSON.stringify(["feature.ts"]),
    "--author",
    "controller",
  ]);
  assert.equal(dispatched.status, 0, dispatched.stderr);
  const review = JSON.parse(dispatched.stdout).assignments[0] as {
    id: string;
    scope: string;
    report: string;
  };
  assert.equal(review.scope, "corrective");
  writeFileSync(review.report, "# Corrective review\n\nF-0001 is fixed; no regressions found.\n");
  const reviewed = invoke(repo, [
    "submit",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--role",
    "review",
    "--assignment",
    review.id,
    "--report",
    review.report,
    "--result",
    "passed",
    "--no-findings",
    "--author",
    "controller",
  ]);
  assert.equal(reviewed.status, 0, reviewed.stderr);

  const accepted = invoke(repo, [
    "accept",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.equal(JSON.parse(accepted.stdout).execution, "accepted");
});

test("requirements decisions require fresh review before deferring a blocking finding", (t) => {
  const { repo, spec, command, assignment } = prepareReviewAssignment(t);
  writeFileSync(assignment.report, "# Initial review\n\nA criterion is implicated.\n");
  const created = invoke(repo, [
    "finding",
    "create",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--source",
    assignment.report,
    "--snapshot",
    assignment.snapshot,
    "--severity",
    "high",
    "--blocking",
    "--summary",
    "Scope no longer includes this behavior",
    "--details",
    "The current acceptance criteria require this behavior.",
    "--author",
    "controller",
  ]);
  assert.equal(created.status, 0, created.stderr);
  const initialReview = invoke(repo, [
    "submit",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--role",
    "review",
    "--assignment",
    assignment.id,
    "--report",
    assignment.report,
    "--result",
    "passed",
    "--findings",
    "F-0001",
    "--author",
    "controller",
  ]);
  assert.equal(initialReview.status, 0, initialReview.stderr);

  const issuePath = join(repo, ".scratch", "0001-claim-flow", "issues", "I-0001.md");
  const initialIssue = readFileSync(issuePath, "utf8");
  writeFileSync(
    issuePath,
    initialIssue.replace(
      "## Acceptance Criteria\n\n## Comments",
      "## Acceptance Criteria\n\nThe changed scope excludes this behavior.\n\n## Comments",
    ),
  );
  const deferred = (extra: string[]) =>
    invoke(repo, [
      "finding",
      "update",
      "--spec",
      spec,
      "--issue",
      "I-0001",
      "--finding",
      "F-0001",
      "--status",
      "deferred",
      "--details",
      "The approved scope no longer includes this behavior.",
      "--follow-up",
      "Future follow-up",
      ...extra,
      "--author",
      "controller",
    ]);

  const noDecision = deferred([]);
  assert.notEqual(noDecision.status, 0);
  assert.match(noDecision.stderr, /approved requirements decision|cannot be deferred/i);

  const decided = invoke(repo, [
    "requirements",
    "decide",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--finding",
    "F-0001",
    "--decision",
    "approved",
    "--details",
    "This requirements decision explicitly revises the acceptance criteria to exclude this behavior.",
    "--author",
    "controller",
  ]);
  assert.equal(decided.status, 0, decided.stderr);
  const decision = JSON.parse(decided.stdout).decision as {
    id: string;
    status: string;
    requirementsSnapshot: string;
  };
  assert.equal(decision.id, "R-0001");
  assert.equal(decision.status, "approved");

  const ledgerPath = join(repo, ".scratch", "0001-claim-flow", "sdd.json");
  const persistedDecision = JSON.parse(readFileSync(ledgerPath, "utf8")).issues[0];
  assert.equal(persistedDecision.reviewAssignments, undefined);
  assert.equal(persistedDecision.reviewHistory.length, 1);
  assert.equal(persistedDecision.requirementsDecisions[0].author, "controller");
  const decidedStatus = invoke(repo, ["status", "--spec", spec]);
  const decidedNext = invoke(repo, ["next", "--spec", spec]);
  assert.equal(decidedStatus.status, 0, decidedStatus.stderr);
  assert.equal(decidedNext.status, 0, decidedNext.stderr);
  assert.equal(JSON.parse(decidedStatus.stdout).requirementsDecisions[0].decision.id, "R-0001");
  assert.equal(JSON.parse(decidedNext.stdout).requirementsDecisions[0].decision.status, "approved");
  assert.match(JSON.stringify(JSON.parse(decidedStatus.stdout).blockers), /Required check .*stale/);

  const currentStatus = invoke(repo, ["status", "--spec", spec]);
  assert.equal(currentStatus.status, 0, currentStatus.stderr);
  const currentSnapshot = JSON.parse(currentStatus.stdout).snapshots[0].snapshot as string;
  const passing = recordReviewCheck(repo, spec, command, currentSnapshot, "passed");
  assert.equal(passing.status, 0, passing.stderr);

  const reviewed = invoke(repo, [
    "review",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--inventory",
    JSON.stringify(["feature.ts"]),
    "--author",
    "controller",
  ]);
  assert.equal(reviewed.status, 0, reviewed.stderr);
  const freshAssignment = JSON.parse(reviewed.stdout).assignments[0] as {
    id: string;
    report: string;
    snapshot: string;
    requirementsSnapshot: string;
  };
  assert.notEqual(freshAssignment.id, assignment.id);
  assert.equal(freshAssignment.requirementsSnapshot, decision.requirementsSnapshot);
  writeFileSync(freshAssignment.report, "# Fresh review\n\nThe revised criterion is reviewed.\n");
  const linked = invoke(repo, [
    "finding",
    "create",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--source",
    freshAssignment.report,
    "--snapshot",
    freshAssignment.snapshot,
    "--severity",
    "high",
    "--blocking",
    "--summary",
    "Scope no longer includes this behavior",
    "--details",
    "The current acceptance criteria require this behavior.",
    "--link",
    "F-0001",
    "--author",
    "controller",
  ]);
  assert.equal(linked.status, 0, linked.stderr);
  const submitted = invoke(repo, [
    "submit",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--role",
    "review",
    "--assignment",
    freshAssignment.id,
    "--report",
    freshAssignment.report,
    "--result",
    "passed",
    "--findings",
    "F-0001",
    "--author",
    "controller",
  ]);
  assert.equal(submitted.status, 0, submitted.stderr);

  const finalDisposition = deferred(["--requirements-decision", decision.id]);
  assert.equal(finalDisposition.status, 0, finalDisposition.stderr);
  const finding = JSON.parse(finalDisposition.stdout).finding;
  assert.equal(finding.status, "deferred");
  assert.equal(finding.requirementsDecision, decision.id);
  const accepted = invoke(repo, [
    "accept",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.equal(JSON.parse(accepted.stdout).execution, "accepted");
});

test("review submission requires exact provenance, result, and explicit no-findings and is idempotent", (t) => {
  const { repo, spec, assignment } = prepareReviewAssignment(t);
  writeFileSync(assignment.report, "# Review report\n\nNo defects found.\n");
  const submit = (extra: string[]) =>
    invoke(repo, [
      "submit",
      "--spec",
      spec,
      "--issue",
      "I-0001",
      "--role",
      "review",
      ...extra,
      "--author",
      "controller",
    ]);

  const omittedNoFindings = submit([
    "--assignment",
    assignment.id,
    "--report",
    assignment.report,
    "--result",
    "passed",
  ]);
  assert.notEqual(omittedNoFindings.status, 0);
  assert.match(omittedNoFindings.stderr, /--no-findings/);

  const wrongAssignment = submit([
    "--assignment",
    `${assignment.id}-other`,
    "--report",
    assignment.report,
    "--result",
    "passed",
    "--no-findings",
  ]);
  assert.notEqual(wrongAssignment.status, 0);
  assert.match(wrongAssignment.stderr, /assignment/i);

  const wrongReport = submit([
    "--assignment",
    assignment.id,
    "--report",
    join(repo, ".scratch", "other-report.md"),
    "--result",
    "passed",
    "--no-findings",
  ]);
  assert.notEqual(wrongReport.status, 0);
  assert.match(wrongReport.stderr, /assigned destination/);

  const registered = submit([
    "--assignment",
    assignment.id,
    "--report",
    assignment.report,
    "--result",
    "passed",
    "--no-findings",
  ]);
  assert.equal(registered.status, 0, registered.stderr);
  const result = JSON.parse(registered.stdout) as {
    execution: string;
    assignment: {
      id: string;
      status: string;
      result: string;
      noFindings: boolean;
      snapshot: string;
      reportSha256: string;
    };
  };
  assert.equal(result.execution, "reviewing");
  assert.equal(result.assignment.id, assignment.id);
  assert.equal(result.assignment.status, "submitted");
  assert.equal(result.assignment.result, "passed");
  assert.equal(result.assignment.noFindings, true);
  assert.equal(result.assignment.snapshot, assignment.snapshot);
  assert.match(result.assignment.reportSha256, /^[0-9a-f]{64}$/);

  const repeated = submit([
    "--assignment",
    assignment.id,
    "--report",
    assignment.report,
    "--result",
    "passed",
    "--no-findings",
  ]);
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.equal(JSON.parse(repeated.stdout).idempotent, true);
  const issueText = readFileSync(
    join(repo, ".scratch", "0001-claim-flow", "issues", "I-0001.md"),
    "utf8",
  );
  assert.equal(issueText.match(/Review report submitted for assignment/g)?.length, 1);

  writeFileSync(assignment.report, "# Changed review report\n");
  const altered = submit([
    "--assignment",
    assignment.id,
    "--report",
    assignment.report,
    "--result",
    "passed",
    "--no-findings",
  ]);
  assert.notEqual(altered.status, 0);
  assert.match(altered.stderr, /changed after submission/);
});

test("failed review without a no-findings attestation requires details and blocks acceptance", (t) => {
  const { repo, spec, assignment } = prepareReviewAssignment(t);
  writeFileSync(assignment.report, "# Review report\n\nA blocking defect was found.\n");
  const submit = (details?: string, declareFindings = true) =>
    invoke(repo, [
      "submit",
      "--spec",
      spec,
      "--issue",
      "I-0001",
      "--role",
      "review",
      "--assignment",
      assignment.id,
      "--report",
      assignment.report,
      "--result",
      "failed",
      ...(declareFindings ? ["--no-findings"] : []),
      ...(details ? ["--details", details] : []),
      "--author",
      "controller",
    ]);

  const missingDetails = submit();
  assert.notEqual(missingDetails.status, 0);
  assert.match(missingDetails.stderr, /--details/);
  const missingDeclaration = submit("A blocking defect was found.", false);
  assert.notEqual(missingDeclaration.status, 0);
  assert.match(missingDeclaration.stderr, /--findings or exclusive --no-findings/);
  const recordedFailure = submit("A blocking defect was found in the implementation.");
  assert.equal(recordedFailure.status, 0, recordedFailure.stderr);
  const submitted = JSON.parse(recordedFailure.stdout).assignment;
  assert.equal(submitted.result, "failed");
  assert.equal(submitted.noFindings, true);
  assert.equal(submitted.details, "A blocking defect was found in the implementation.");
  assert.equal(
    JSON.parse(readFileSync(join(repo, ".scratch", "0001-claim-flow", "sdd.json"), "utf8"))
      .issues[0].reviewAssignments[0].details,
    "A blocking defect was found in the implementation.",
  );

  const accepted = invoke(repo, [
    "accept",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.notEqual(accepted.status, 0);
  assert.match(accepted.stderr, /failed/);
});

test("unavailable review without a no-findings attestation requires details and blocks acceptance", (t) => {
  const { repo, spec, assignment } = prepareReviewAssignment(t);
  writeFileSync(assignment.report, "# Review report\n\nReview could not be completed.\n");
  const submit = (details?: string) =>
    invoke(repo, [
      "submit",
      "--spec",
      spec,
      "--issue",
      "I-0001",
      "--role",
      "review",
      "--assignment",
      assignment.id,
      "--report",
      assignment.report,
      "--result",
      "unavailable",
      "--no-findings",
      ...(details ? ["--details", details] : []),
      "--author",
      "controller",
    ]);

  const missingDetails = submit();
  assert.notEqual(missingDetails.status, 0);
  assert.match(missingDetails.stderr, /--details/);
  const recordedUnavailable = submit("The reviewer could not assess whether findings exist.");
  assert.equal(recordedUnavailable.status, 0, recordedUnavailable.stderr);
  const submitted = JSON.parse(recordedUnavailable.stdout).assignment;
  assert.equal(submitted.result, "unavailable");
  assert.equal(submitted.noFindings, true);
  assert.equal(submitted.details, "The reviewer could not assess whether findings exist.");
  assert.equal(
    JSON.parse(readFileSync(join(repo, ".scratch", "0001-claim-flow", "sdd.json"), "utf8"))
      .issues[0].reviewAssignments[0].details,
    "The reviewer could not assess whether findings exist.",
  );

  const accepted = invoke(repo, [
    "accept",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.notEqual(accepted.status, 0);
  assert.match(accepted.stderr, /unavailable/);
});

test("accept requires current checks and a complete passing finding-free initial review", (t) => {
  const { repo, spec, assignment } = prepareReviewAssignment(t);
  writeFileSync(assignment.report, "# Review report\n\nNo defects found.\n");
  const submitted = invoke(repo, [
    "submit",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--role",
    "review",
    "--assignment",
    assignment.id,
    "--report",
    assignment.report,
    "--result",
    "passed",
    "--no-findings",
    "--author",
    "controller",
  ]);
  assert.equal(submitted.status, 0, submitted.stderr);

  const accepted = invoke(repo, [
    "accept",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.equal(accepted.status, 0, accepted.stderr);
  const result = JSON.parse(accepted.stdout) as {
    issue: string;
    execution: string;
    reviews: { agent: string; assignment: string; result: string; noFindings: boolean }[];
    snapshot: string;
  };
  assert.equal(result.issue, "I-0001");
  assert.equal(result.execution, "accepted");
  assert.deepEqual(result.reviews, [
    {
      agent: "sdd-reviewer",
      assignment: assignment.id,
      result: "passed",
      noFindings: true,
    },
  ]);
  assert.equal(result.snapshot, assignment.snapshot);
  assert.equal(
    JSON.parse(readFileSync(join(repo, ".scratch", "0001-claim-flow", "sdd.json"), "utf8"))
      .issues[0].execution,
    "accepted",
  );
  const repeated = invoke(repo, [
    "accept",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.equal(JSON.parse(repeated.stdout).idempotent, true);

  writeFileSync(join(repo, "feature.ts"), "export const feature = false;\n");
  const refreshedCheck = refreshReviewCheck(repo, spec, "just test::test tests/feature.test.ts");
  assert.equal(refreshedCheck.status, 0, refreshedCheck.stderr);
  const staleStatus = invoke(repo, ["status", "--spec", spec]);
  assert.equal(staleStatus.status, 0, staleStatus.stderr);
  const statusOutput = JSON.parse(staleStatus.stdout);
  assert.equal(statusOutput.state.issues[0].execution, "accepted");
  assert.equal(
    statusOutput.actions.some((action: { action: string }) => action.action === "integrate"),
    false,
  );
  assert.match(
    statusOutput.blockers.map((blocker: { reason: string }) => blocker.reason).join("\n"),
    /Review assignment .* stale/,
  );
});

test("integrate hands back the frozen accepted files and delivery records without changing Git", (t) => {
  const { repo, git, spec } = prepareAcceptedIssue(t);
  const headBefore = git("rev-parse", "HEAD");
  const statusBefore = git("status", "--porcelain");

  const prepared = invoke(repo, [
    "integrate",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);

  assert.equal(prepared.status, 0, prepared.stderr);
  const output = JSON.parse(prepared.stdout) as {
    issue: string;
    execution: string;
    acceptedFiles: string[];
    deliveryRecords: string[];
  };
  assert.equal(output.issue, "I-0001");
  assert.equal(output.execution, "accepted");
  assert.deepEqual(output.acceptedFiles, ["feature.ts"]);
  assert.ok(output.deliveryRecords.some((path) => path.endsWith("/sdd.json")));
  assert.equal(git("rev-parse", "HEAD"), headBefore);
  assert.equal(git("status", "--porcelain"), statusBefore);
});

test("integrate confirms an exact caller-owned commit idempotently and preserves accepted evidence", (t) => {
  const { repo, git, spec } = prepareAcceptedIssue(t);
  const handback = invoke(repo, [
    "integrate",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.equal(handback.status, 0, handback.stderr);

  git("add", "feature.ts");
  git("commit", "-qm", "deliver accepted feature");
  const commitSha = git("rev-parse", "HEAD");
  const confirmed = invoke(repo, [
    "integrate",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--commit",
    commitSha,
    "--author",
    "controller",
  ]);

  assert.equal(confirmed.status, 0, confirmed.stderr);
  const output = JSON.parse(confirmed.stdout) as {
    execution: string;
    commitSha: string;
    acceptedFiles: string[];
    deliveryRecords: string[];
  };
  assert.equal(output.execution, "integrated");
  assert.equal(output.commitSha, commitSha);
  assert.deepEqual(output.acceptedFiles, ["feature.ts"]);
  assert.ok(output.deliveryRecords.some((path) => path.endsWith("/sdd.json")));
  const issuePath = join(repo, ".scratch", "0001-claim-flow", "issues", "I-0001.md");
  const issueAfterConfirmation = readFileSync(issuePath, "utf8");
  assert.equal(git("rev-parse", "HEAD"), commitSha);

  const repeated = invoke(repo, [
    "integrate",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--commit",
    commitSha,
    "--author",
    "controller",
  ]);
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.equal(JSON.parse(repeated.stdout).idempotent, true);
  assert.equal(readFileSync(issuePath, "utf8"), issueAfterConfirmation);
  const status = invoke(repo, ["status", "--spec", spec]);
  assert.equal(status.status, 0, status.stderr);
  const statusOutput = JSON.parse(status.stdout);
  assert.equal(statusOutput.state.issues[0].execution, "integrated");
  assert.doesNotMatch(
    statusOutput.blockers.map((blocker: { reason: string }) => blocker.reason).join("\n"),
    /stale|missing.*check|review assignment/i,
  );
});

test("integrate rejects changed accepted content and unrelated pending changes without modifying them", (t) => {
  const changedAccepted = prepareAcceptedIssue(t);
  writeFileSync(join(changedAccepted.repo, "feature.ts"), "export const feature = false;\n");
  const changedStatusBefore = changedAccepted.git("status", "--porcelain");
  const changed = invoke(changedAccepted.repo, [
    "integrate",
    "--spec",
    changedAccepted.spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.notEqual(changed.status, 0);
  assert.match(changed.stderr, /accepted file content changed/i);
  assert.equal(changedAccepted.git("status", "--porcelain"), changedStatusBefore);
  assert.equal(
    readFileSync(join(changedAccepted.repo, "feature.ts"), "utf8"),
    "export const feature = false;\n",
  );

  const unrelated = prepareAcceptedIssue(t);
  writeFileSync(join(unrelated.repo, "unrelated.txt"), "keep this work\n");
  const unrelatedStatusBefore = unrelated.git("status", "--porcelain");
  const rejected = invoke(unrelated.repo, [
    "integrate",
    "--spec",
    unrelated.spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /inventory changed after acceptance/i);
  assert.equal(unrelated.git("status", "--porcelain"), unrelatedStatusBefore);
  assert.equal(readFileSync(join(unrelated.repo, "unrelated.txt"), "utf8"), "keep this work\n");
});

test("integrate rejects arbitrary pending files inside the feature workspace without changing workflow state", (t) => {
  const { repo, git, spec } = prepareAcceptedIssue(t);
  const userFile = join(repo, ".scratch", "0001-claim-flow", "notes.txt");
  writeFileSync(userFile, "keep this user-authored note\n");
  const statusBefore = git("status", "--porcelain");
  const ledgerPath = join(repo, ".scratch", "0001-claim-flow", "sdd.json");
  const ledgerBefore = readFileSync(ledgerPath, "utf8");

  const rejected = invoke(repo, [
    "integrate",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);

  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /unsafe unrelated pending changes/i);
  assert.equal(readFileSync(userFile, "utf8"), "keep this user-authored note\n");
  assert.equal(git("status", "--porcelain"), statusBefore);
  assert.equal(readFileSync(ledgerPath, "utf8"), ledgerBefore);
  assert.equal(JSON.parse(ledgerBefore).issues[0].execution, "accepted");
});

test("integrate rejects divergent staged accepted-file bytes while preserving index and worktree", (t) => {
  const { repo, git, spec } = prepareAcceptedIssue(t);
  const acceptedContent = readFileSync(join(repo, "feature.ts"), "utf8");
  git("add", "feature.ts");
  git("commit", "-qm", "deliver accepted feature");
  const commitSha = git("rev-parse", "HEAD");

  writeFileSync(join(repo, "feature.ts"), "export const feature = 'staged divergence';\n");
  git("add", "feature.ts");
  writeFileSync(join(repo, "feature.ts"), acceptedContent);
  const statusBefore = git("status", "--porcelain");
  const stagedContentBefore = execFileSync("git", ["show", ":feature.ts"], { cwd: repo });
  const worktreeContentBefore = readFileSync(join(repo, "feature.ts"), "utf8");
  const ledgerPath = join(repo, ".scratch", "0001-claim-flow", "sdd.json");
  const ledgerBefore = readFileSync(ledgerPath, "utf8");

  const rejected = invoke(repo, [
    "integrate",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--commit",
    commitSha,
    "--author",
    "controller",
  ]);

  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /staged|index|accepted.*content/i);
  assert.equal(git("rev-parse", "HEAD"), commitSha);
  assert.equal(git("status", "--porcelain"), statusBefore);
  assert.deepEqual(
    execFileSync("git", ["show", ":feature.ts"], { cwd: repo }),
    stagedContentBefore,
  );
  assert.deepEqual(
    stagedContentBefore,
    Buffer.from("export const feature = 'staged divergence';\n"),
  );
  assert.equal(readFileSync(join(repo, "feature.ts"), "utf8"), worktreeContentBefore);
  assert.equal(worktreeContentBefore, acceptedContent);
  assert.equal(readFileSync(ledgerPath, "utf8"), ledgerBefore);
  assert.equal(JSON.parse(ledgerBefore).issues[0].execution, "accepted");
});

test("integrate rejects a caller commit whose blob differs from accepted content", (t) => {
  const { repo, git, spec } = prepareAcceptedIssue(t);
  writeFileSync(join(repo, "feature.ts"), "export const feature = false;\n");
  git("add", "feature.ts");
  git("commit", "-qm", "deliver mismatched feature");
  const commitSha = git("rev-parse", "HEAD");
  writeFileSync(join(repo, "feature.ts"), "export const feature = true;\n");
  const statusBefore = git("status", "--porcelain");

  const rejected = invoke(repo, [
    "integrate",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--commit",
    commitSha,
    "--author",
    "controller",
  ]);

  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /commit content does not match/i);
  assert.equal(git("rev-parse", "HEAD"), commitSha);
  assert.equal(git("status", "--porcelain"), statusBefore);
  assert.equal(
    JSON.parse(readFileSync(join(repo, ".scratch", "0001-claim-flow", "sdd.json"), "utf8"))
      .issues[0].execution,
    "accepted",
  );
});

test("integrate refuses caller confirmation when accepted required-check evidence is no longer passing", (t) => {
  const { repo, git, spec } = prepareAcceptedIssue(t);
  const ledgerPath = join(repo, ".scratch", "0001-claim-flow", "sdd.json");
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  ledger.issues[0].checks.records[0].result = "failed";
  ledger.issues[0].checks.records[0].details = "The accepted check is no longer passing.";
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);

  git("add", "feature.ts");
  git("commit", "-qm", "deliver accepted feature");
  const commitSha = git("rev-parse", "HEAD");
  const rejected = invoke(repo, [
    "integrate",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--commit",
    commitSha,
    "--author",
    "controller",
  ]);

  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /required check .* is failed/i);
  assert.equal(git("rev-parse", "HEAD"), commitSha);
  assert.equal(JSON.parse(readFileSync(ledgerPath, "utf8")).issues[0].execution, "accepted");
});

test("integrate rejects an altered registered review report as stale evidence", (t) => {
  const { repo, git, spec, assignment } = prepareAcceptedIssue(t);
  writeFileSync(assignment.report, "# Review report\n\nChanged after acceptance.\n");
  git("add", "feature.ts");
  git("commit", "-qm", "deliver accepted feature");
  const commitSha = git("rev-parse", "HEAD");

  const rejected = invoke(repo, [
    "integrate",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--commit",
    commitSha,
    "--author",
    "controller",
  ]);

  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /review report .*not current and submitted/i);
  assert.equal(
    JSON.parse(readFileSync(join(repo, ".scratch", "0001-claim-flow", "sdd.json"), "utf8"))
      .issues[0].execution,
    "accepted",
  );
});

test("dependent claims wait for caller-committed delivery records and reuse integrated evidence", (t) => {
  const { repo, git, spec } = prepareAcceptedIssue(t);
  const prepared = invoke(repo, [
    "integrate",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.equal(prepared.status, 0, prepared.stderr);

  git("add", "feature.ts");
  git("commit", "-qm", "deliver prerequisite");
  const commitSha = git("rev-parse", "HEAD");
  const integrated = invoke(repo, [
    "integrate",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--commit",
    commitSha,
    "--author",
    "controller",
  ]);
  assert.equal(integrated.status, 0, integrated.stderr);

  const created = invoke(repo, [
    "issue",
    "create",
    "--spec",
    spec,
    "--title",
    "Use the prerequisite",
    "--reporter",
    "requester",
    "--category",
    "enhancement",
    "--author",
    "maintainer",
  ]);
  assert.equal(created.status, 0, created.stderr);
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
    "Prerequisite integration is recorded.",
    "--author",
    "maintainer",
  ]);
  assert.equal(triaged.status, 0, triaged.stderr);

  const prematureClaim = invoke(repo, [
    "claim",
    "--spec",
    spec,
    "--issue",
    "I-0002",
    "--author",
    "controller",
  ]);
  assert.notEqual(prematureClaim.status, 0);
  assert.match(prematureClaim.stderr, /uncommitted delivery records/i);
  assert.equal(
    JSON.parse(readFileSync(join(repo, ".scratch", "0001-claim-flow", "sdd.json"), "utf8"))
      .issues[1].baseSha,
    undefined,
  );

  git("add", "-A");
  git("commit", "-qm", "record completed prerequisite delivery");
  const ready = invoke(repo, ["ready", "--spec", spec]);
  assert.equal(ready.status, 0, ready.stderr);
  assert.doesNotMatch(ready.stdout, /dependencies are not integrated: I-0001/i);
  const claimed = invoke(repo, [
    "claim",
    "--spec",
    spec,
    "--issue",
    "I-0002",
    "--author",
    "controller",
  ]);
  assert.equal(claimed.status, 0, claimed.stderr);
  assert.equal(JSON.parse(claimed.stdout).baseSha, git("rev-parse", "HEAD"));
});

test("accept rejects missing initial review coverage", (t) => {
  const accept = (repo: string, spec: string) =>
    invoke(repo, ["accept", "--spec", spec, "--issue", "I-0001", "--author", "controller"]);

  const unreviewed = prepareImplementationForReview(t);
  const passingCheck = recordReviewCheck(
    unreviewed.repo,
    unreviewed.spec,
    unreviewed.command,
    unreviewed.submission.snapshot,
    "passed",
  );
  assert.equal(passingCheck.status, 0, passingCheck.stderr);
  const missing = accept(unreviewed.repo, unreviewed.spec);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /review coverage/i);
});

test("accept rejects pending or failed initial reviews", (t) => {
  const accept = (repo: string, spec: string) =>
    invoke(repo, ["accept", "--spec", spec, "--issue", "I-0001", "--author", "controller"]);
  const reviewed = prepareReviewAssignment(t);
  const pending = accept(reviewed.repo, reviewed.spec);
  assert.notEqual(pending.status, 0);
  assert.match(pending.stderr, /pending/i);

  writeFileSync(reviewed.assignment.report, "# Review report\n\nReview is incomplete.\n");
  const failed = invoke(reviewed.repo, [
    "submit",
    "--spec",
    reviewed.spec,
    "--issue",
    "I-0001",
    "--role",
    "review",
    "--assignment",
    reviewed.assignment.id,
    "--report",
    reviewed.assignment.report,
    "--result",
    "failed",
    "--no-findings",
    "--details",
    "The implementation does not meet the acceptance criteria.",
    "--author",
    "controller",
  ]);
  assert.equal(failed.status, 0, failed.stderr);
  const rejected = accept(reviewed.repo, reviewed.spec);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /Review assignment .* is failed/);
});

test("required checks cannot change after review assignment freezes the snapshot", (t) => {
  const reviewed = prepareReviewAssignment(t);
  const additionalCheck = invoke(reviewed.repo, [
    "checks",
    "require",
    "--spec",
    reviewed.spec,
    "--issue",
    "I-0001",
    "--command",
    "just lint::check",
    "--author",
    "controller",
  ]);
  assert.notEqual(additionalCheck.status, 0);
  assert.match(additionalCheck.stderr, /frozen.*review/i);
});

test("interrupted review dispatch and submission resume the same persisted assignment", async (t) => {
  const { repo, spec, command, submission } = prepareImplementationForReview(t);
  const passingCheck = recordReviewCheck(repo, spec, command, submission.snapshot, "passed");
  assert.equal(passingCheck.status, 0, passingCheck.stderr);
  const reviewArgs = [
    "review",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--inventory",
    JSON.stringify(["feature.ts"]),
    "--author",
    "controller",
  ];
  const interruptedDispatch = await invokeAsync(repo, reviewArgs, {
    killOnOutput: '"assignments"',
  });
  assert.equal(interruptedDispatch.signal, "SIGKILL");
  const resumedDispatch = invoke(repo, [
    "resume",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.equal(resumedDispatch.status, 0, resumedDispatch.stderr);
  const resumed = JSON.parse(resumedDispatch.stdout) as {
    nextAction: string;
    reviewAssignments: { id: string; status: string; report: string }[];
  };
  assert.equal(resumed.nextAction, "await-review-report");
  assert.equal(resumed.reviewAssignments.length, 1);
  const assignment = resumed.reviewAssignments[0]!;
  assert.equal(assignment.status, "pending");
  writeFileSync(assignment.report, "# Review report\n\nNo defects found.\n");

  const submitArgs = [
    "submit",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--role",
    "review",
    "--assignment",
    assignment.id,
    "--report",
    assignment.report,
    "--result",
    "passed",
    "--no-findings",
    "--author",
    "controller",
  ];
  const interruptedSubmission = await invokeAsync(repo, submitArgs, {
    killOnOutput: '"reportSha256"',
  });
  assert.equal(interruptedSubmission.signal, "SIGKILL");
  const resumedSubmission = invoke(repo, [
    "resume",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.equal(resumedSubmission.status, 0, resumedSubmission.stderr);
  const resumedResult = JSON.parse(resumedSubmission.stdout) as {
    nextAction: string;
    reviewAssignments: { id: string; status: string; result: string }[];
  };
  assert.equal(resumedResult.nextAction, "accept");
  assert.equal(resumedResult.reviewAssignments[0]?.id, assignment.id);
  assert.equal(resumedResult.reviewAssignments[0]?.status, "submitted");
  assert.equal(resumedResult.reviewAssignments[0]?.result, "passed");

  const repeatedSubmission = invoke(repo, submitArgs);
  assert.equal(repeatedSubmission.status, 0, repeatedSubmission.stderr);
  assert.equal(JSON.parse(repeatedSubmission.stdout).idempotent, true);
  const issueText = readFileSync(
    join(repo, ".scratch", "0001-claim-flow", "issues", "I-0001.md"),
    "utf8",
  );
  assert.equal(issueText.match(/Review report submitted for assignment/g)?.length, 1);
});

test("review submission and acceptance reject changed requirements, code, and report content", (t) => {
  const { repo, spec, command, assignment } = prepareReviewAssignment(t);
  writeFileSync(assignment.report, "# Review report\n\nNo defects found.\n");
  const originalSpec = readFileSync(spec, "utf8");
  writeFileSync(spec, `${originalSpec}\nA new acceptance requirement.\n`);
  const staleRequirements = invoke(repo, [
    "submit",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--role",
    "review",
    "--assignment",
    assignment.id,
    "--report",
    assignment.report,
    "--result",
    "passed",
    "--no-findings",
    "--author",
    "controller",
  ]);
  assert.notEqual(staleRequirements.status, 0);
  assert.match(staleRequirements.stderr, /stale|frozen/i);

  writeFileSync(spec, originalSpec);
  const submitted = invoke(repo, [
    "submit",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--role",
    "review",
    "--assignment",
    assignment.id,
    "--report",
    assignment.report,
    "--result",
    "passed",
    "--no-findings",
    "--author",
    "controller",
  ]);
  assert.equal(submitted.status, 0, submitted.stderr);

  writeFileSync(join(repo, "feature.ts"), "export const feature = false;\n");
  const refreshedCodeCheck = refreshReviewCheck(repo, spec, command);
  assert.equal(refreshedCodeCheck.status, 0, refreshedCodeCheck.stderr);
  const staleCodeAcceptance = invoke(repo, [
    "accept",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.notEqual(staleCodeAcceptance.status, 0);
  assert.match(staleCodeAcceptance.stderr, /Review assignment .* stale/);

  writeFileSync(join(repo, "feature.ts"), "export const feature = true;\n");
  const originalCodeCheck = refreshReviewCheck(repo, spec, command);
  assert.equal(originalCodeCheck.status, 0, originalCodeCheck.stderr);
  writeFileSync(assignment.report, "# Altered report\n");
  const alteredReportAcceptance = invoke(repo, [
    "accept",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--author",
    "controller",
  ]);
  assert.notEqual(alteredReportAcceptance.status, 0);
  assert.match(alteredReportAcceptance.stderr, /review report .* changed after submission/i);
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

test("passing check evidence is reusable only for unchanged explicitly covered paths", (t) => {
  const { repo, spec, command, submission } = prepareImplementationForReview(t);
  const record = invoke(repo, [
    "checks",
    "record",
    "--spec",
    spec,
    "--issue",
    "I-0001",
    "--snapshot",
    submission.snapshot,
    "--command",
    command,
    "--result",
    "passed",
    "--paths",
    "feature.ts",
    "--author",
    "controller",
  ]);
  assert.equal(record.status, 0, record.stderr);
  writeFileSync(join(repo, "unrelated.ts"), "export const unrelated = true;\n");
  let status = invoke(repo, ["status", "--spec", spec]);
  assert.equal(status.status, 0, status.stderr);
  let state = JSON.parse(status.stdout) as {
    actions: { issue: string; action: string }[];
    blockers: { issue: string; reason: string }[];
  };
  assert.ok(state.actions.some((action) => action.action === "review"));
  assert.ok(!state.blockers.some((blocker) => blocker.reason.includes("Required check")));

  writeFileSync(join(repo, "feature.ts"), "export const feature = 'changed';\n");
  status = invoke(repo, ["status", "--spec", spec]);
  assert.equal(status.status, 0, status.stderr);
  state = JSON.parse(status.stdout) as typeof state;
  assert.ok(state.blockers.some((blocker) => blocker.reason.includes("Required check")));
  assert.ok(!state.actions.some((action) => action.action === "review"));
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
