import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import {
  execute,
  commitAll,
  prepareClaimableTicket,
  prepareImplementationForReview,
} from "../helpers/helpers";
import type { WorkflowServices } from "../helpers/WorkflowServices";
test("checks require declares required commands and permits later additions", async () => {
  const { repo, spec } = await prepareClaimableTicket();
  const requireCheck = async (command: string) =>
    await execute(repo, (service) =>
      service.checksService.checksRequire({
        spec,
        ticket: "T-0001",
        command,
        author: "controller",
      }),
    );

  const initial = await requireCheck("just test::test tests/unit.test.ts");
  expect(initial.status, initial.stderr).toBe(0);

  const added = await requireCheck("just test::test tests/integration.test.ts");
  expect(added.status, added.stderr).toBe(0);
  const ledger = JSON.parse(
    readFileSync(join(repo, ".scratch", "0001-claim-flow", "sdd.json"), "utf8"),
  );
  expect(
    ledger.tickets[0].checks.required.map((check: { command: string }) => check.command),
  ).toEqual(["just test::test tests/unit.test.ts", "just test::test tests/integration.test.ts"]);
  expect(JSON.parse(initial.stdout).checks.required.length).toBe(1);
  expect(JSON.parse(added.stdout).checks.required.length).toBe(2);
});

test("claim and resume report content identities that change for untracked code", async () => {
  const { repo, spec } = await prepareClaimableTicket();
  const claim = await execute(repo, (service) =>
    service.assignmentService.claim({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(claim.status, claim.stderr).toBe(0);
  const baseline = JSON.parse(claim.stdout) as {
    snapshot: string;
    codeSnapshot: string;
    requirementsSnapshot: string;
  };
  expect(baseline.snapshot).toMatch(/^[0-9a-f]{64}$/);
  expect(baseline.codeSnapshot).toMatch(/^[0-9a-f]{64}$/);
  expect(baseline.requirementsSnapshot).toMatch(/^[0-9a-f]{64}$/);

  writeFileSync(join(repo, "new-source.ts"), "export const changed = true;\n");
  const resumed = await execute(repo, (service) =>
    service.assignmentService.resume({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(resumed.status, resumed.stderr).toBe(0);
  const current = JSON.parse(resumed.stdout) as typeof baseline;
  expect(current.codeSnapshot).not.toBe(baseline.codeSnapshot);
  expect(current.snapshot).not.toBe(baseline.snapshot);
  expect(current.requirementsSnapshot).toBe(baseline.requirementsSnapshot);
});

test("code identity distinguishes one untracked payload from two separately framed files", async () => {
  const { repo, spec } = await prepareClaimableTicket();
  const claim = await execute(repo, (service) =>
    service.assignmentService.claim({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(claim.status, claim.stderr).toBe(0);

  const secondFileRecord = Buffer.from(
    "path\0b\0index-absent\0worktree-mode:420\0worktree-file\0Y",
  );
  writeFileSync(join(repo, "a"), Buffer.concat([Buffer.from("X"), secondFileRecord]));
  const oneFile = await execute(repo, (service) =>
    service.assignmentService.resume({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(oneFile.status, oneFile.stderr).toBe(0);
  const oneFileIdentity = JSON.parse(oneFile.stdout).codeSnapshot as string;

  rmSync(join(repo, "a"));
  writeFileSync(join(repo, "a"), "X");
  writeFileSync(join(repo, "b"), "Y");
  const twoFiles = await execute(repo, (service) =>
    service.assignmentService.resume({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(twoFiles.status, twoFiles.stderr).toBe(0);
  const twoFileIdentity = JSON.parse(twoFiles.stdout).codeSnapshot as string;

  expect(oneFileIdentity).not.toBe(twoFileIdentity);
});

test("code identity rejects changed submodule revisions and dirty or untracked submodule content", async () => {
  const { repo, git, spec } = await prepareClaimableTicket();
  const command = "just test::test tests/example.test.ts";
  const required = await execute(repo, (service) =>
    service.checksService.checksRequire({ spec, ticket: "T-0001", command, author: "controller" }),
  );
  expect(required.status, required.stderr).toBe(0);
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

  const claim = await execute(repo, (service) =>
    service.assignmentService.claim({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(claim.status, claim.stderr).toBe(0);
  const snapshot = JSON.parse(claim.stdout).snapshot as string;
  const recordArgs = (service: WorkflowServices) =>
    service.checksService.checksRecord({
      spec,
      ticket: "T-0001",
      snapshot,
      command,
      result: "passed",
      author: "controller",
    });

  const submodule = join(repo, submodulePath);
  writeFileSync(join(submodule, "tracked.txt"), "dirty tracked content\n");
  const dirtyRecord = await execute(repo, recordArgs);
  expect(dirtyRecord.status).not.toBe(0);
  expect(dirtyRecord.stderr).toMatch(/submodule/i);
  const ledgerPath = join(repo, ".scratch", "0001-claim-flow", "sdd.json");
  expect(JSON.parse(readFileSync(ledgerPath, "utf8")).tickets[0].checks.records).toEqual([]);

  writeFileSync(join(submodule, "tracked.txt"), "submodule base\n");
  writeFileSync(join(submodule, "untracked.txt"), "untracked submodule content\n");
  const untrackedResume = await execute(repo, (service) =>
    service.assignmentService.resume({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(untrackedResume.status).not.toBe(0);
  expect(untrackedResume.stderr).toMatch(/submodule/i);

  rmSync(join(submodule, "untracked.txt"));
  writeFileSync(join(submodule, "tracked.txt"), "new submodule revision\n");
  execFileSync("git", ["add", "tracked.txt"], { cwd: submodule });
  execFileSync("git", ["commit", "-qm", "new submodule revision"], { cwd: submodule });
  const revisionResume = await execute(repo, (service) =>
    service.assignmentService.resume({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(revisionResume.status).not.toBe(0);
  expect(revisionResume.stderr).toMatch(/submodule/i);
});

test("nested untracked repositories cannot reuse identities or record check coverage", async () => {
  const { repo, git, spec } = await prepareClaimableTicket();
  const command = "just test::test tests/example.test.ts";
  const required = await execute(repo, (service) =>
    service.checksService.checksRequire({ spec, ticket: "T-0001", command, author: "controller" }),
  );
  expect(required.status, required.stderr).toBe(0);
  commitAll(repo, git, "declare required check");

  const claim = await execute(repo, (service) =>
    service.assignmentService.claim({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(claim.status, claim.stderr).toBe(0);
  const claimSnapshot = JSON.parse(claim.stdout).snapshot as string;

  const nested = join(repo, "vendor", "dependencies", "embedded");
  mkdirSync(nested, { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: nested });
  execFileSync("git", ["config", "user.name", "Fixture"], { cwd: nested });
  execFileSync("git", ["config", "user.email", "fixture@example.invalid"], { cwd: nested });
  writeFileSync(join(nested, "tracked.txt"), "nested repository base\n");
  execFileSync("git", ["add", "."], { cwd: nested });
  execFileSync("git", ["commit", "-qm", "nested repository base"], { cwd: nested });

  const resumeArgs = (service: WorkflowServices) =>
    service.assignmentService.resume({ spec, ticket: "T-0001", author: "controller" });
  const initialIdentity = await execute(repo, resumeArgs);
  const reusableSnapshot =
    initialIdentity.status === 0
      ? (JSON.parse(initialIdentity.stdout).snapshot as string)
      : claimSnapshot;
  if (initialIdentity.status !== 0) {
    expect(initialIdentity.stderr).toMatch(/nested|repository|worktree/i);
  }

  writeFileSync(join(nested, "tracked.txt"), "nested repository changed\n");
  const changedIdentity = await execute(repo, resumeArgs);
  expect(changedIdentity.status).not.toBe(0);
  expect(changedIdentity.stderr).toMatch(/nested|repository|worktree/i);

  const recorded = await execute(repo, (service) =>
    service.checksService.checksRecord({
      spec,
      ticket: "T-0001",
      snapshot: reusableSnapshot,
      command,
      result: "passed",
      author: "controller",
    }),
  );
  expect(recorded.status).not.toBe(0);
  expect(recorded.stderr).toMatch(/nested|repository|worktree/i);
  const ledgerPath = join(repo, ".scratch", "0001-claim-flow", "sdd.json");
  expect(JSON.parse(readFileSync(ledgerPath, "utf8")).tickets[0].checks.records).toEqual([]);
});

test("missing known Gitlinks reject identity actions and check recording", async () => {
  const { repo, git, spec } = await prepareClaimableTicket();
  const command = "just test::test tests/example.test.ts";
  const required = await execute(repo, (service) =>
    service.checksService.checksRequire({ spec, ticket: "T-0001", command, author: "controller" }),
  );
  expect(required.status, required.stderr).toBe(0);
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

  const claim = await execute(repo, (service) =>
    service.assignmentService.claim({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(claim.status, claim.stderr).toBe(0);
  const snapshot = JSON.parse(claim.stdout).snapshot as string;

  git("submodule", "deinit", "-f", "--", submodulePath);
  rmSync(join(repo, submodulePath), { recursive: true, force: true });

  const resume = await execute(repo, (service) =>
    service.assignmentService.resume({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(resume.status).not.toBe(0);
  expect(resume.stderr).toMatch(/missing or uninitialized/i);

  const recorded = await execute(repo, (service) =>
    service.checksService.checksRecord({
      spec,
      ticket: "T-0001",
      snapshot,
      command,
      result: "passed",
      author: "controller",
    }),
  );
  expect(recorded.status).not.toBe(0);
  expect(recorded.stderr).toMatch(/missing or uninitialized/i);
  const ledgerPath = join(repo, ".scratch", "0001-claim-flow", "sdd.json");
  expect(JSON.parse(readFileSync(ledgerPath, "utf8")).tickets[0].checks.records).toEqual([]);
});

test("content identity includes staged and unstaged working content relative to the claim baseline", async () => {
  const { repo, git, spec } = await prepareClaimableTicket();
  const claim = await execute(repo, (service) =>
    service.assignmentService.claim({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(claim.status, claim.stderr).toBe(0);
  const baseline = JSON.parse(claim.stdout).codeSnapshot as string;

  writeFileSync(join(repo, "tracked.txt"), "staged content\n");
  git("add", "tracked.txt");
  const stagedResult = await execute(repo, (service) =>
    service.assignmentService.resume({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(stagedResult.status, stagedResult.stderr).toBe(0);
  const staged = JSON.parse(stagedResult.stdout).codeSnapshot as string;
  expect(staged).not.toBe(baseline);

  writeFileSync(join(repo, "tracked.txt"), "unstaged content\n");
  const unstagedResult = await execute(repo, (service) =>
    service.assignmentService.resume({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(unstagedResult.status, unstagedResult.stderr).toBe(0);
  const stagedAndUnstaged = JSON.parse(unstagedResult.stdout).codeSnapshot as string;
  expect(stagedAndUnstaged).not.toBe(staged);

  git("commit", "-qm", "commit staged content");
  const committedResult = await execute(repo, (service) =>
    service.assignmentService.resume({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(committedResult.status, committedResult.stderr).toBe(0);
  expect(JSON.parse(committedResult.stdout).codeSnapshot).toBe(stagedAndUnstaged);
});

test("content identity includes staged content even when the working tree is restored", async () => {
  const { repo, git, spec } = await prepareClaimableTicket();
  const claim = await execute(repo, (service) =>
    service.assignmentService.claim({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(claim.status, claim.stderr).toBe(0);
  const baseline = JSON.parse(claim.stdout).codeSnapshot as string;
  writeFileSync(join(repo, "tracked.txt"), "staged-only content\n");
  git("add", "tracked.txt");
  writeFileSync(join(repo, "tracked.txt"), "base\n");

  const resumed = await execute(repo, (service) =>
    service.assignmentService.resume({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(resumed.status, resumed.stderr).toBe(0);
  expect(JSON.parse(resumed.stdout).codeSnapshot).not.toBe(baseline);
});

test("content identity includes Git-tracked executable mode changes", async () => {
  const { repo, git, spec } = await prepareClaimableTicket();
  const claim = await execute(repo, (service) =>
    service.assignmentService.claim({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(claim.status, claim.stderr).toBe(0);
  const baseline = JSON.parse(claim.stdout).codeSnapshot as string;
  chmodSync(join(repo, "tracked.txt"), 0o755);
  git("add", "tracked.txt");

  const stagedResult = await execute(repo, (service) =>
    service.assignmentService.resume({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(stagedResult.status, stagedResult.stderr).toBe(0);
  const staged = JSON.parse(stagedResult.stdout).codeSnapshot as string;
  expect(staged).not.toBe(baseline);

  chmodSync(join(repo, "tracked.txt"), 0o644);
  const unstagedResult = await execute(repo, (service) =>
    service.assignmentService.resume({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(unstagedResult.status, unstagedResult.stderr).toBe(0);
  expect(JSON.parse(unstagedResult.stdout).codeSnapshot).not.toBe(staged);
});

test("checks record stores one result against the supplied snapshot and is idempotent", async () => {
  const { repo, git, spec } = await prepareClaimableTicket();
  const command = "just test::test tests/example.test.ts";
  const required = await execute(repo, (service) =>
    service.checksService.checksRequire({ spec, ticket: "T-0001", command, author: "controller" }),
  );
  expect(required.status, required.stderr).toBe(0);
  commitAll(repo, git, "declare required check");
  const claim = await execute(repo, (service) =>
    service.assignmentService.claim({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(claim.status, claim.stderr).toBe(0);
  const snapshot = JSON.parse(claim.stdout).snapshot as string;
  const recordArgs = (service: WorkflowServices) =>
    service.checksService.checksRecord({
      spec,
      ticket: "T-0001",
      snapshot,
      command,
      result: "passed",
      author: "controller",
    });

  const recorded = await execute(repo, recordArgs);
  expect(recorded.status, recorded.stderr).toBe(0);
  expect(JSON.parse(recorded.stdout).record).toEqual({
    command,
    result: "passed",
    author: "controller",
    snapshot,
    codeSnapshot: JSON.parse(claim.stdout).codeSnapshot,
    requirementsSnapshot: JSON.parse(claim.stdout).requirementsSnapshot,
    headSha: JSON.parse(claim.stdout).headSha,
    recordedAt: JSON.parse(recorded.stdout).record.recordedAt,
  });
  const repeated = await execute(repo, recordArgs);
  expect(repeated.status, repeated.stderr).toBe(0);
  expect(JSON.parse(repeated.stdout).idempotent).toBe(true);
  const ledger = JSON.parse(
    readFileSync(join(repo, ".scratch", "0001-claim-flow", "sdd.json"), "utf8"),
  );
  expect(ledger.tickets[0].checks.records.length).toBe(1);
});

test("passing check evidence is reusable only for unchanged explicitly covered paths", async () => {
  const { repo, spec, command, submission } = await prepareImplementationForReview();
  const record = await execute(repo, (service) =>
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
  expect(record.status, record.stderr).toBe(0);
  writeFileSync(join(repo, "unrelated.ts"), "export const unrelated = true;\n");
  let status = await execute(repo, (service) => service.featureInspectionService.status({ spec }));
  expect(status.status, status.stderr).toBe(0);
  let state = JSON.parse(status.stdout) as {
    actions: { ticket: string; action: string }[];
    blockers: { ticket: string; reason: string }[];
  };
  expect(state.actions.some((action) => action.action === "review")).toBeTruthy();
  expect(!state.blockers.some((blocker) => blocker.reason.includes("Required check"))).toBeTruthy();

  writeFileSync(join(repo, "feature.ts"), "export const feature = 'changed';\n");
  status = await execute(repo, (service) => service.featureInspectionService.status({ spec }));
  expect(status.status, status.stderr).toBe(0);
  state = JSON.parse(status.stdout) as typeof state;
  expect(state.blockers.some((blocker) => blocker.reason.includes("Required check"))).toBeTruthy();
  expect(!state.actions.some((action) => action.action === "review")).toBeTruthy();
});

test("content identity excludes ordinary comments but tracks requirement changes and decisions", async () => {
  const { repo, git, spec } = await prepareClaimableTicket();
  const required = await execute(repo, (service) =>
    service.checksService.checksRequire({
      spec,
      ticket: "T-0001",
      command: "just test::test tests/example.test.ts",
      author: "controller",
    }),
  );
  expect(required.status, required.stderr).toBe(0);
  commitAll(repo, git, "declare check");
  const claim = await execute(repo, (service) =>
    service.assignmentService.claim({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(claim.status, claim.stderr).toBe(0);
  const initial = JSON.parse(claim.stdout) as {
    snapshot: string;
    codeSnapshot: string;
    requirementsSnapshot: string;
  };
  const command = "just test::test tests/example.test.ts";
  const recorded = await execute(repo, (service) =>
    service.checksService.checksRecord({
      spec,
      ticket: "T-0001",
      snapshot: initial.snapshot,
      command,
      result: "passed",
      author: "controller",
    }),
  );
  expect(recorded.status, recorded.stderr).toBe(0);
  const comment = await execute(repo, (service) =>
    service.ticketService.ticketComment({
      spec,
      ticket: "T-0001",
      details: "A routine progress note with no changed acceptance requirements.",
      author: "controller",
    }),
  );
  expect(comment.status, comment.stderr).toBe(0);
  const generatedReport = join(
    repo,
    ".scratch",
    "0001-claim-flow",
    "reports",
    "generated-report.md",
  );
  writeFileSync(generatedReport, "Generated report content.\n");
  const afterComment = JSON.parse(
    (
      await execute(repo, (service) =>
        service.assignmentService.resume({ spec, ticket: "T-0001", author: "controller" }),
      )
    ).stdout,
  ) as typeof initial;
  expect(afterComment.snapshot).toBe(initial.snapshot);
  expect(afterComment.codeSnapshot).toBe(initial.codeSnapshot);
  const afterCommentNext = await execute(repo, (service) => service.deliveryService.next({ spec }));
  expect(afterCommentNext.status, afterCommentNext.stderr).toBe(0);
  expect(
    JSON.stringify(JSON.parse(afterCommentNext.stdout).blockers).includes("Required check"),
  ).toBe(false);

  writeFileSync(
    spec,
    `${readFileSync(spec, "utf8")}\n## Requirements\n\nA changed feature requirement.\n`,
  );
  const afterSpecChangeResult = await execute(repo, (service) =>
    service.assignmentService.resume({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(afterSpecChangeResult.status, afterSpecChangeResult.stderr).toBe(0);
  const afterSpecChange = JSON.parse(afterSpecChangeResult.stdout) as typeof initial;
  expect(afterSpecChange.codeSnapshot).toBe(initial.codeSnapshot);
  expect(afterSpecChange.requirementsSnapshot).not.toBe(initial.requirementsSnapshot);
  const staleNext = await execute(repo, (service) => service.deliveryService.next({ spec }));
  expect(staleNext.status, staleNext.stderr).toBe(0);
  expect(JSON.stringify(JSON.parse(staleNext.stdout).blockers)).toMatch(
    /Required check .* is stale/,
  );

  const ticketPath = join(repo, ".scratch", "0001-claim-flow", "tickets", "T-0001.md");
  const ticketContent = readFileSync(ticketPath, "utf8");
  writeFileSync(
    ticketPath,
    ticketContent.replace(
      "## Requirements\n",
      "## Requirements\n\nAn ticket-specific requirement changed.\n",
    ),
  );
  const afterTicketRequirementResult = await execute(repo, (service) =>
    service.assignmentService.resume({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(afterTicketRequirementResult.status, afterTicketRequirementResult.stderr).toBe(0);
  const afterTicketRequirement = JSON.parse(afterTicketRequirementResult.stdout) as typeof initial;
  expect(afterTicketRequirement.codeSnapshot).toBe(initial.codeSnapshot);
  expect(afterTicketRequirement.requirementsSnapshot).not.toBe(
    afterSpecChange.requirementsSnapshot,
  );

  const decision = await execute(repo, (service) =>
    service.ticketService.ticketComment({
      spec,
      ticket: "T-0001",
      details: "Requirements decision: retain the new acceptance requirement.",
      author: "controller",
    }),
  );
  expect(decision.status, decision.stderr).toBe(0);
  const afterDecisionResult = await execute(repo, (service) =>
    service.assignmentService.resume({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(afterDecisionResult.status, afterDecisionResult.stderr).toBe(0);
  expect(JSON.parse(afterDecisionResult.stdout).requirementsSnapshot).not.toBe(
    afterTicketRequirement.requirementsSnapshot,
  );
});

test("metadata-only commits preserve content coverage while changing Git provenance", async () => {
  const { repo, git, spec } = await prepareClaimableTicket();
  const command = "just test::test tests/example.test.ts";
  const required = await execute(repo, (service) =>
    service.checksService.checksRequire({ spec, ticket: "T-0001", command, author: "controller" }),
  );
  expect(required.status, required.stderr).toBe(0);
  commitAll(repo, git, "declare check");
  const claim = await execute(repo, (service) =>
    service.assignmentService.claim({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(claim.status, claim.stderr).toBe(0);
  const initial = JSON.parse(claim.stdout) as {
    snapshot: string;
    headSha: string;
  };
  const recorded = await execute(repo, (service) =>
    service.checksService.checksRecord({
      spec,
      ticket: "T-0001",
      snapshot: initial.snapshot,
      command,
      result: "passed",
      author: "controller",
    }),
  );
  expect(recorded.status, recorded.stderr).toBe(0);
  git("commit", "--allow-empty", "-m", "metadata-only revision");

  const resumed = await execute(repo, (service) =>
    service.assignmentService.resume({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(resumed.status, resumed.stderr).toBe(0);
  const current = JSON.parse(resumed.stdout) as typeof initial;
  expect(current.snapshot).toBe(initial.snapshot);
  expect(current.headSha).not.toBe(initial.headSha);
  const status = await execute(repo, (service) =>
    service.featureInspectionService.status({ spec }),
  );
  expect(status.status, status.stderr).toBe(0);
  expect(
    JSON.parse(status.stdout).blockers.some((item: { reason: string }) =>
      item.reason.includes(`Required check ${command}`),
    ),
  ).toBe(false);
});

test("checks record rejects malformed or stale snapshots and requires failure details without executing commands", async () => {
  const { repo, git, spec } = await prepareClaimableTicket();
  const sentinel = join(repo, "command-was-not-executed");
  const command = `touch ${sentinel}`;
  const required = await execute(repo, (service) =>
    service.checksService.checksRequire({ spec, ticket: "T-0001", command, author: "controller" }),
  );
  expect(required.status, required.stderr).toBe(0);
  commitAll(repo, git, "declare check");
  const claim = await execute(repo, (service) =>
    service.assignmentService.claim({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(claim.status, claim.stderr).toBe(0);
  const snapshot = JSON.parse(claim.stdout).snapshot as string;
  const ledgerPath = join(repo, ".scratch", "0001-claim-flow", "sdd.json");
  const before = readFileSync(ledgerPath, "utf8");
  const baseArgs = { spec, ticket: "T-0001", command, author: "controller" };

  const malformed = await execute(repo, (service) =>
    service.checksService.checksRecord({
      ...baseArgs,
      snapshot: "not-a-snapshot",
      result: "passed",
    }),
  );
  expect(malformed.status).not.toBe(0);
  expect(malformed.stderr).toMatch(/64-character hexadecimal/);
  const invalidResult = await execute(repo, (service) =>
    service.checksService.checksRecord({ ...baseArgs, snapshot, result: "skipped" }),
  );
  expect(invalidResult.status).not.toBe(0);
  expect(invalidResult.stderr).toMatch(/Invalid check result/);
  const failedWithoutDetails = await execute(repo, (service) =>
    service.checksService.checksRecord({ ...baseArgs, snapshot, result: "failed" }),
  );
  expect(failedWithoutDetails.status).not.toBe(0);
  expect(failedWithoutDetails.stderr).toMatch(/--details is required/);
  const unavailableWithoutDetails = await execute(repo, (service) =>
    service.checksService.checksRecord({ ...baseArgs, snapshot, result: "unavailable" }),
  );
  expect(unavailableWithoutDetails.status).not.toBe(0);
  expect(unavailableWithoutDetails.stderr).toMatch(/--details is required/);
  expect(readFileSync(ledgerPath, "utf8")).toBe(before);

  writeFileSync(join(repo, "new-source.ts"), "export const changed = true;\n");
  const stale = await execute(repo, (service) =>
    service.checksService.checksRecord({ ...baseArgs, snapshot, result: "passed" }),
  );
  expect(stale.status).not.toBe(0);
  expect(stale.stderr).toMatch(/Snapshot is stale/);
  expect(readFileSync(ledgerPath, "utf8")).toBe(before);

  const currentSnapshot = JSON.parse(
    (
      await execute(repo, (service) =>
        service.assignmentService.resume({ spec, ticket: "T-0001", author: "controller" }),
      )
    ).stdout,
  ).snapshot as string;
  const failed = await execute(repo, (service) =>
    service.checksService.checksRecord({
      ...baseArgs,
      snapshot: currentSnapshot,
      result: "failed",
      details: "The external check found a defect.",
    }),
  );
  expect(failed.status, failed.stderr).toBe(0);
  const unavailable = await execute(repo, (service) =>
    service.checksService.checksRecord({
      ...baseArgs,
      snapshot: currentSnapshot,
      result: "unavailable",
      details: "The configured external runner was unavailable.",
    }),
  );
  expect(unavailable.status, unavailable.stderr).toBe(0);
  const next = await execute(repo, (service) => service.deliveryService.next({ spec }));
  expect(next.status, next.stderr).toBe(0);
  expect(JSON.stringify(JSON.parse(next.stdout).blockers)).toMatch(
    /Required check .* is unavailable/,
  );
  expect(existsSync(sentinel)).toBe(false);
});

test("check removal requires rationale and invalidates accepted decisions while preserving history", async () => {
  const { repo, git, spec } = await prepareClaimableTicket();
  const firstCommand = "just test::test tests/first.test.ts";
  const requireFirst = await execute(repo, (service) =>
    service.checksService.checksRequire({
      spec,
      ticket: "T-0001",
      command: firstCommand,
      author: "controller",
    }),
  );
  expect(requireFirst.status, requireFirst.stderr).toBe(0);
  commitAll(repo, git, "declare first check");
  const claim = await execute(repo, (service) =>
    service.assignmentService.claim({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(claim.status, claim.stderr).toBe(0);
  const claimOutput = JSON.parse(claim.stdout);
  const record = await execute(repo, (service) =>
    service.checksService.checksRecord({
      spec,
      ticket: "T-0001",
      snapshot: claimOutput.snapshot,
      command: firstCommand,
      result: "passed",
      author: "controller",
    }),
  );
  expect(record.status, record.stderr).toBe(0);

  const ledgerPath = join(repo, ".scratch", "0001-claim-flow", "sdd.json");
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  ledger.tickets[0].execution = "accepted";
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  const beforeRemoval = readFileSync(ledgerPath, "utf8");
  const missingRationale = await execute(repo, (service) =>
    service.checksService.checksRequire({
      spec,
      ticket: "T-0001",
      command: firstCommand,
      remove: true,
      author: "controller",
    }),
  );
  expect(missingRationale.status).not.toBe(0);
  expect(missingRationale.stderr).toMatch(/requires non-empty --details rationale/);
  expect(readFileSync(ledgerPath, "utf8")).toBe(beforeRemoval);

  const removed = await execute(repo, (service) =>
    service.checksService.checksRequire({
      spec,
      ticket: "T-0001",
      command: firstCommand,
      remove: true,
      details: "The target is no longer supported.",
      author: "controller",
    }),
  );
  expect(removed.status, removed.stderr).toBe(0);
  const afterRemoval = JSON.parse(removed.stdout);
  expect(afterRemoval.checks.required[0].removalDetails).toBe("The target is no longer supported.");
  expect(afterRemoval.invalidatedDecision.from).toBe("accepted");
  expect(afterRemoval.invalidatedDecision.to).toBe("reviewing");
  expect(afterRemoval.requirementsSnapshot).not.toBe(claimOutput.requirementsSnapshot);
  const persisted = JSON.parse(readFileSync(ledgerPath, "utf8"));
  expect(persisted.tickets[0].execution).toBe("reviewing");
  expect(persisted.tickets[0].checks.records.length).toBe(1);
  expect(persisted.tickets[0].checks.invalidations.length).toBe(1);

  const secondCommand = "just test::test tests/second.test.ts";
  const added = await execute(repo, (service) =>
    service.checksService.checksRequire({
      spec,
      ticket: "T-0001",
      command: secondCommand,
      author: "controller",
    }),
  );
  expect(added.status, added.stderr).toBe(0);
  expect(JSON.parse(added.stdout).requirementsSnapshot).not.toBe(afterRemoval.requirementsSnapshot);
  const status = await execute(repo, (service) =>
    service.featureInspectionService.status({ spec }),
  );
  expect(status.status, status.stderr).toBe(0);
  expect(JSON.stringify(JSON.parse(status.stdout).blockers)).toMatch(
    /Required check .*second\.test\.ts.*missing/,
  );
});

test("status does not permit integration when a required check failed", async () => {
  const { repo, git, spec } = await prepareClaimableTicket();
  const command = "just test::test tests/required.test.ts";
  const required = await execute(repo, (service) =>
    service.checksService.checksRequire({ spec, ticket: "T-0001", command, author: "controller" }),
  );
  expect(required.status, required.stderr).toBe(0);
  commitAll(repo, git, "declare check");
  const claim = await execute(repo, (service) =>
    service.assignmentService.claim({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(claim.status, claim.stderr).toBe(0);
  const failed = await execute(repo, (service) =>
    service.checksService.checksRecord({
      spec,
      ticket: "T-0001",
      snapshot: JSON.parse(claim.stdout).snapshot,
      command,
      result: "failed",
      details: "The required check failed.",
      author: "controller",
    }),
  );
  expect(failed.status, failed.stderr).toBe(0);

  const ledgerPath = join(repo, ".scratch", "0001-claim-flow", "sdd.json");
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  ledger.tickets[0].execution = "accepted";
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  const status = await execute(repo, (service) =>
    service.featureInspectionService.status({ spec }),
  );
  expect(status.status, status.stderr).toBe(0);
  expect(JSON.parse(status.stdout).actions).toEqual([]);
  expect(JSON.stringify(JSON.parse(status.stdout).blockers)).toMatch(/Required check .* is failed/);
  const resumed = await execute(repo, (service) =>
    service.assignmentService.resume({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(resumed.status, resumed.stderr).toBe(0);
  expect(JSON.parse(resumed.stdout).nextAction).toBe("resolve-check-blocker");
});

test("stale checks on an integrated ticket keep dependent tickets blocked", async () => {
  const { repo, git, spec } = await prepareClaimableTicket();
  const command = "just test::test tests/required.test.ts";
  const required = await execute(repo, (service) =>
    service.checksService.checksRequire({ spec, ticket: "T-0001", command, author: "controller" }),
  );
  expect(required.status, required.stderr).toBe(0);
  commitAll(repo, git, "declare check");
  const claim = await execute(repo, (service) =>
    service.assignmentService.claim({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(claim.status, claim.stderr).toBe(0);
  const failed = await execute(repo, (service) =>
    service.checksService.checksRecord({
      spec,
      ticket: "T-0001",
      snapshot: JSON.parse(claim.stdout).snapshot,
      command,
      result: "failed",
      details: "The required check failed.",
      author: "controller",
    }),
  );
  expect(failed.status, failed.stderr).toBe(0);

  const ledgerPath = join(repo, ".scratch", "0001-claim-flow", "sdd.json");
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  ledger.tickets[0].execution = "integrated";
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  const dependent = await execute(repo, (service) =>
    service.ticketService.ticketCreate({
      spec,
      title: "Wait for valid evidence",
      reporter: "requester",
      category: "enhancement",
      author: "maintainer",
    }),
  );
  expect(dependent.status, dependent.stderr).toBe(0);
  const dependency = await execute(repo, (service) =>
    service.ticketService.ticketUpdate({
      spec,
      ticket: "T-0002",
      blockedBy: ["T-0001"],
      author: "maintainer",
    }),
  );
  expect(dependency.status, dependency.stderr).toBe(0);
  const updated = await execute(repo, (service) =>
    service.ticketService.ticketUpdate({
      spec,
      ticket: "T-0002",
      status: "open",
      author: "maintainer",
    }),
  );
  expect(updated.status, updated.stderr).toBe(0);

  const ready = await execute(repo, (service) => service.readinessService.ready({ spec }));
  expect(ready.status, ready.stderr).toBe(0);
  expect(JSON.parse(ready.stdout).unready).toEqual([{ ticket: "T-0002", blockedBy: ["T-0001"] }]);
  const attemptedClaim = await execute(repo, (service) =>
    service.assignmentService.claim({ spec, ticket: "T-0002", author: "controller" }),
  );
  expect(attemptedClaim.status).not.toBe(0);
  expect(attemptedClaim.stderr).toMatch(/open dependencies: T-0001/);
});

test("claim rejects staged, unstaged, and untracked changes without changing ownership or baseline", async () => {
  const { repo, git, spec } = await prepareClaimableTicket();
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
    const result = await execute(repo, (service) =>
      service.assignmentService.claim({ spec, ticket: "T-0001", author: "controller" }),
    );

    expect(result.status, `dirty state ${index} unexpectedly claimed`).not.toBe(0);
    expect(result.stderr).toMatch(/dirty checkout/);
    expect(readFileSync(ledgerPath, "utf8")).toBe(beforeLedger);
    expect(git("status", "--porcelain=v1", "--untracked-files=all")).toBe(beforeStatus);
    if (index === 0) writeFileSync(join(repo, "tracked.txt"), "base\n");
    if (index === 1) {
      git("reset", "--", "tracked.txt");
      writeFileSync(join(repo, "tracked.txt"), "base\n");
    }
    if (index === 2) rmSync(join(repo, "preparation.md"));
  }
});

test("an unavailable implementation assignment can later submit once without duplicating history", async () => {
  const { repo, spec } = await prepareClaimableTicket();
  const claimed = await execute(repo, (service) =>
    service.assignmentService.claim({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(claimed.status, claimed.stderr).toBe(0);
  const dispatched = await execute(repo, (service) =>
    service.assignmentService.implement({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(dispatched.status, dispatched.stderr).toBe(0);
  const assignment = JSON.parse(dispatched.stdout).assignment as {
    id: string;
    role: string;
    action: string;
    report: string;
  };
  expect(assignment.role).toBe("implementation");
  expect(assignment.action).toBe("implement");
  expect(assignment.report.endsWith("/reports/T-0001-implementation.md")).toBe(true);
  const repeatedDispatch = await execute(repo, (service) =>
    service.assignmentService.implement({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(repeatedDispatch.status, repeatedDispatch.stderr).toBe(0);
  expect(JSON.parse(repeatedDispatch.stdout).assignment.id).toBe(assignment.id);
  const unavailable = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: "T-0001",
      role: "implementation",
      unavailable: true,
      details: "Worker did not return a report yet.",
      author: "controller",
    }),
  );
  expect(unavailable.status, unavailable.stderr).toBe(0);
  expect(JSON.parse(unavailable.stdout).unavailable).toBe(true);

  writeFileSync(assignment.report, "Implementation evidence.\n");
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
  const submission = JSON.parse(submitted.stdout);
  expect(submission.execution).toBe("reviewing");
  expect(submission.assignment.id).toBe(assignment.id);
  expect(submission.assignment.status).toBe("submitted");
  expect(submission.report).toBe(assignment.report);
  const submittedAt = submission.assignment.submittedAt;
  const repeated = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: "T-0001",
      role: "implementation",
      author: "controller",
    }),
  );
  expect(repeated.status, repeated.stderr).toBe(0);
  expect(JSON.parse(repeated.stdout).idempotent).toBe(true);
  expect(JSON.parse(repeated.stdout).assignment.submittedAt).toBe(submittedAt);
  const ticketBody = readFileSync(
    join(repo, ".scratch", "0001-claim-flow", "tickets", "T-0001.md"),
    "utf8",
  );
  expect(ticketBody.match(/Implementation report submitted/g)?.length).toBe(1);
});
