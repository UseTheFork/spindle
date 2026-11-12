import { execFileSync } from "node:child_process";
import type {
  SpawnSyncOptionsWithBufferEncoding,
  SpawnSyncOptionsWithStringEncoding,
  SpawnSyncReturns,
} from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { expect, test, vi } from "vitest";

import type { Application } from "@/Foundation/Application";
import { LoadProjectConfiguration } from "@/Foundation/Bootstrap/LoadProjectConfiguration";
import { GitService } from "@/Git/Services/GitService";
import { WorkspaceTransaction } from "@/SubagentDrivenDevelopment/Persistence/WorkspaceTransaction";
import { AssignmentService } from "@/SubagentDrivenDevelopment/Services/AssignmentService";
import { FeatureInspectionService } from "@/SubagentDrivenDevelopment/Services/FeatureInspectionService";
import { WorkflowRecordsCommitter } from "@/SubagentDrivenDevelopment/Services/WorkflowRecordsCommitter";

import { applicationFixture } from "../../../Helpers/ApplicationFixture";
import {
  cliOutput,
  execute,
  fixture,
  invokeAsync,
  recordReviewCheck,
} from "../../../Helpers/SubagentDrivenDevelopment/helpers";
import { repoRoot } from "../../../Helpers/TemporaryDirectories.ts";

function gitAt(directory: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd: directory,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function hasStringEncoding(
  options: SpawnSyncOptionsWithStringEncoding | SpawnSyncOptionsWithBufferEncoding,
): options is SpawnSyncOptionsWithStringEncoding {
  return typeof options.encoding === "string" && options.encoding !== "buffer";
}

class InterruptedRecordGit extends GitService {
  public constructor(app: Application) {
    super(app);
  }
  public override run(
    args: string[],
    options: SpawnSyncOptionsWithStringEncoding,
  ): SpawnSyncReturns<string>;
  public override run(
    args: string[],
    options: SpawnSyncOptionsWithBufferEncoding,
  ): SpawnSyncReturns<Buffer>;
  public override run(
    args: string[],
    options: SpawnSyncOptionsWithStringEncoding | SpawnSyncOptionsWithBufferEncoding,
  ): SpawnSyncReturns<string | Buffer> {
    const result = hasStringEncoding(options) ? super.run(args, options) : super.run(args, options);
    if (args[0] === "add" && result.status === 0) throw new Error("record stage interrupted");
    return result;
  }
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
  const output = cliOutput(started) as { featureWorkspace: string; spec: string };
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
  const result = await execute(root, (services) =>
    services.assignmentService.implement({
      spec,
      ticket,
      author: "controller",
      workspace: parent,
      confirmRecords: true,
    }),
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
  mkdirSync(dirname(join(workspace, file)), { recursive: true });
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
    "--confirm-records",
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

test("implement reserves a ready ticket and creates its worktree and assignment in one operation", async () => {
  const { root, spec, parent } = await setup();
  const baseSha = gitAt(root, "rev-parse", "HEAD");
  const result = await invokeAsync(root, [
    "implement",
    "--spec",
    spec,
    "--ticket",
    "T-0001",
    "--author",
    "controller",
    "--workspace",
    parent,
  ]);

  expect(result.status, result.stderr).toBe(0);
  const output = cliOutput(result) as {
    execution: string;
    assignment: { workspace: string; branch: string };
  };
  expect(output.execution).toBe("implementing");
  expect(output.assignment.workspace).toBe(join(parent, "0001-ticket-isolation-T-0001"));
  expect(output.assignment.branch).toBe("tickets/0001-ticket-isolation/T-0001");
  const ledger = JSON.parse(readFileSync(join(dirname(spec), "sdd.json"), "utf8"));
  expect(ledger.tickets[0]).toMatchObject({
    execution: "implementing",
    owner: "controller",
    baseSha,
    worktree: {
      workspace: output.assignment.workspace,
      branch: output.assignment.branch,
      baseSha,
    },
    assignment: {
      role: "implementation",
      action: "implement",
      workspace: output.assignment.workspace,
      branch: output.assignment.branch,
      status: "pending",
    },
  });
  expect(gitAt(output.assignment.workspace, "rev-parse", "HEAD")).toBe(baseSha);
});

test("dispatch requires explicit inspection confirmation before committing canonical records", async () => {
  const { root, spec, parent } = await setup();
  const report = join(dirname(spec), "reports", "T-0001-review.md");
  writeFileSync(report, "# Reviewed record\n\nNo sensitive values.\n");
  expect(gitAt(root, "ls-files", "--others", "--exclude-standard")).toContain("T-0001-review.md");
  const before = gitAt(root, "rev-parse", "HEAD");
  const rejected = await execute(root, (services) =>
    services.assignmentService.implement({
      spec,
      ticket: "T-0001",
      author: "controller",
      workspace: parent,
      confirmRecords: false,
    }),
  );
  expect(rejected.status).not.toBe(0);
  expect(rejected.stderr).toMatch(/inspect.*--confirm-records/i);
  expect(gitAt(root, "rev-parse", "HEAD")).toBe(before);
  expect(gitAt(root, "diff", "--cached", "--name-only")).toBe("");
  expect(existsSync(join(parent, "0001-ticket-isolation-T-0001"))).toBe(false);
  expect(readFileSync(report, "utf8")).toContain("No sensitive values");

  const confirmed = await invokeAsync(root, [
    "implement",
    "--spec",
    spec,
    "--ticket",
    "T-0001",
    "--author",
    "controller",
    "--workspace",
    parent,
    "--confirm-records",
  ]);
  expect(confirmed.status, confirmed.stderr).toBe(0);
  const committedPaths = gitAt(root, "show", "--format=", "--name-only", "HEAD")
    .split("\n")
    .filter(Boolean);
  expect(committedPaths).toEqual([".scratch/0001-ticket-isolation/reports/T-0001-review.md"]);
  expect(gitAt(root, "rev-parse", "HEAD")).not.toBe(before);
  expect(cliOutput(confirmed).assignment.workspace).toBe(
    join(parent, "0001-ticket-isolation-T-0001"),
  );
});

test("dispatch refuses staged or unrelated changes even with canonical-record confirmation", async () => {
  const { root, spec, parent } = await setup();
  const before = gitAt(root, "rev-parse", "HEAD");
  writeFileSync(join(root, "unrelated.txt"), "preserve\n");
  const unrelated = await execute(root, (services) =>
    services.assignmentService.implement({
      spec,
      ticket: "T-0001",
      author: "controller",
      workspace: parent,
      confirmRecords: true,
    }),
  );
  expect(unrelated.status).not.toBe(0);
  expect(unrelated.stderr).toMatch(/unrelated or non-canonical changes/i);
  expect(readFileSync(join(root, "unrelated.txt"), "utf8")).toBe("preserve\n");
  expect(gitAt(root, "rev-parse", "HEAD")).toBe(before);
  expect(existsSync(join(parent, "0001-ticket-isolation-T-0001"))).toBe(false);

  gitAt(root, "add", "unrelated.txt");
  const staged = await execute(root, (services) =>
    services.assignmentService.implement({
      spec,
      ticket: "T-0001",
      author: "controller",
      workspace: parent,
      confirmRecords: true,
    }),
  );
  expect(staged.status).not.toBe(0);
  expect(staged.stderr).toMatch(/staged data was preserved/i);
  expect(gitAt(root, "diff", "--cached", "--name-only")).toBe("unrelated.txt");
  expect(existsSync(join(parent, "0001-ticket-isolation-T-0001"))).toBe(false);
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
  const before = gitAt(root, "rev-parse", "HEAD");
  const integrated = await invokeAsync(root, [
    "integrate",
    "--spec",
    spec,
    "--ticket",
    "T-0001",
    "--author",
    "controller",
    "--confirm-records",
  ]);
  expect(integrated.status, integrated.stderr).toBe(0);
  const output = cliOutput(integrated) as {
    mergeCommit: string;
    ticketCommit: string;
    postMerge: string;
  };
  expect(output.ticketCommit).toBe(gitAt(workspace, "rev-parse", "HEAD"));
  expect(output.postMerge).toBe("pending");
  const mergeParents = gitAt(root, "rev-list", "--parents", "-n", "1", output.mergeCommit).split(
    " ",
  );
  expect(mergeParents).toEqual([output.mergeCommit, mergeParents[1], output.ticketCommit]);
  expect(mergeParents[1]).not.toBe(before);
  expect(gitAt(root, "show", "-s", "--format=%s", mergeParents[1])).toBe(
    "spindle: record 0001-ticket-isolation workflow",
  );
  expect(gitAt(root, "rev-list", "--parents", "-n", "1", mergeParents[1]).split(" ")).toEqual([
    mergeParents[1],
    before,
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
  expect(cliOutput(repeated).idempotent).toBe(true);
  const dependency = await execute(root, (services) =>
    services.ticketService.ticketUpdate({
      spec,
      ticket: "T-0002",
      blockedBy: ["T-0001"],
      author: "controller",
    }),
  );
  expect(dependency.status, dependency.stderr).toBe(0);
  const dependentDispatch = await execute(root, (services) =>
    services.assignmentService.implement({
      spec,
      ticket: "T-0002",
      author: "controller",
      workspace: parent,
    }),
  );
  expect(dependentDispatch.status).not.toBe(0);
  expect(dependentDispatch.stderr).toMatch(/open dependencies: T-0001/i);

  const declared = await execute(root, (services) =>
    services.checksService.checksRequire({
      spec,
      ticket: "T-0001",
      scope: "post-merge",
      command: ["test integrated feature"],
      author: "controller",
    }),
  );
  expect(declared.status, declared.stderr).toBe(0);
  const snapshot = JSON.parse(declared.stdout).snapshot as string;
  const recorded = await execute(root, (services) =>
    services.checksService.checksRecord({
      spec,
      ticket: "T-0001",
      scope: "post-merge",
      snapshot,
      command: "test integrated feature",
      result: "passed",
      author: "controller",
    }),
  );
  expect(recorded.status, recorded.stderr).toBe(0);
  expect(JSON.parse(recorded.stdout).headSha).toBe(output.mergeCommit);
  const ledger = JSON.parse(readFileSync(join(dirname(spec), "sdd.json"), "utf8"));
  expect(ledger.tickets[0].status).toBe("closed");
  expect(ledger.tickets[0].integration.postMerge.status).toBe("passed");
  const next = await dispatch(root, spec, parent, "T-0002");
  expect(readFileSync(join(next.assignment.workspace, "first.ts"), "utf8")).toBe(
    "export const first = 1;\n",
  );
});

test("integration preserves ignored collisions and permits unrelated ignored files on retry", async () => {
  const { root, spec, parent, workspace } = await acceptedTicket();
  const ticketHead = gitAt(workspace, "rev-parse", "HEAD");
  const common = gitAt(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
  const exclude = join(common, "info", "exclude");
  writeFileSync(exclude, `${readFileSync(exclude, "utf8")}\n/first.ts\n/local-cache.txt\n`);
  const collision = join(root, "first.ts");
  const unrelated = join(root, "local-cache.txt");
  writeFileSync(collision, "precious ignored content\n");
  writeFileSync(unrelated, "unrelated ignored content\n");
  expect(gitAt(root, "check-ignore", "first.ts")).toBe("first.ts");

  const refused = await integrate(root, spec);
  expect(refused.status).not.toBe(0);
  expect(refused.stderr).toMatch(/overwritten|overwrite/i);
  expect(readFileSync(collision, "utf8")).toBe("precious ignored content\n");
  expect(readFileSync(unrelated, "utf8")).toBe("unrelated ignored content\n");
  expect(gitAt(workspace, "rev-parse", "HEAD")).toBe(ticketHead);
  const journal = join(
    common,
    "spindle-ticket-integration",
    `0001-ticket-isolation-T-0001-${ticketHead}.json`,
  );
  const featureHead = (JSON.parse(readFileSync(journal, "utf8")) as { featureHead: string })
    .featureHead;
  expect(gitAt(root, "rev-parse", "HEAD")).toBe(featureHead);
  expect(gitAt(root, "diff", "--cached", "--name-only")).toBe("");
  expect(
    existsSync(gitAt(root, "rev-parse", "--path-format=absolute", "--git-path", "MERGE_HEAD")),
  ).toBe(false);
  const ledger = JSON.parse(readFileSync(join(dirname(spec), "sdd.json"), "utf8"));
  expect(ledger.tickets[0].integration).toBeUndefined();

  const saved = join(parent, "preserved-first.ts");
  renameSync(collision, saved);
  const retried = await integrate(root, spec);
  expect(retried.status, retried.stderr).toBe(0);
  expect(readFileSync(saved, "utf8")).toBe("precious ignored content\n");
  expect(readFileSync(collision, "utf8")).toBe("ticket\n");
  expect(readFileSync(unrelated, "utf8")).toBe("unrelated ignored content\n");
});

test("integration preserves an ignored file above an incoming path", async () => {
  const { root, spec, parent, workspace } = await acceptedTicket("incoming/file.ts");
  const common = gitAt(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
  const exclude = join(common, "info", "exclude");
  writeFileSync(exclude, `${readFileSync(exclude, "utf8")}\n/incoming\n`);
  const collision = join(root, "incoming");
  writeFileSync(collision, "precious ignored ancestor\n");
  const ticketHead = gitAt(workspace, "rev-parse", "HEAD");
  const refused = await integrate(root, spec);
  expect(refused.status).not.toBe(0);
  expect(refused.stderr).toMatch(/ignored files would be overwritten/i);
  expect(readFileSync(collision, "utf8")).toBe("precious ignored ancestor\n");
  expect(gitAt(workspace, "rev-parse", "HEAD")).toBe(ticketHead);
  const saved = join(parent, "preserved-ancestor");
  renameSync(collision, saved);
  mkdirSync(collision);
  writeFileSync(join(collision, "other.log"), "unrelated ignored sibling\n");
  const retried = await integrate(root, spec);
  expect(retried.status, retried.stderr).toBe(0);
  expect(readFileSync(saved, "utf8")).toBe("precious ignored ancestor\n");
  expect(readFileSync(join(root, "incoming/file.ts"), "utf8")).toBe("ticket\n");
  expect(readFileSync(join(root, "incoming/other.log"), "utf8")).toBe(
    "unrelated ignored sibling\n",
  );
});

test("integration preserves ignored files underneath an incoming file", async () => {
  const { root, spec, parent, workspace } = await acceptedTicket("incoming");
  const common = gitAt(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
  const exclude = join(common, "info", "exclude");
  writeFileSync(exclude, `${readFileSync(exclude, "utf8")}\n/incoming/\n`);
  const collision = join(root, "incoming");
  mkdirSync(collision);
  writeFileSync(join(collision, "keep.txt"), "precious ignored descendant\n");
  const ticketHead = gitAt(workspace, "rev-parse", "HEAD");
  const refused = await integrate(root, spec);
  expect(refused.status).not.toBe(0);
  expect(refused.stderr).toMatch(/ignored files would be overwritten/i);
  expect(readFileSync(join(collision, "keep.txt"), "utf8")).toBe("precious ignored descendant\n");
  expect(gitAt(workspace, "rev-parse", "HEAD")).toBe(ticketHead);
  const saved = join(parent, "preserved-directory");
  renameSync(collision, saved);
  const retried = await integrate(root, spec);
  expect(retried.status, retried.stderr).toBe(0);
  expect(readFileSync(join(saved, "keep.txt"), "utf8")).toBe("precious ignored descendant\n");
  expect(readFileSync(collision, "utf8")).toBe("ticket\n");
});

test("integration preserves an empty ignored directory at an incoming file", async () => {
  const { root, spec } = await acceptedTicket("incoming");
  const common = gitAt(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
  const exclude = join(common, "info", "exclude");
  writeFileSync(exclude, `${readFileSync(exclude, "utf8")}\n/incoming/\n`);
  const collision = join(root, "incoming");
  mkdirSync(collision);
  const refused = await integrate(root, spec);
  expect(refused.status).not.toBe(0);
  expect(refused.stderr).toMatch(/ignored files would be overwritten/i);
  expect(existsSync(collision)).toBe(true);
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

test("unapproved work cannot be merged without current review", async () => {
  const { root, spec, parent } = await setup();
  const { assignment } = await dispatch(root, spec, parent, "T-0001");
  writeFileSync(join(assignment.workspace, "first.ts"), "unreviewed\n");
  gitAt(assignment.workspace, "add", "first.ts");
  gitAt(assignment.workspace, "commit", "-qm", "unreviewed");
  const before = gitAt(root, "rev-parse", "HEAD");
  const result = await integrate(root, spec);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/current review|review or checks are not current/i);
  expect(gitAt(root, "rev-parse", "HEAD")).toBe(before);
});

test("a failed post-merge validation blocks integration of another ticket", async () => {
  const { root, spec, parent } = await acceptedTicket();
  const firstMerge = await integrate(root, spec);
  expect(firstMerge.status, firstMerge.stderr).toBe(0);
  const require = await invokeAsync(root, [
    "checks",
    "require",
    "--spec",
    spec,
    "--ticket",
    "T-0001",
    "--scope",
    "post-merge",
    "--command",
    "post-merge test",
    "--author",
    "controller",
  ]);
  expect(require.status, require.stderr).toBe(0);
  const snapshot = cliOutput(require).snapshot as string;
  const failed = await invokeAsync(root, [
    "checks",
    "record",
    "--spec",
    spec,
    "--ticket",
    "T-0001",
    "--scope",
    "post-merge",
    "--snapshot",
    snapshot,
    "--command",
    "post-merge test",
    "--result",
    "failed",
    "--details",
    "Post-merge validation found a defect.",
    "--author",
    "controller",
  ]);
  expect(failed.status, failed.stderr).toBe(0);

  const second = await dispatch(root, spec, parent, "T-0002");
  writeFileSync(join(second.assignment.workspace, "second.ts"), "export const second = 2;\n");
  gitAt(second.assignment.workspace, "add", "second.ts");
  gitAt(second.assignment.workspace, "commit", "-qm", "implement second");
  const secondHead = gitAt(second.assignment.workspace, "rev-parse", "HEAD");
  writeFileSync(second.assignment.report, "# Implementation report\n\nImplemented.\n");
  const submitted = await execute(root, (services) =>
    services.submissionService.submit({
      spec,
      ticket: "T-0002",
      role: "implementation",
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);
  const headBefore = gitAt(root, "rev-parse", "HEAD");
  const unrelatedMerge = await invokeAsync(root, [
    "integrate",
    "--spec",
    spec,
    "--ticket",
    "T-0002",
    "--author",
    "controller",
  ]);
  expect(unrelatedMerge.status).not.toBe(0);
  expect(unrelatedMerge.stderr).toMatch(/post-merge validation is pending or failed.*T-0001/i);
  expect(gitAt(root, "rev-parse", "HEAD")).toBe(headBefore);
  expect(gitAt(second.assignment.workspace, "rev-parse", "HEAD")).toBe(secondHead);
});

test("independent dispatch preserves the exact pending merge for post-merge checks", async () => {
  const { root, spec, parent } = await acceptedTicket();
  const integrated = await integrate(root, spec);
  expect(integrated.status, integrated.stderr).toBe(0);
  const mergeSha = cliOutput(integrated).mergeCommit as string;
  const dispatchOptions = {
    spec,
    ticket: "T-0002",
    author: "controller",
    workspace: parent,
    confirmRecords: true,
  };
  writeFileSync(join(root, "private.txt"), "preserve user work\n");
  const dirty = await execute(root, (services) =>
    services.assignmentService.implement(dispatchOptions),
  );
  expect(dirty.status).not.toBe(0);
  expect(readFileSync(join(root, "private.txt"), "utf8")).toBe("preserve user work\n");
  gitAt(root, "add", "private.txt");
  const staged = await execute(root, (services) =>
    services.assignmentService.implement(dispatchOptions),
  );
  expect(staged.status).not.toBe(0);
  expect(staged.stderr).toMatch(/staged/i);
  gitAt(root, "reset", "-q", "HEAD", "--", "private.txt");
  rmSync(join(root, "private.txt"));
  const ledgerPath = join(dirname(spec), "sdd.json");
  gitAt(root, "add", ledgerPath);
  const stagedRecords = await execute(root, (services) =>
    services.assignmentService.implement(dispatchOptions),
  );
  expect(stagedRecords.status).not.toBe(0);
  expect(stagedRecords.stderr).toMatch(/staged/i);
  gitAt(root, "reset", "-q", "HEAD", "--", ledgerPath);
  const unrelatedReport = join(dirname(spec), "reports", "T-9999-unregistered.md");
  writeFileSync(unrelatedReport, "unregistered data\n");
  const unregistered = await execute(root, (services) =>
    services.assignmentService.implement(dispatchOptions),
  );
  expect(unregistered.status).not.toBe(0);
  expect(unregistered.stderr).toMatch(/non-canonical/i);
  expect(readFileSync(unrelatedReport, "utf8")).toBe("unregistered data\n");
  rmSync(unrelatedReport);
  const common = gitAt(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
  const journal = join(common, "spindle-record-commit", "0001-ticket-isolation.json");
  mkdirSync(dirname(journal), { recursive: true });
  writeFileSync(journal, "preserve interrupted journal\n");
  const journalled = await execute(root, (services) =>
    services.assignmentService.implement(dispatchOptions),
  );
  expect(journalled.status).not.toBe(0);
  expect(journalled.stderr).toMatch(/journal/i);
  expect(readFileSync(journal, "utf8")).toBe("preserve interrupted journal\n");
  rmSync(journal);
  expect(gitAt(root, "rev-parse", "HEAD")).toBe(mergeSha);

  const independent = await execute(root, (services) =>
    services.assignmentService.implement(dispatchOptions),
  );
  expect(independent.status, independent.stderr).toBe(0);
  const assignment = JSON.parse(independent.stdout).assignment as { workspace: string };
  expect(gitAt(root, "rev-parse", "HEAD")).toBe(mergeSha);
  expect(gitAt(assignment.workspace, "rev-parse", "HEAD")).toBe(mergeSha);
  const declared = await execute(root, (services) =>
    services.checksService.checksRequire({
      spec,
      ticket: "T-0001",
      scope: "post-merge",
      command: ["integration test"],
      author: "controller",
    }),
  );
  expect(declared.status, declared.stderr).toBe(0);
  const result = await execute(root, (services) =>
    services.checksService.checksRecord({
      spec,
      ticket: "T-0001",
      scope: "post-merge",
      command: "integration test",
      result: "passed",
      snapshot: JSON.parse(declared.stdout).snapshot,
      author: "controller",
    }),
  );
  expect(result.status, result.stderr).toBe(0);
  expect(gitAt(root, "rev-parse", "HEAD")).toBe(mergeSha);
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  expect(ledger.tickets[0].status).toBe("closed");
  expect(ledger.tickets[0].integration.postMerge.checks.records[0].headSha).toBe(mergeSha);
  expect(ledger.tickets[1].worktree.baseSha).toBe(mergeSha);
});

test("pending post-merge checks preserve evidence until blockers and dependencies are resolved", async () => {
  const { root, spec } = await acceptedTicket();
  const integrated = await integrate(root, spec);
  expect(integrated.status, integrated.stderr).toBe(0);
  const mergeSha = cliOutput(integrated).mergeCommit as string;
  const third = await execute(root, (services) =>
    services.ticketService.ticketCreate({
      spec,
      title: "Later prerequisite",
      reporter: "requester",
      category: "enhancement",
      author: "controller",
    }),
  );
  expect(third.status, third.stderr).toBe(0);
  for (const [ticket, blockedBy] of [
    ["T-0002", ["T-0001"]],
    ["T-0001", ["T-0003"]],
  ] as const) {
    const updated = await execute(root, (services) =>
      services.ticketService.ticketUpdate({
        spec,
        ticket,
        blockedBy: [...blockedBy],
        author: "controller",
      }),
    );
    expect(updated.status, updated.stderr).toBe(0);
  }
  const declaration = {
    spec,
    ticket: "T-0001",
    scope: "post-merge" as const,
    command: ["first check", "second check"],
    author: "controller",
  };
  const declared = await execute(root, (services) =>
    services.checksService.checksRequire(declaration),
  );
  expect(declared.status, declared.stderr).toBe(0);
  const snapshot = JSON.parse(declared.stdout).snapshot as string;
  const record = (command: string) =>
    execute(root, (services) =>
      services.checksService.checksRecord({
        ...declaration,
        command,
        snapshot,
        result: "passed",
      }),
    );
  const first = await record("first check");
  expect(first.status, first.stderr).toBe(0);
  const blocked = await execute(root, (services) =>
    services.ticketService.ticketUpdate({
      spec,
      ticket: "T-0001",
      blocker: "Awaiting approval",
      author: "controller",
    }),
  );
  expect(blocked.status, blocked.stderr).toBe(0);
  const last = await record("second check");
  expect(last.status, last.stderr).toBe(0);
  expect(JSON.parse(last.stdout)).toMatchObject({
    closed: false,
    closureBlocked: [
      "Ticket blocker: Awaiting approval",
      "Unmet or unvalidated dependencies: T-0003",
    ],
    retry: expect.stringContaining("checks require"),
  });
  const ledgerPath = join(dirname(spec), "sdd.json");
  let ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  expect(ledger.tickets[0].status).not.toBe("closed");
  expect(ledger.tickets[0].integration.postMerge.status).toBe("pending");
  expect(ledger.tickets[0].integration.postMerge.checks.records).toHaveLength(2);
  const readyBefore = await invokeAsync(root, ["ready", "--spec", spec]);
  expect(readyBefore.status, readyBefore.stderr).toBe(0);
  expect(cliOutput(readyBefore).ready).not.toContain("T-0002");
  const cleared = await execute(root, (services) =>
    services.ticketService.ticketUpdate({
      spec,
      ticket: "T-0001",
      clearBlocker: true,
      author: "controller",
    }),
  );
  expect(cleared.status, cleared.stderr).toBe(0);
  const stillBlocked = await execute(root, (services) =>
    services.checksService.checksRequire(declaration),
  );
  expect(stillBlocked.status, stillBlocked.stderr).toBe(0);
  expect(JSON.parse(stillBlocked.stdout)).toMatchObject({
    closed: false,
    closureBlocked: ["Unmet or unvalidated dependencies: T-0003"],
  });
  const dependencyResolved = await execute(root, (services) =>
    services.ticketService.ticketUpdate({
      spec,
      ticket: "T-0001",
      clearBlockedBy: true,
      author: "controller",
    }),
  );
  expect(dependencyResolved.status, dependencyResolved.stderr).toBe(0);
  const retried = await execute(root, (services) =>
    services.checksService.checksRequire(declaration),
  );
  expect(retried.status, retried.stderr).toBe(0);
  expect(JSON.parse(retried.stdout)).toMatchObject({ closed: true, snapshot });
  ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  expect(ledger.tickets[0].status).toBe("closed");
  expect(ledger.tickets[0].integration.postMerge.status).toBe("passed");
  expect(ledger.tickets[0].integration.postMerge.checks.records).toHaveLength(2);
  expect(gitAt(root, "rev-parse", "HEAD")).toBe(mergeSha);
  const readyAfter = await invokeAsync(root, ["ready", "--spec", spec]);
  expect(readyAfter.status, readyAfter.stderr).toBe(0);
  expect(cliOutput(readyAfter).ready).toContain("T-0002");
});

test("pending-gate ticket startup resumes after worktree allocation without advancing HEAD", async () => {
  const { root, spec, parent } = await acceptedTicket();
  const integrated = await integrate(root, spec);
  expect(integrated.status, integrated.stderr).toBe(0);
  const mergeSha = cliOutput(integrated).mergeCommit as string;
  const app = applicationFixture(root, join(repoRoot, "src/Assets/Blueprints"));
  await new LoadProjectConfiguration().bootstrap(app);
  await app.boot();
  const transaction = await app.make(WorkspaceTransaction);
  const assignments = await app.make(AssignmentService);
  const options = {
    spec,
    ticket: "T-0002",
    workspace: parent,
    author: "controller",
    confirmRecords: true,
  };
  vi.spyOn(transaction, "writeWorkflowState").mockImplementationOnce(() => {
    throw new Error("assignment write interrupted");
  });
  expect(() => assignments.implement(options)).toThrow("assignment write interrupted");
  const workspace = join(parent, "0001-ticket-isolation-T-0002");
  expect(gitAt(workspace, "rev-parse", "HEAD")).toBe(mergeSha);
  expect(gitAt(root, "rev-parse", "HEAD")).toBe(mergeSha);
  const resumed = assignments.implement(options);
  expect(resumed.assignment.workspace).toBe(workspace);
  expect(resumed.headSha).toBe(mergeSha);
  expect(gitAt(root, "rev-parse", "HEAD")).toBe(mergeSha);
});

test("a reviewed post-merge correction preserves failures and requires fresh checks on its new merge", async () => {
  const { root, spec, workspace, parent } = await acceptedTicket();
  const initial = await integrate(root, spec);
  expect(initial.status, initial.stderr).toBe(0);
  const oldMerge = cliOutput(initial).mergeCommit as string;
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
  const snapshot = JSON.parse(declared.stdout).snapshot as string;
  const failed = await execute(root, (services) =>
    services.checksService.checksRecord({
      spec,
      ticket: "T-0001",
      scope: "post-merge",
      command: "integration test",
      result: "failed",
      snapshot,
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
      role: "implementation",
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
  const beforeFastForward = await execute(root, (services) =>
    services.correctionService.correct(correctionOptions),
  );
  expect(beforeFastForward.status).not.toBe(0);
  expect(beforeFastForward.stderr).toMatch(/fast-forward/i);
  gitAt(workspace, "merge", "--ff-only", oldMerge);
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
  expect(stale.stderr).toMatch(/stale/i);
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
  const blocked = await invokeAsync(root, [
    "integrate",
    "--spec",
    spec,
    "--ticket",
    "T-0002",
    "--author",
    "controller",
    "--confirm-records",
  ]);
  expect(blocked.status).not.toBe(0);
  expect(blocked.stderr).toMatch(/post-merge validation.*T-0001/i);
  const assignment = JSON.parse(dispatched.stdout).assignment as { report: string };
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
  expect(review.status, review.stderr).toBe(0);
  const reviewer = JSON.parse(review.stdout).assignments[0] as { id: string; report: string };
  writeFileSync(reviewer.report, "# Review\n\nCorrected.\n");
  const approved = await execute(root, (services) =>
    services.submissionService.submit({
      spec,
      ticket: "T-0001",
      role: "review",
      assignment: reviewer.id,
      report: reviewer.report,
      result: "passed",
      noFindings: true,
      author: "controller",
    }),
  );
  expect(approved.status, approved.stderr).toBe(0);
  const merged = await integrate(root, spec);
  expect(merged.status, merged.stderr).toBe(0);
  const newMerge = cliOutput(merged).mergeCommit as string;
  expect(newMerge).not.toBe(oldMerge);
  ledger = JSON.parse(readFileSync(join(dirname(spec), "sdd.json"), "utf8"));
  expect(ledger.tickets[0].status).toBe("in-progress");
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
  const freshSnapshot = JSON.parse(fresh.stdout).snapshot as string;
  expect(freshSnapshot).not.toBe(snapshot);
  const passed = await execute(root, (services) =>
    services.checksService.checksRecord({
      spec,
      ticket: "T-0001",
      scope: "post-merge",
      command: "integration test",
      result: "passed",
      snapshot: freshSnapshot,
      author: "controller",
    }),
  );
  expect(passed.status, passed.stderr).toBe(0);
  ledger = JSON.parse(readFileSync(join(dirname(spec), "sdd.json"), "utf8"));
  expect(ledger.tickets[0].status).toBe("in-progress");
  const smoke = await execute(root, (services) =>
    services.checksService.checksRecord({
      spec,
      ticket: "T-0001",
      scope: "post-merge",
      command: "smoke",
      result: "passed",
      snapshot: freshSnapshot,
      author: "controller",
    }),
  );
  expect(smoke.status, smoke.stderr).toBe(0);
  ledger = JSON.parse(readFileSync(join(dirname(spec), "sdd.json"), "utf8"));
  expect(ledger.tickets[0].status).toBe("closed");
  expect(ledger.tickets[0].integration.postMerge.checks.records[0].headSha).toBe(newMerge);
  expect(ledger.tickets[0].integrationHistory[0].postMerge.checks.records[0].result).toBe("failed");
});

test("integration refuses dirty canonical state before creating a merge journal", async () => {
  const { root, spec, workspace } = await acceptedTicket();
  const featureHead = gitAt(root, "rev-parse", "HEAD");
  writeFileSync(join(root, "private.txt"), "preserve\n");
  const result = await integrate(root, spec);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/unrelated or non-canonical changes/i);
  expect(gitAt(root, "rev-parse", "HEAD")).toBe(featureHead);
  expect(readFileSync(join(root, "private.txt"), "utf8")).toBe("preserve\n");
  expect(existsSync(workspace)).toBe(true);
});

test("integration recovers its journalled staged records but rejects unrelated staged data", async () => {
  const { root, spec } = await acceptedTicket();
  const app = applicationFixture(root, join(repoRoot, "src/Assets/Blueprints"));
  await new LoadProjectConfiguration().bootstrap(app);
  await app.boot();
  const feature = (await app.make(FeatureInspectionService)).resolveFeature(spec);
  const committer = new WorkflowRecordsCommitter(app, new InterruptedRecordGit(app));
  expect(() => committer.commit(feature, true)).toThrow("record stage interrupted");
  expect(gitAt(root, "diff", "--cached", "--name-only")).not.toBe("");
  const resumed = await integrate(root, spec);
  expect(resumed.status, resumed.stderr).toBe(0);
  expect(cliOutput(resumed).postMerge).toBe("pending");

  const second = await acceptedTicket();
  writeFileSync(join(second.root, "private.txt"), "preserve staged user data\n");
  gitAt(second.root, "add", "private.txt");
  const blocked = await integrate(second.root, second.spec);
  expect(blocked.status).not.toBe(0);
  expect(blocked.stderr).toMatch(/staged/i);
  expect(gitAt(second.root, "show", ":private.txt")).toBe("preserve staged user data");
});

test("conflicts are resolved in the ticket worktree and require fresh checks and review", async () => {
  const { root, spec, workspace } = await acceptedTicket("tracked.txt", "ticket change\n");
  writeFileSync(join(root, "tracked.txt"), "feature change\n");
  gitAt(root, "add", "tracked.txt");
  gitAt(root, "commit", "-qm", "independent feature change");
  const featureHead = gitAt(root, "rev-parse", "HEAD");
  const result = await integrate(root, spec);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/conflicts.*ticket worktree/i);
  const preservedHead = gitAt(root, "rev-parse", "HEAD");
  expect(preservedHead).not.toBe(featureHead);
  expect(gitAt(root, "log", "-1", "--format=%s")).toBe(
    "spindle: record 0001-ticket-isolation workflow",
  );
  expect(
    existsSync(gitAt(root, "rev-parse", "--path-format=absolute", "--git-path", "MERGE_HEAD")),
  ).toBe(false);
  expect(gitAt(root, "ls-files", "--unmerged")).toBe("");
  expect(readFileSync(join(workspace, "tracked.txt"), "utf8")).toBe("ticket change\n");
  const repeated = await integrate(root, spec);
  expect(repeated.status).not.toBe(0);
  expect(repeated.stderr).toMatch(/conflicts/i);
  expect(gitAt(root, "rev-parse", "HEAD")).toBe(preservedHead);
  expect(() => gitAt(workspace, "rebase", "features/0001-ticket-isolation")).toThrow();
  expect(gitAt(workspace, "ls-files", "--unmerged")).not.toBe("");
  const interrupted = await execute(root, (services) =>
    services.checksService.checksRequire({
      spec,
      ticket: "T-0001",
      command: "test ticket",
      rebaseBaseline: true,
      author: "controller",
    }),
  );
  expect(interrupted.status).not.toBe(0);
  expect(gitAt(workspace, "ls-files", "--unmerged")).not.toBe("");
  writeFileSync(join(workspace, "tracked.txt"), "resolved feature and ticket change\n");
  gitAt(workspace, "add", "tracked.txt");
  gitAt(workspace, "-c", "core.editor=true", "rebase", "--continue");
  const stillStale = await integrate(root, spec);
  expect(stillStale.status).not.toBe(0);
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
    services.checksService.checksRequire({
      spec,
      ticket: "T-0001",
      command: "test ticket",
      rebaseBaseline: true,
      author: "controller",
    }),
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
  const adopted = await execute(root, (services) =>
    services.checksService.checksRequire({
      spec,
      ticket: "T-0001",
      command: "test ticket",
      rebaseBaseline: true,
      author: "controller",
    }),
  );
  expect(adopted.status, adopted.stderr).toBe(0);
  const rechecked = await recordReviewCheck(
    root,
    spec,
    "test ticket",
    JSON.parse(adopted.stdout).snapshot,
    "passed",
  );
  expect(rechecked.status, rechecked.stderr).toBe(0);
  const reviewed = await execute(root, (services) =>
    services.reviewService.review({
      spec,
      ticket: "T-0001",
      inventory: JSON.stringify(["tracked.txt"]),
      author: "controller",
    }),
  );
  expect(reviewed.status, reviewed.stderr).toBe(0);
  const reviewer = JSON.parse(reviewed.stdout).assignments[0] as { id: string; report: string };
  writeFileSync(reviewer.report, "# Review\n\nResolution reviewed.\n");
  const approved = await execute(root, (services) =>
    services.submissionService.submit({
      spec,
      ticket: "T-0001",
      role: "review",
      assignment: reviewer.id,
      report: reviewer.report,
      result: "passed",
      noFindings: true,
      author: "controller",
    }),
  );
  expect(approved.status, approved.stderr).toBe(0);
  const resolved = await integrate(root, spec);
  expect(resolved.status, resolved.stderr).toBe(0);
  expect(readFileSync(join(root, "tracked.txt"), "utf8")).toBe(
    "resolved feature and ticket change\n",
  );
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
  const preservedHead = gitAt(root, "rev-parse", "HEAD");
  expect(preservedHead).not.toBe(before);
  expect(gitAt(root, "log", "-1", "--format=%s")).toBe(
    "spindle: record 0001-ticket-isolation workflow",
  );
  expect(
    existsSync(gitAt(root, "rev-parse", "--path-format=absolute", "--git-path", "MERGE_HEAD")),
  ).toBe(false);
  expect(readFileSync(join(workspace, "tracked.txt"), "utf8")).toBe(ticketContent);
});

test("integration resumes after interrupted canonical merge record persistence", async () => {
  const { root, spec } = await acceptedTicket();
  const target = join(dirname(spec), "tickets/T-0001.md");
  const marker = "INTERRUPTED_TICKET_INTEGRATION";
  const args = [
    "integrate",
    "--spec",
    spec,
    "--ticket",
    "T-0001",
    "--author",
    "controller",
    "--confirm-records",
  ];
  const interrupted = await invokeAsync(root, args, {
    preload: join(repoRoot, "tests/Helpers/Preloads/interrupt-after-ticket-replacement.ts"),
    killOnOutput: marker,
    env: { SPINDLE_TEST_INTERRUPT_TARGET: target, SPINDLE_TEST_INTERRUPT_MARKER: marker },
  });
  expect(interrupted.signal, interrupted.stderr).toBe("SIGKILL");
  const merge = gitAt(root, "rev-parse", "HEAD");
  const resumed = await invokeAsync(root, args);
  expect(resumed.status, resumed.stderr).toBe(0);
  expect(cliOutput(resumed).mergeCommit).toBe(merge);
  expect(
    JSON.parse(readFileSync(join(dirname(spec), "sdd.json"), "utf8")).tickets[0].integration
      .postMerge.status,
  ).toBe("pending");
});

test("integration recovers a journaled merge after interruption before record writing", async () => {
  const { root, spec } = await acceptedTicket();
  const args = [
    "integrate",
    "--spec",
    spec,
    "--ticket",
    "T-0001",
    "--author",
    "controller",
    "--confirm-records",
  ];
  const interrupted = await invokeAsync(root, args, {
    preload: join(repoRoot, "tests/Helpers/Preloads/interrupt-after-git-merge-commit.ts"),
    killOnOutput: "INTERRUPTED_AFTER_MERGE_COMMIT",
  });
  expect(interrupted.signal, interrupted.stderr).toBe("SIGKILL");
  const merge = gitAt(root, "rev-parse", "HEAD");
  expect(
    JSON.parse(readFileSync(join(dirname(spec), "sdd.json"), "utf8")).tickets[0].execution,
  ).toBe("reviewing");
  const resumed = await invokeAsync(root, args);
  expect(resumed.status, resumed.stderr).toBe(0);
  expect(cliOutput(resumed).mergeCommit).toBe(merge);
  expect(
    JSON.parse(readFileSync(join(dirname(spec), "sdd.json"), "utf8")).tickets[0].execution,
  ).toBe("integrated");
});

test("ticket dispatch preserves preexisting paths and branches", async () => {
  const { root, spec, parent } = await setup();
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
  const assignment = cliOutput(first).assignment as {
    id: string;
    workspace: string;
    branch: string;
  };
  expect(gitAt(assignment.workspace, "rev-parse", "HEAD")).toBe(baseSha);
  const repeated = await invokeAsync(root, args);
  expect(repeated.status, repeated.stderr).toBe(0);
  expect(cliOutput(repeated).assignment).toEqual(assignment);
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
  expect(cliOutput(resumed).assignment).toEqual(assignment);
});

test("competing dispatches reuse one ticket assignment and worktree", async () => {
  const { root, spec, parent } = await setup();
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
  const assignments = results.map((result) => cliOutput(result).assignment);
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

test("dependent dispatch waits for closed and post-merge-validated prerequisites", async () => {
  const { root, spec, parent } = await setup();
  const blocked = await execute(root, (services) =>
    services.ticketService.ticketUpdate({
      spec,
      ticket: "T-0002",
      blockedBy: ["T-0001"],
      author: "controller",
    }),
  );
  expect(blocked.status, blocked.stderr).toBe(0);
  gitAt(root, "add", ".scratch");
  gitAt(root, "commit", "-qm", "record dependency");
  const dispatch = await execute(root, (services) =>
    services.assignmentService.implement({
      spec,
      ticket: "T-0002",
      author: "controller",
      workspace: parent,
    }),
  );
  expect(dispatch.status).not.toBe(0);
  expect(dispatch.stderr).toMatch(/open dependencies: T-0001/i);
  expect(existsSync(join(parent, "0001-ticket-isolation-T-0002"))).toBe(false);
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
  const target = join(dirname(spec), "tickets/T-0001.md");
  const preload = join(repoRoot, "tests/Helpers/Preloads/interrupt-after-ticket-replacement.ts");
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
  const assignment = cliOutput(resumed).assignment as { workspace: string; branch: string };
  expect(assignment.workspace).toBe(join(parent, "0001-ticket-isolation-T-0001"));
  expect(gitAt(assignment.workspace, "branch", "--show-current")).toBe(assignment.branch);
  expect(existsSync(join(dirname(spec), ".sdd-write-recovery.json"))).toBe(false);
});
