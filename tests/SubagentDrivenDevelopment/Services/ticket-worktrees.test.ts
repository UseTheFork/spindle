import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { expect, test } from "vitest";

import { repoRoot } from "../../helpers/TemporaryDirectories.ts";
import { execute, fixture, invokeAsync, recordReviewCheck } from "../helpers/helpers";

function gitAt(directory: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd: directory,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

async function setup() {
  const { repo } = fixture();
  const feature = await execute(repo, (services) =>
    services.featureCreationService.create({ title: "Ticket isolation", author: "controller" }),
  );
  expect(feature.status, feature.stderr).toBe(0);
  const originalSpec = JSON.parse(feature.stdout).spec as string;
  const parent = join(dirname(repo), "external");
  mkdirSync(parent);
  const started = await invokeAsync(repo, [
    "start",
    "--spec",
    originalSpec,
    "--workspace",
    parent,
    "--confirm-records",
  ]);
  expect(started.status, started.stderr).toBe(0);
  const output = JSON.parse(started.stdout) as { featureWorkspace: string; spec: string };
  const root = output.featureWorkspace;
  const spec = output.spec;
  for (const title of ["First", "Second"]) {
    const created = await execute(root, (services) =>
      services.ticketService.ticketCreate({
        spec,
        title,
        reporter: "requester",
        category: "enhancement",
        author: "controller",
      }),
    );
    expect(created.status, created.stderr).toBe(0);
  }
  for (const ticket of ["T-0001", "T-0002"]) {
    const check = await execute(root, (services) =>
      services.checksService.checksRequire({
        spec,
        ticket,
        command: "test ticket",
        author: "controller",
      }),
    );
    expect(check.status, check.stderr).toBe(0);
  }
  gitAt(root, "add", ".scratch");
  gitAt(root, "commit", "-qm", "prepare tickets");
  return { root, spec, parent };
}

async function dispatch(root: string, spec: string, parent: string, ticket: string) {
  const claimed = await execute(root, (services) =>
    services.assignmentService.claim({ spec, ticket, author: "controller" }),
  );
  expect(claimed.status, claimed.stderr).toBe(0);
  gitAt(root, "add", ".scratch");
  gitAt(root, "commit", "-qm", `claim ${ticket}`);
  const result = await execute(root, (services) =>
    services.assignmentService.implement({ spec, ticket, author: "controller", workspace: parent }),
  );
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout) as {
    assignment: { id: string; workspace: string; branch: string; report: string };
    headSha: string;
    snapshot: string;
  };
}

async function acceptedTicket(file = "first.ts", content = "ticket\n", baseline?: string) {
  const { root, spec, parent } = await setup();
  if (baseline !== undefined) {
    writeFileSync(join(root, file), baseline);
    gitAt(root, "add", file);
    gitAt(root, "commit", "-qm", "prepare shared baseline");
  }
  const first = await dispatch(root, spec, parent, "T-0001");
  const workspace = first.assignment.workspace;
  writeFileSync(join(workspace, file), content);
  gitAt(workspace, "add", file);
  gitAt(workspace, "commit", "-qm", "implement ticket");
  writeFileSync(first.assignment.report, "# Implementation report\n\nImplemented.\n");
  const submitted = await execute(root, (services) =>
    services.submissionService.submit({
      spec,
      ticket: "T-0001",
      role: "implementation",
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);
  const check = await recordReviewCheck(
    root,
    spec,
    "test ticket",
    JSON.parse(submitted.stdout).snapshot,
    "passed",
  );
  expect(check.status, check.stderr).toBe(0);
  const reviewed = await execute(root, (services) =>
    services.reviewService.review({
      spec,
      ticket: "T-0001",
      inventory: JSON.stringify([file]),
      author: "controller",
    }),
  );
  expect(reviewed.status, reviewed.stderr).toBe(0);
  const review = JSON.parse(reviewed.stdout).assignments[0] as { id: string; report: string };
  writeFileSync(review.report, "# Review\n\nNo findings.\n");
  const approved = await execute(root, (services) =>
    services.submissionService.submit({
      spec,
      ticket: "T-0001",
      role: "review",
      assignment: review.id,
      report: review.report,
      result: "passed",
      noFindings: true,
      author: "controller",
    }),
  );
  expect(approved.status, approved.stderr).toBe(0);
  const accepted = await invokeAsync(root, [
    "accept",
    "--spec",
    spec,
    "--ticket",
    "T-0001",
    "--author",
    "controller",
  ]);
  expect(accepted.status, accepted.stderr).toBe(0);
  gitAt(root, "add", ".scratch");
  gitAt(root, "commit", "-qm", "record acceptance");
  return { root, spec, parent, workspace };
}

function integrate(root: string, spec: string) {
  return invokeAsync(root, [
    "integrate",
    "--spec",
    spec,
    "--ticket",
    "T-0001",
    "--author",
    "controller",
  ]);
}

test("independent tickets get distinct persisted branches and isolated evidence", async () => {
  const { root, spec, parent } = await setup();
  const first = await dispatch(root, spec, parent, "T-0001");
  gitAt(root, "add", ".scratch");
  gitAt(root, "commit", "-qm", "record first assignment");
  const second = await dispatch(root, spec, parent, "T-0002");
  expect(first.assignment.workspace).not.toBe(second.assignment.workspace);
  expect(first.assignment.branch).toBe("tickets/0001-ticket-isolation/T-0001");
  expect(second.assignment.branch).toBe("tickets/0001-ticket-isolation/T-0002");
  expect(first.assignment.report).toBe(join(dirname(spec), "reports/T-0001-implementation.md"));
  const ledger = JSON.parse(readFileSync(join(dirname(spec), "sdd.json"), "utf8"));
  expect(ledger.tickets[0].worktree.workspace).toBe(first.assignment.workspace);
  expect(ledger.tickets[1].worktree.workspace).toBe(second.assignment.workspace);
  writeFileSync(join(first.assignment.workspace, "first.ts"), "export const first = 1;\n");
  writeFileSync(join(second.assignment.workspace, "second.ts"), "export const second = 2;\n");
  const status = await execute(root, (services) =>
    services.featureInspectionService.status({ spec }),
  );
  expect(status.status, status.stderr).toBe(0);
  const snapshots = JSON.parse(status.stdout).snapshots as {
    ticket: string;
    codeSnapshot: string;
  }[];
  const firstSnapshot = snapshots.find((item) => item.ticket === "T-0001")!.codeSnapshot;
  writeFileSync(join(second.assignment.workspace, "second.ts"), "export const second = 3;\n");
  const updated = await execute(root, (services) =>
    services.featureInspectionService.status({ spec }),
  );
  expect(updated.status, updated.stderr).toBe(0);
  const later = JSON.parse(updated.stdout).snapshots as { ticket: string; codeSnapshot: string }[];
  expect(later.find((item) => item.ticket === "T-0001")!.codeSnapshot).toBe(firstSnapshot);
  expect(later.find((item) => item.ticket === "T-0002")!.codeSnapshot).not.toBe(
    snapshots.find((item) => item.ticket === "T-0002")!.codeSnapshot,
  );
  expect(existsSync(join(root, "first.ts"))).toBe(false);
  expect(existsSync(join(first.assignment.workspace, "second.ts"))).toBe(false);
});

test("ticket worktree parent may be inside another Git checkout", async () => {
  const { root, spec, parent } = await setup();
  execFileSync("git", ["init", "-q", parent]);
  const first = await dispatch(root, spec, parent, "T-0001");
  expect(first.assignment.workspace).toBe(join(parent, "0001-ticket-isolation-T-0001"));
  expect(gitAt(first.assignment.workspace, "branch", "--show-current")).toBe(
    "tickets/0001-ticket-isolation/T-0001",
  );
});

test("review uses the committed ticket worktree and becomes stale when its HEAD changes", async () => {
  const { root, spec, parent } = await setup();
  const first = await dispatch(root, spec, parent, "T-0001");
  const workspace = first.assignment.workspace;
  writeFileSync(join(workspace, "first.ts"), "export const first = 1;\n");
  writeFileSync(first.assignment.report, "# Implementation report\n\nImplemented.\n");
  const submitted = await execute(root, (services) =>
    services.submissionService.submit({
      spec,
      ticket: "T-0001",
      role: "implementation",
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);
  const initialSnapshot = JSON.parse(submitted.stdout).snapshot as string;
  const check = await recordReviewCheck(root, spec, "test ticket", initialSnapshot, "passed");
  expect(check.status, check.stderr).toBe(0);
  const review = () =>
    execute(root, (services) =>
      services.reviewService.review({
        spec,
        ticket: "T-0001",
        inventory: JSON.stringify(["first.ts"]),
        author: "controller",
      }),
    );
  const dirtyReview = await review();
  expect(dirtyReview.status).not.toBe(0);
  expect(dirtyReview.stderr).toMatch(/commit ticket code/i);
  gitAt(workspace, "add", "first.ts");
  gitAt(workspace, "commit", "-qm", "implement first");
  const status = await execute(root, (services) =>
    services.featureInspectionService.status({ spec }),
  );
  expect(status.status, status.stderr).toBe(0);
  const current = JSON.parse(status.stdout).snapshots.find(
    (item: { ticket: string }) => item.ticket === "T-0001",
  );
  const committedCheck = await recordReviewCheck(
    root,
    spec,
    "test ticket",
    current.snapshot,
    "passed",
  );
  expect(committedCheck.status, committedCheck.stderr).toBe(0);
  const dispatched = await review();
  expect(dispatched.status, dispatched.stderr).toBe(0);
  const assignment = JSON.parse(dispatched.stdout).assignments[0] as {
    id: string;
    headSha: string;
    workspace: string;
    report: string;
  };
  expect(assignment.workspace).toBe(workspace);
  expect(assignment.headSha).toBe(gitAt(workspace, "rev-parse", "HEAD"));
  expect(assignment.report).toContain(join(dirname(spec), "reports"));
  writeFileSync(assignment.report, "# Review\n\nNo findings.\n");
  gitAt(workspace, "commit", "--allow-empty", "-qm", "advance ticket HEAD");
  const reviewSubmission = await execute(root, (services) =>
    services.submissionService.submit({
      spec,
      ticket: "T-0001",
      role: "review",
      assignment: assignment.id,
      report: assignment.report,
      result: "passed",
      noFindings: true,
      author: "controller",
    }),
  );
  expect(reviewSubmission.status).not.toBe(0);
  expect(reviewSubmission.stderr).toMatch(/stale/i);
});

test("review survives feature advancement and merges the exact reviewed ticket commit", async () => {
  const { root, spec, parent } = await setup();
  const first = await dispatch(root, spec, parent, "T-0001");
  const workspace = first.assignment.workspace;
  writeFileSync(join(workspace, "first.ts"), "export const first = 1;\n");
  gitAt(workspace, "add", "first.ts");
  gitAt(workspace, "commit", "-qm", "implement first");
  writeFileSync(first.assignment.report, "# Implementation report\n\nImplemented.\n");
  const submitted = await execute(root, (services) =>
    services.submissionService.submit({
      spec,
      ticket: "T-0001",
      role: "implementation",
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);
  const check = await recordReviewCheck(
    root,
    spec,
    "test ticket",
    JSON.parse(submitted.stdout).snapshot,
    "passed",
  );
  expect(check.status, check.stderr).toBe(0);
  const reviewed = await execute(root, (services) =>
    services.reviewService.review({
      spec,
      ticket: "T-0001",
      inventory: JSON.stringify(["first.ts"]),
      author: "controller",
    }),
  );
  expect(reviewed.status, reviewed.stderr).toBe(0);
  const review = JSON.parse(reviewed.stdout).assignments[0] as { id: string; report: string };
  writeFileSync(review.report, "# Review\n\nNo findings.\n");
  writeFileSync(join(root, "other-ticket.ts"), "export const otherTicket = 1;\n");
  gitAt(root, "add", ".scratch", "other-ticket.ts");
  gitAt(root, "commit", "-qm", "advance feature branch");
  const approval = await execute(root, (services) =>
    services.submissionService.submit({
      spec,
      ticket: "T-0001",
      role: "review",
      assignment: review.id,
      report: review.report,
      result: "passed",
      noFindings: true,
      author: "controller",
    }),
  );
  expect(approval.status, approval.stderr).toBe(0);
  const accepted = await execute(root, (services) =>
    services.integrationService.accept({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(accepted.status, accepted.stderr).toBe(0);
  gitAt(root, "add", ".scratch");
  gitAt(root, "commit", "-qm", "record acceptance");
  const before = gitAt(root, "rev-parse", "HEAD");
  const integrated = await invokeAsync(root, [
    "integrate",
    "--spec",
    spec,
    "--ticket",
    "T-0001",
    "--author",
    "controller",
  ]);
  expect(integrated.status, integrated.stderr).toBe(0);
  const output = JSON.parse(integrated.stdout) as {
    mergeCommit: string;
    ticketCommit: string;
    postMerge: string;
  };
  expect(output.ticketCommit).toBe(gitAt(workspace, "rev-parse", "HEAD"));
  expect(output.postMerge).toBe("pending");
  expect(gitAt(root, "rev-list", "--parents", "-n", "1", output.mergeCommit).split(" ")).toEqual([
    output.mergeCommit,
    before,
    output.ticketCommit,
  ]);
  expect(readFileSync(join(root, "first.ts"), "utf8")).toBe("export const first = 1;\n");
  expect(existsSync(workspace)).toBe(true);
  const repeated = await invokeAsync(root, [
    "integrate",
    "--spec",
    spec,
    "--ticket",
    "T-0001",
    "--author",
    "controller",
  ]);
  expect(repeated.status, repeated.stderr).toBe(0);
  expect(JSON.parse(repeated.stdout).idempotent).toBe(true);
  const closed = await execute(root, (services) =>
    services.ticketService.ticketUpdate({
      spec,
      ticket: "T-0001",
      status: "closed",
      author: "controller",
    }),
  );
  expect(closed.status, closed.stderr).toBe(0);
  const dependency = await execute(root, (services) =>
    services.ticketService.ticketUpdate({
      spec,
      ticket: "T-0002",
      blockedBy: ["T-0001"],
      author: "controller",
    }),
  );
  expect(dependency.status, dependency.stderr).toBe(0);
  const claim = await execute(root, (services) =>
    services.assignmentService.claim({ spec, ticket: "T-0002", author: "controller" }),
  );
  expect(claim.status).not.toBe(0);
  expect(claim.stderr).toMatch(/post-merge prerequisite validation/i);
});

test("integration refuses a stale reviewed commit and preserves both branches", async () => {
  const { root, spec, workspace } = await acceptedTicket();
  const featureHead = gitAt(root, "rev-parse", "HEAD");
  gitAt(workspace, "commit", "--allow-empty", "-qm", "advance after approval");
  const result = await integrate(root, spec);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/stale/i);
  expect(gitAt(root, "rev-parse", "HEAD")).toBe(featureHead);
  expect(existsSync(workspace)).toBe(true);
});

test("unapproved work cannot be accepted or merged", async () => {
  const { root, spec, parent } = await setup();
  const { assignment } = await dispatch(root, spec, parent, "T-0001");
  writeFileSync(join(assignment.workspace, "first.ts"), "unreviewed\n");
  gitAt(assignment.workspace, "add", "first.ts");
  gitAt(assignment.workspace, "commit", "-qm", "unreviewed");
  const before = gitAt(root, "rev-parse", "HEAD");
  const accepted = await invokeAsync(root, [
    "accept",
    "--spec",
    spec,
    "--ticket",
    "T-0001",
    "--author",
    "controller",
  ]);
  expect(accepted.status).not.toBe(0);
  const result = await integrate(root, spec);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/accepted/i);
  expect(gitAt(root, "rev-parse", "HEAD")).toBe(before);
});

test("integration refuses dirty canonical state before creating a merge journal", async () => {
  const { root, spec, workspace } = await acceptedTicket();
  const featureHead = gitAt(root, "rev-parse", "HEAD");
  writeFileSync(join(root, "private.txt"), "preserve\n");
  const result = await integrate(root, spec);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/resolve other changes/i);
  expect(gitAt(root, "rev-parse", "HEAD")).toBe(featureHead);
  expect(readFileSync(join(root, "private.txt"), "utf8")).toBe("preserve\n");
  expect(existsSync(workspace)).toBe(true);
});

test("conflicting merges stop with the merge state and ticket worktree intact", async () => {
  const { root, spec, workspace } = await acceptedTicket("tracked.txt", "ticket change\n");
  writeFileSync(join(root, "tracked.txt"), "feature change\n");
  gitAt(root, "add", "tracked.txt");
  gitAt(root, "commit", "-qm", "independent feature change");
  const featureHead = gitAt(root, "rev-parse", "HEAD");
  const result = await integrate(root, spec);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/preserve.*inspect/i);
  expect(gitAt(root, "rev-parse", "HEAD")).toBe(featureHead);
  expect(gitAt(root, "rev-parse", "MERGE_HEAD")).toBe(gitAt(workspace, "rev-parse", "HEAD"));
  expect(gitAt(root, "ls-files", "--unmerged")).not.toBe("");
  expect(readFileSync(join(workspace, "tracked.txt"), "utf8")).toBe("ticket change\n");
  const repeated = await integrate(root, spec);
  expect(repeated.status).not.toBe(0);
  expect(repeated.stderr).toMatch(/conflicts|git operation/i);
});

test("an automatic merge cannot silently change reviewed file content", async () => {
  const baseline = Array.from({ length: 20 }, (_, index) => `line ${index}\n`).join("");
  const ticketContent = baseline.replace("line 1\n", "ticket line\n");
  const { root, spec, workspace } = await acceptedTicket("tracked.txt", ticketContent, baseline);
  writeFileSync(join(root, "tracked.txt"), baseline.replace("line 18\n", "feature line\n"));
  gitAt(root, "add", "tracked.txt");
  gitAt(root, "commit", "-qm", "independent change to reviewed file");
  const before = gitAt(root, "rev-parse", "HEAD");
  const result = await integrate(root, spec);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/differs from the reviewed ticket commit/i);
  expect(gitAt(root, "rev-parse", "HEAD")).toBe(before);
  expect(gitAt(root, "rev-parse", "MERGE_HEAD")).toBe(gitAt(workspace, "rev-parse", "HEAD"));
  expect(readFileSync(join(workspace, "tracked.txt"), "utf8")).toBe(ticketContent);
});

test("integration resumes after interrupted canonical merge record persistence", async () => {
  const { root, spec } = await acceptedTicket();
  const target = join(dirname(spec), "tickets/T-0001.md");
  const marker = "INTERRUPTED_TICKET_INTEGRATION";
  const args = ["integrate", "--spec", spec, "--ticket", "T-0001", "--author", "controller"];
  const interrupted = await invokeAsync(root, args, {
    preload: join(repoRoot, "tests/helpers/preloads/interrupt-after-ticket-replacement.ts"),
    killOnOutput: marker,
    env: { SPINDLE_TEST_INTERRUPT_TARGET: target, SPINDLE_TEST_INTERRUPT_MARKER: marker },
  });
  expect(interrupted.signal, interrupted.stderr).toBe("SIGKILL");
  const merge = gitAt(root, "rev-parse", "HEAD");
  const resumed = await invokeAsync(root, args);
  expect(resumed.status, resumed.stderr).toBe(0);
  expect(JSON.parse(resumed.stdout).mergeCommit).toBe(merge);
  expect(
    JSON.parse(readFileSync(join(dirname(spec), "sdd.json"), "utf8")).tickets[0].integration
      .postMerge.status,
  ).toBe("pending");
});

test("integration recovers a journaled merge after interruption before record writing", async () => {
  const { root, spec } = await acceptedTicket();
  const args = ["integrate", "--spec", spec, "--ticket", "T-0001", "--author", "controller"];
  const interrupted = await invokeAsync(root, args, {
    preload: join(repoRoot, "tests/helpers/preloads/interrupt-after-git-merge-commit.ts"),
    killOnOutput: "INTERRUPTED_AFTER_MERGE_COMMIT",
  });
  expect(interrupted.signal, interrupted.stderr).toBe("SIGKILL");
  const merge = gitAt(root, "rev-parse", "HEAD");
  expect(
    JSON.parse(readFileSync(join(dirname(spec), "sdd.json"), "utf8")).tickets[0].execution,
  ).toBe("accepted");
  const resumed = await invokeAsync(root, args);
  expect(resumed.status, resumed.stderr).toBe(0);
  expect(JSON.parse(resumed.stdout).mergeCommit).toBe(merge);
  expect(
    JSON.parse(readFileSync(join(dirname(spec), "sdd.json"), "utf8")).tickets[0].execution,
  ).toBe("integrated");
});

test("ticket dispatch rejects dirty canonical records without creating a branch", async () => {
  const { root, spec, parent } = await setup();
  const claimed = await execute(root, (services) =>
    services.assignmentService.claim({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(claimed.status, claimed.stderr).toBe(0);
  const branch = "tickets/0001-ticket-isolation/T-0001";
  const attempted = await execute(root, (services) =>
    services.assignmentService.implement({
      spec,
      ticket: "T-0001",
      author: "controller",
      workspace: parent,
    }),
  );
  expect(attempted.status).not.toBe(0);
  expect(attempted.stderr).toMatch(/commit canonical workflow records/i);
  expect(existsSync(join(parent, "0001-ticket-isolation-T-0001"))).toBe(false);
  expect(() => gitAt(root, "rev-parse", "--verify", branch)).toThrow();
});

test("ticket dispatch preserves preexisting paths and branches", async () => {
  const { root, spec, parent } = await setup();
  const claimed = await execute(root, (services) =>
    services.assignmentService.claim({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(claimed.status, claimed.stderr).toBe(0);
  gitAt(root, "add", ".scratch");
  gitAt(root, "commit", "-qm", "record claim");
  const revision = gitAt(root, "rev-parse", "HEAD");
  const destination = join(parent, "0001-ticket-isolation-T-0001");
  mkdirSync(destination);
  writeFileSync(join(destination, "keep"), "preserve\n");
  const attempt = (workspace: string) =>
    execute(root, (services) =>
      services.assignmentService.implement({
        spec,
        ticket: "T-0001",
        author: "controller",
        workspace,
      }),
    );
  const pathCollision = await attempt(parent);
  expect(pathCollision.status).not.toBe(0);
  expect(pathCollision.stderr).toMatch(/destination already exists/i);
  expect(readFileSync(join(destination, "keep"), "utf8")).toBe("preserve\n");
  const alternate = join(parent, "alternate");
  mkdirSync(alternate);
  gitAt(root, "branch", "tickets/0001-ticket-isolation/T-0001");
  const branchCollision = await attempt(alternate);
  expect(branchCollision.status).not.toBe(0);
  expect(branchCollision.stderr).toMatch(/branch already exists/i);
  expect(gitAt(root, "rev-parse", "tickets/0001-ticket-isolation/T-0001")).toBe(revision);
  expect(existsSync(join(alternate, "0001-ticket-isolation-T-0001"))).toBe(false);
});

test("CLI dispatch resumes the same assignment and requires the ticket workspace", async () => {
  const { root, spec, parent } = await setup();
  const missing = await invokeAsync(root, [
    "implement",
    "--spec",
    spec,
    "--ticket",
    "T-0001",
    "--author",
    "controller",
  ]);
  expect(missing.status).not.toBe(0);
  expect(missing.stderr).toMatch(/--workspace/);
  const claimed = await execute(root, (services) =>
    services.assignmentService.claim({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(claimed.status, claimed.stderr).toBe(0);
  gitAt(root, "add", ".scratch");
  gitAt(root, "commit", "-qm", "record claim");
  const baseSha = gitAt(root, "rev-parse", "HEAD");
  const args = [
    "implement",
    "--spec",
    spec,
    "--ticket",
    "T-0001",
    "--author",
    "controller",
    "--workspace",
    parent,
  ];
  const first = await invokeAsync(root, args);
  expect(first.status, first.stderr).toBe(0);
  const assignment = JSON.parse(first.stdout).assignment as {
    id: string;
    workspace: string;
    branch: string;
  };
  expect(gitAt(assignment.workspace, "rev-parse", "HEAD")).toBe(baseSha);
  const repeated = await invokeAsync(root, args);
  expect(repeated.status, repeated.stderr).toBe(0);
  expect(JSON.parse(repeated.stdout).assignment).toEqual(assignment);
  const resumed = await invokeAsync(root, [
    "resume",
    "--spec",
    spec,
    "--ticket",
    "T-0001",
    "--author",
    "controller",
  ]);
  expect(resumed.status, resumed.stderr).toBe(0);
  expect(JSON.parse(resumed.stdout).assignment).toEqual(assignment);
});

test("competing dispatches reuse one ticket assignment and worktree", async () => {
  const { root, spec, parent } = await setup();
  const claimed = await execute(root, (services) =>
    services.assignmentService.claim({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(claimed.status, claimed.stderr).toBe(0);
  gitAt(root, "add", ".scratch");
  gitAt(root, "commit", "-qm", "record claim");
  const args = [
    "implement",
    "--spec",
    spec,
    "--ticket",
    "T-0001",
    "--author",
    "controller",
    "--workspace",
    parent,
  ];
  const results = await Promise.all([invokeAsync(root, args), invokeAsync(root, args)]);
  expect(
    results.map((result) => result.status),
    results.map((result) => result.stderr).join("\n"),
  ).toEqual([0, 0]);
  const assignments = results.map((result) => JSON.parse(result.stdout).assignment);
  expect(assignments[0]).toEqual(assignments[1]);
  expect(gitAt(assignments[0].workspace, "branch", "--show-current")).toBe(assignments[0].branch);
});

test("an unavailable ticket worktree does not hide another ticket's evidence", async () => {
  const { root, spec, parent } = await setup();
  const first = await dispatch(root, spec, parent, "T-0001");
  gitAt(root, "add", ".scratch");
  gitAt(root, "commit", "-qm", "record first assignment");
  const second = await dispatch(root, spec, parent, "T-0002");
  writeFileSync(join(first.assignment.workspace, "preserve.txt"), "preserve\n");
  const moved = `${first.assignment.workspace}-moved`;
  renameSync(first.assignment.workspace, moved);
  const status = await execute(root, (services) =>
    services.featureInspectionService.status({ spec }),
  );
  expect(status.status, status.stderr).toBe(0);
  const output = JSON.parse(status.stdout) as {
    blockers: { ticket: string; reason: string }[];
    snapshots: { ticket: string }[];
  };
  expect(
    output.blockers.some((item) => item.ticket === "T-0001" && /unavailable/.test(item.reason)),
  ).toBe(true);
  expect(output.snapshots.some((item) => item.ticket === "T-0002")).toBe(true);
  expect(readFileSync(join(moved, "preserve.txt"), "utf8")).toBe("preserve\n");
  expect(existsSync(second.assignment.workspace)).toBe(true);
});

test("dependent claims stop until post-merge validation exists", async () => {
  const { root, spec } = await setup();
  const blocked = await execute(root, (services) =>
    services.ticketService.ticketUpdate({
      spec,
      ticket: "T-0002",
      blockedBy: ["T-0001"],
      author: "controller",
    }),
  );
  expect(blocked.status, blocked.stderr).toBe(0);
  const closed = await execute(root, (services) =>
    services.ticketService.ticketUpdate({
      spec,
      ticket: "T-0001",
      status: "closed",
      author: "controller",
    }),
  );
  expect(closed.status, closed.stderr).toBe(0);
  gitAt(root, "add", ".scratch");
  gitAt(root, "commit", "-qm", "record dependency");
  const claim = await execute(root, (services) =>
    services.assignmentService.claim({ spec, ticket: "T-0002", author: "controller" }),
  );
  expect(claim.status).not.toBe(0);
  expect(claim.stderr).toMatch(/post-merge prerequisite validation/i);
});

test("ticket review rejects committed changes to its local scratch records", async () => {
  const { root, spec, parent } = await setup();
  const first = await dispatch(root, spec, parent, "T-0001");
  const workspace = first.assignment.workspace;
  writeFileSync(join(workspace, "first.ts"), "export const first = 1;\n");
  writeFileSync(join(workspace, ".scratch/0001-ticket-isolation/spec.md"), "changed locally\n");
  gitAt(workspace, "add", "first.ts", ".scratch");
  gitAt(workspace, "commit", "-qm", "code and wrong records");
  writeFileSync(first.assignment.report, "# Implementation report\n\nImplemented.\n");
  const submitted = await execute(root, (services) =>
    services.submissionService.submit({
      spec,
      ticket: "T-0001",
      role: "implementation",
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);
  const check = await recordReviewCheck(
    root,
    spec,
    "test ticket",
    JSON.parse(submitted.stdout).snapshot,
    "passed",
  );
  expect(check.status, check.stderr).toBe(0);
  const review = await execute(root, (services) =>
    services.reviewService.review({
      spec,
      ticket: "T-0001",
      inventory: JSON.stringify(["first.ts"]),
      author: "controller",
    }),
  );
  expect(review.status).not.toBe(0);
  expect(review.stderr).toMatch(/must not modify \.scratch/i);
});

test("a check cannot be recorded using a snapshot from a different ticket commit", async () => {
  const { root, spec, parent } = await setup();
  const first = await dispatch(root, spec, parent, "T-0001");
  gitAt(first.assignment.workspace, "commit", "--allow-empty", "-qm", "advance ticket");
  const stale = await recordReviewCheck(root, spec, "test ticket", first.snapshot, "passed");
  expect(stale.status).not.toBe(0);
  expect(stale.stderr).toMatch(/snapshot is stale/i);
});

test("resume recovers a dispatch interrupted while persisting its assignment", async () => {
  const { root, spec, parent } = await setup();
  const claimed = await execute(root, (services) =>
    services.assignmentService.claim({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(claimed.status, claimed.stderr).toBe(0);
  gitAt(root, "add", ".scratch");
  gitAt(root, "commit", "-qm", "record claim");
  const target = join(dirname(spec), "tickets/T-0001.md");
  const preload = join(repoRoot, "tests/helpers/preloads/interrupt-after-ticket-replacement.ts");
  const marker = "INTERRUPTED_TICKET_WORKTREE_ASSIGNMENT";
  const interrupted = await invokeAsync(
    root,
    [
      "implement",
      "--spec",
      spec,
      "--ticket",
      "T-0001",
      "--author",
      "controller",
      "--workspace",
      parent,
    ],
    {
      preload,
      killOnOutput: marker,
      env: { SPINDLE_TEST_INTERRUPT_TARGET: target, SPINDLE_TEST_INTERRUPT_MARKER: marker },
    },
  );
  expect(interrupted.signal, interrupted.stderr).toBe("SIGKILL");
  expect(existsSync(join(dirname(spec), ".sdd-write-recovery.json"))).toBe(true);
  const resumed = await invokeAsync(root, [
    "resume",
    "--spec",
    spec,
    "--ticket",
    "T-0001",
    "--author",
    "controller",
  ]);
  expect(resumed.status, resumed.stderr).toBe(0);
  const assignment = JSON.parse(resumed.stdout).assignment as { workspace: string; branch: string };
  expect(assignment.workspace).toBe(join(parent, "0001-ticket-isolation-T-0001"));
  expect(gitAt(assignment.workspace, "branch", "--show-current")).toBe(assignment.branch);
  expect(existsSync(join(dirname(spec), ".sdd-write-recovery.json"))).toBe(false);
});
