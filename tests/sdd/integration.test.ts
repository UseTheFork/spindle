import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import {
  execute,
  invokeAsync,
  prepareImplementationForReview,
  recordReviewCheck,
  prepareReviewAssignment,
  prepareAcceptedIssue,
  refreshReviewCheck,
} from "./helpers.ts";
test("integrate hands back the frozen accepted files and delivery records without changing Git", () => {
  const { repo, git, spec } = prepareAcceptedIssue();
  const headBefore = git("rev-parse", "HEAD");
  const statusBefore = git("status", "--porcelain");

  const prepared = execute(repo, (service) =>
    service.integrate({ spec, issue: "I-0001", author: "controller" }),
  );

  expect(prepared.status, prepared.stderr).toBe(0);
  const output = JSON.parse(prepared.stdout) as {
    issue: string;
    execution: string;
    acceptedFiles: string[];
    deliveryRecords: string[];
  };
  expect(output.issue).toBe("I-0001");
  expect(output.execution).toBe("accepted");
  expect(output.acceptedFiles).toEqual(["feature.ts"]);
  expect(output.deliveryRecords.some((path) => path.endsWith("/sdd.json"))).toBeTruthy();
  expect(git("rev-parse", "HEAD")).toBe(headBefore);
  expect(git("status", "--porcelain")).toBe(statusBefore);
});

test("integrate confirms an exact caller-owned commit idempotently and preserves accepted evidence", () => {
  const { repo, git, spec } = prepareAcceptedIssue();
  const handback = execute(repo, (service) =>
    service.integrate({ spec, issue: "I-0001", author: "controller" }),
  );
  expect(handback.status, handback.stderr).toBe(0);

  git("add", "feature.ts");
  git("commit", "-qm", "deliver accepted feature");
  const commitSha = git("rev-parse", "HEAD");
  const confirmed = execute(repo, (service) =>
    service.integrate({ spec, issue: "I-0001", commit: commitSha, author: "controller" }),
  );

  expect(confirmed.status, confirmed.stderr).toBe(0);
  const output = JSON.parse(confirmed.stdout) as {
    execution: string;
    commitSha: string;
    acceptedFiles: string[];
    deliveryRecords: string[];
  };
  expect(output.execution).toBe("integrated");
  expect(output.commitSha).toBe(commitSha);
  expect(output.acceptedFiles).toEqual(["feature.ts"]);
  expect(output.deliveryRecords.some((path) => path.endsWith("/sdd.json"))).toBeTruthy();
  const issuePath = join(repo, ".scratch", "0001-claim-flow", "issues", "I-0001.md");
  const issueAfterConfirmation = readFileSync(issuePath, "utf8");
  expect(git("rev-parse", "HEAD")).toBe(commitSha);

  const repeated = execute(repo, (service) =>
    service.integrate({ spec, issue: "I-0001", commit: commitSha, author: "controller" }),
  );
  expect(repeated.status, repeated.stderr).toBe(0);
  expect(JSON.parse(repeated.stdout).idempotent).toBe(true);
  expect(readFileSync(issuePath, "utf8")).toBe(issueAfterConfirmation);
  const status = execute(repo, (service) => service.status({ spec }));
  expect(status.status, status.stderr).toBe(0);
  const statusOutput = JSON.parse(status.stdout);
  expect(statusOutput.state.issues[0].execution).toBe("integrated");
  expect(
    statusOutput.blockers.map((blocker: { reason: string }) => blocker.reason).join("\n"),
  ).not.toMatch(/stale|missing.*check|review assignment/i);
});

test("integrate rejects changed accepted content and unrelated pending changes without modifying them", () => {
  const changedAccepted = prepareAcceptedIssue();
  writeFileSync(join(changedAccepted.repo, "feature.ts"), "export const feature = false;\n");
  const changedStatusBefore = changedAccepted.git("status", "--porcelain");
  const changed = execute(changedAccepted.repo, (service) =>
    service.integrate({ spec: changedAccepted.spec, issue: "I-0001", author: "controller" }),
  );
  expect(changed.status).not.toBe(0);
  expect(changed.stderr).toMatch(/accepted file content changed/i);
  expect(changedAccepted.git("status", "--porcelain")).toBe(changedStatusBefore);
  expect(readFileSync(join(changedAccepted.repo, "feature.ts"), "utf8")).toBe(
    "export const feature = false;\n",
  );

  const unrelated = prepareAcceptedIssue();
  writeFileSync(join(unrelated.repo, "unrelated.txt"), "keep this work\n");
  const unrelatedStatusBefore = unrelated.git("status", "--porcelain");
  const rejected = execute(unrelated.repo, (service) =>
    service.integrate({ spec: unrelated.spec, issue: "I-0001", author: "controller" }),
  );
  expect(rejected.status).not.toBe(0);
  expect(rejected.stderr).toMatch(/inventory changed after acceptance/i);
  expect(unrelated.git("status", "--porcelain")).toBe(unrelatedStatusBefore);
  expect(readFileSync(join(unrelated.repo, "unrelated.txt"), "utf8")).toBe("keep this work\n");
});

test("integrate rejects arbitrary pending files inside the feature workspace without changing workflow state", () => {
  const { repo, git, spec } = prepareAcceptedIssue();
  const userFile = join(repo, ".scratch", "0001-claim-flow", "notes.txt");
  writeFileSync(userFile, "keep this user-authored note\n");
  const statusBefore = git("status", "--porcelain");
  const ledgerPath = join(repo, ".scratch", "0001-claim-flow", "sdd.json");
  const ledgerBefore = readFileSync(ledgerPath, "utf8");

  const rejected = execute(repo, (service) =>
    service.integrate({ spec, issue: "I-0001", author: "controller" }),
  );

  expect(rejected.status).not.toBe(0);
  expect(rejected.stderr).toMatch(/unsafe unrelated pending changes/i);
  expect(readFileSync(userFile, "utf8")).toBe("keep this user-authored note\n");
  expect(git("status", "--porcelain")).toBe(statusBefore);
  expect(readFileSync(ledgerPath, "utf8")).toBe(ledgerBefore);
  expect(JSON.parse(ledgerBefore).issues[0].execution).toBe("accepted");
});

test("integrate rejects divergent staged accepted-file bytes while preserving index and worktree", () => {
  const { repo, git, spec } = prepareAcceptedIssue();
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

  const rejected = execute(repo, (service) =>
    service.integrate({ spec, issue: "I-0001", commit: commitSha, author: "controller" }),
  );

  expect(rejected.status).not.toBe(0);
  expect(rejected.stderr).toMatch(/staged|index|accepted.*content/i);
  expect(git("rev-parse", "HEAD")).toBe(commitSha);
  expect(git("status", "--porcelain")).toBe(statusBefore);
  expect(execFileSync("git", ["show", ":feature.ts"], { cwd: repo })).toEqual(stagedContentBefore);
  expect(stagedContentBefore).toEqual(Buffer.from("export const feature = 'staged divergence';\n"));
  expect(readFileSync(join(repo, "feature.ts"), "utf8")).toBe(worktreeContentBefore);
  expect(worktreeContentBefore).toBe(acceptedContent);
  expect(readFileSync(ledgerPath, "utf8")).toBe(ledgerBefore);
  expect(JSON.parse(ledgerBefore).issues[0].execution).toBe("accepted");
});

test("integrate rejects a caller commit whose blob differs from accepted content", () => {
  const { repo, git, spec } = prepareAcceptedIssue();
  writeFileSync(join(repo, "feature.ts"), "export const feature = false;\n");
  git("add", "feature.ts");
  git("commit", "-qm", "deliver mismatched feature");
  const commitSha = git("rev-parse", "HEAD");
  writeFileSync(join(repo, "feature.ts"), "export const feature = true;\n");
  const statusBefore = git("status", "--porcelain");

  const rejected = execute(repo, (service) =>
    service.integrate({ spec, issue: "I-0001", commit: commitSha, author: "controller" }),
  );

  expect(rejected.status).not.toBe(0);
  expect(rejected.stderr).toMatch(
    /commit content does not match|accepted file content changed after acceptance/i,
  );
  expect(git("rev-parse", "HEAD")).toBe(commitSha);
  expect(git("status", "--porcelain")).toBe(statusBefore);
  expect(
    JSON.parse(readFileSync(join(repo, ".scratch", "0001-claim-flow", "sdd.json"), "utf8"))
      .issues[0].execution,
  ).toBe("accepted");
});

test("integrate refuses caller confirmation when accepted required-check evidence is no longer passing", () => {
  const { repo, git, spec } = prepareAcceptedIssue();
  const ledgerPath = join(repo, ".scratch", "0001-claim-flow", "sdd.json");
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  ledger.issues[0].checks.records[0].result = "failed";
  ledger.issues[0].checks.records[0].details = "The accepted check is no longer passing.";
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);

  git("add", "feature.ts");
  git("commit", "-qm", "deliver accepted feature");
  const commitSha = git("rev-parse", "HEAD");
  const rejected = execute(repo, (service) =>
    service.integrate({ spec, issue: "I-0001", commit: commitSha, author: "controller" }),
  );

  expect(rejected.status).not.toBe(0);
  expect(rejected.stderr).toMatch(/required check .* is failed/i);
  expect(git("rev-parse", "HEAD")).toBe(commitSha);
  expect(JSON.parse(readFileSync(ledgerPath, "utf8")).issues[0].execution).toBe("accepted");
});

test("integrate rejects an altered registered review report as stale evidence", () => {
  const { repo, git, spec, assignment } = prepareAcceptedIssue();
  writeFileSync(assignment.report, "# Review report\n\nChanged after acceptance.\n");
  git("add", "feature.ts");
  git("commit", "-qm", "deliver accepted feature");
  const commitSha = git("rev-parse", "HEAD");

  const rejected = execute(repo, (service) =>
    service.integrate({ spec, issue: "I-0001", commit: commitSha, author: "controller" }),
  );

  expect(rejected.status).not.toBe(0);
  expect(rejected.stderr).toMatch(/review report .*not current and submitted/i);
  expect(
    JSON.parse(readFileSync(join(repo, ".scratch", "0001-claim-flow", "sdd.json"), "utf8"))
      .issues[0].execution,
  ).toBe("accepted");
});

test("dependent claims wait for caller-committed delivery records and reuse integrated evidence", () => {
  const { repo, git, spec } = prepareAcceptedIssue();
  const prepared = execute(repo, (service) =>
    service.integrate({ spec, issue: "I-0001", author: "controller" }),
  );
  expect(prepared.status, prepared.stderr).toBe(0);

  git("add", "feature.ts");
  git("commit", "-qm", "deliver prerequisite");
  const commitSha = git("rev-parse", "HEAD");
  const integrated = execute(repo, (service) =>
    service.integrate({ spec, issue: "I-0001", commit: commitSha, author: "controller" }),
  );
  expect(integrated.status, integrated.stderr).toBe(0);

  const created = execute(repo, (service) =>
    service.issueCreate({
      spec,
      title: "Use the prerequisite",
      reporter: "requester",
      category: "enhancement",
      author: "maintainer",
    }),
  );
  expect(created.status, created.stderr).toBe(0);
  const dependency = execute(repo, (service) =>
    service.issueUpdate({ spec, issue: "I-0002", blockedBy: ["I-0001"], author: "maintainer" }),
  );
  expect(dependency.status, dependency.stderr).toBe(0);
  const triaged = execute(repo, (service) =>
    service.triage({
      spec,
      issue: "I-0002",
      status: "ready-for-agent",
      category: "enhancement",
      details: "Prerequisite integration is recorded.",
      author: "maintainer",
    }),
  );
  expect(triaged.status, triaged.stderr).toBe(0);

  const prematureClaim = execute(repo, (service) =>
    service.claim({ spec, issue: "I-0002", author: "controller" }),
  );
  expect(prematureClaim.status).not.toBe(0);
  expect(prematureClaim.stderr).toMatch(/uncommitted delivery records/i);
  expect(
    JSON.parse(readFileSync(join(repo, ".scratch", "0001-claim-flow", "sdd.json"), "utf8"))
      .issues[1].baseSha,
  ).toBe(undefined);

  git("add", "-A");
  git("commit", "-qm", "record completed prerequisite delivery");
  const ready = execute(repo, (service) => service.ready({ spec }));
  expect(ready.status, ready.stderr).toBe(0);
  expect(ready.stdout).not.toMatch(/dependencies are not integrated: I-0001/i);
  const claimed = execute(repo, (service) =>
    service.claim({ spec, issue: "I-0002", author: "controller" }),
  );
  expect(claimed.status, claimed.stderr).toBe(0);
  expect(JSON.parse(claimed.stdout).baseSha).toBe(git("rev-parse", "HEAD"));
});

test("accept rejects missing initial review coverage", () => {
  const accept = (repo: string, spec: string) =>
    execute(repo, (service) => service.accept({ spec, issue: "I-0001", author: "controller" }));

  const unreviewed = prepareImplementationForReview();
  const passingCheck = recordReviewCheck(
    unreviewed.repo,
    unreviewed.spec,
    unreviewed.command,
    unreviewed.submission.snapshot,
    "passed",
  );
  expect(passingCheck.status, passingCheck.stderr).toBe(0);
  const missing = accept(unreviewed.repo, unreviewed.spec);
  expect(missing.status).not.toBe(0);
  expect(missing.stderr).toMatch(/review coverage/i);
});

test("accept rejects pending or failed initial reviews", () => {
  const accept = (repo: string, spec: string) =>
    execute(repo, (service) => service.accept({ spec, issue: "I-0001", author: "controller" }));
  const reviewed = prepareReviewAssignment();
  const pending = accept(reviewed.repo, reviewed.spec);
  expect(pending.status).not.toBe(0);
  expect(pending.stderr).toMatch(/pending/i);

  writeFileSync(reviewed.assignment.report, "# Review report\n\nReview is incomplete.\n");
  const failed = execute(reviewed.repo, (service) =>
    service.submit({
      spec: reviewed.spec,
      issue: "I-0001",
      role: "review",
      assignment: reviewed.assignment.id,
      report: reviewed.assignment.report,
      result: "failed",
      noFindings: true,
      details: "The implementation does not meet the acceptance criteria.",
      author: "controller",
    }),
  );
  expect(failed.status, failed.stderr).toBe(0);
  const rejected = accept(reviewed.repo, reviewed.spec);
  expect(rejected.status).not.toBe(0);
  expect(rejected.stderr).toMatch(/Review assignment .* is failed/);
});

test("required checks cannot change after review assignment freezes the snapshot", () => {
  const reviewed = prepareReviewAssignment();
  const additionalCheck = execute(reviewed.repo, (service) =>
    service.checksRequire({
      spec: reviewed.spec,
      issue: "I-0001",
      command: "just lint::check",
      author: "controller",
    }),
  );
  expect(additionalCheck.status).not.toBe(0);
  expect(additionalCheck.stderr).toMatch(/frozen.*review/i);
});

test("interrupted review dispatch and submission resume the same persisted assignment", async () => {
  const { repo, spec, command, submission } = prepareImplementationForReview();
  const passingCheck = recordReviewCheck(repo, spec, command, submission.snapshot, "passed");
  expect(passingCheck.status, passingCheck.stderr).toBe(0);
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
  expect(interruptedDispatch.signal).toBe("SIGKILL");
  const resumedDispatch = execute(repo, (service) =>
    service.resume({ spec, issue: "I-0001", author: "controller" }),
  );
  expect(resumedDispatch.status, resumedDispatch.stderr).toBe(0);
  const resumed = JSON.parse(resumedDispatch.stdout) as {
    nextAction: string;
    reviewAssignments: { id: string; status: string; report: string }[];
  };
  expect(resumed.nextAction).toBe("await-review-report");
  expect(resumed.reviewAssignments.length).toBe(1);
  const assignment = resumed.reviewAssignments[0]!;
  expect(assignment.status).toBe("pending");
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
  expect(interruptedSubmission.signal).toBe("SIGKILL");
  const resumedSubmission = execute(repo, (service) =>
    service.resume({ spec, issue: "I-0001", author: "controller" }),
  );
  expect(resumedSubmission.status, resumedSubmission.stderr).toBe(0);
  const resumedResult = JSON.parse(resumedSubmission.stdout) as {
    nextAction: string;
    reviewAssignments: { id: string; status: string; result: string }[];
  };
  expect(resumedResult.nextAction).toBe("accept");
  expect(resumedResult.reviewAssignments[0]?.id).toBe(assignment.id);
  expect(resumedResult.reviewAssignments[0]?.status).toBe("submitted");
  expect(resumedResult.reviewAssignments[0]?.result).toBe("passed");

  const repeatedSubmission = execute(repo, (service) =>
    service.submit({
      spec,
      issue: "I-0001",
      role: "review",
      assignment: assignment.id,
      report: assignment.report,
      result: "passed",
      noFindings: true,
      author: "controller",
    }),
  );
  expect(repeatedSubmission.status, repeatedSubmission.stderr).toBe(0);
  expect(JSON.parse(repeatedSubmission.stdout).idempotent).toBe(true);
  const issueText = readFileSync(
    join(repo, ".scratch", "0001-claim-flow", "issues", "I-0001.md"),
    "utf8",
  );
  expect(issueText.match(/Review report submitted for assignment/g)?.length).toBe(1);
});

test("review submission and acceptance reject changed requirements, code, and report content", () => {
  const { repo, spec, command, assignment } = prepareReviewAssignment();
  writeFileSync(assignment.report, "# Review report\n\nNo defects found.\n");
  const originalSpec = readFileSync(spec, "utf8");
  writeFileSync(spec, `${originalSpec}\nA new acceptance requirement.\n`);
  const staleRequirements = execute(repo, (service) =>
    service.submit({
      spec,
      issue: "I-0001",
      role: "review",
      assignment: assignment.id,
      report: assignment.report,
      result: "passed",
      noFindings: true,
      author: "controller",
    }),
  );
  expect(staleRequirements.status).not.toBe(0);
  expect(staleRequirements.stderr).toMatch(/stale|frozen/i);

  writeFileSync(spec, originalSpec);
  const submitted = execute(repo, (service) =>
    service.submit({
      spec,
      issue: "I-0001",
      role: "review",
      assignment: assignment.id,
      report: assignment.report,
      result: "passed",
      noFindings: true,
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);

  writeFileSync(join(repo, "feature.ts"), "export const feature = false;\n");
  const refreshedCodeCheck = refreshReviewCheck(repo, spec, command);
  expect(refreshedCodeCheck.status, refreshedCodeCheck.stderr).toBe(0);
  const staleCodeAcceptance = execute(repo, (service) =>
    service.accept({ spec, issue: "I-0001", author: "controller" }),
  );
  expect(staleCodeAcceptance.status).not.toBe(0);
  expect(staleCodeAcceptance.stderr).toMatch(/Review assignment .* stale/);

  writeFileSync(join(repo, "feature.ts"), "export const feature = true;\n");
  const originalCodeCheck = refreshReviewCheck(repo, spec, command);
  expect(originalCodeCheck.status, originalCodeCheck.stderr).toBe(0);
  writeFileSync(assignment.report, "# Altered report\n");
  const alteredReportAcceptance = execute(repo, (service) =>
    service.accept({ spec, issue: "I-0001", author: "controller" }),
  );
  expect(alteredReportAcceptance.status).not.toBe(0);
  expect(alteredReportAcceptance.stderr).toMatch(/review report .* changed after submission/i);
});
