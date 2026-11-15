import { execFileSync } from "node:child_process";
import type {
  SpawnSyncOptionsWithBufferEncoding,
  SpawnSyncOptionsWithStringEncoding,
  SpawnSyncReturns,
} from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { expect, test, vi } from "vitest";

import type { Application } from "@spindle/Foundation/Application";
import { LoadProjectSettings } from "@spindle/Foundation/Bootstrap/LoadProjectSettings";
import { GitService } from "@spindle/Git/Services/GitService";
import { WorkspaceTransaction } from "@spindle/SubagentDrivenDevelopment/Persistence/WorkspaceTransaction";
import { AssignmentService } from "@spindle/SubagentDrivenDevelopment/Services/AssignmentService";
import { FeatureInspectionService } from "@spindle/SubagentDrivenDevelopment/Services/FeatureInspectionService";
import { TicketIntegrationService } from "@spindle/SubagentDrivenDevelopment/Services/TicketIntegrationService";
import { WorkflowRecordsCommitter } from "@spindle/SubagentDrivenDevelopment/Services/WorkflowRecordsCommitter";

import { applicationFixture } from "@test/Helpers/ApplicationFixture";
import {
  cliOutput,
  execute,
  fixture,
  invokeAsync,
  recordReviewCheck,
} from "@test/Helpers/SubagentDrivenDevelopment/helpers";
import { nextSummary } from "@test/Helpers/SubagentDrivenDevelopment/StatusSummary";
import { repoRoot } from "@test/Helpers/TemporaryDirectories";

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
    "--feature",
    originalSpec.replace(/\/spec\.md$/, ""),
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
  expect(gitAt(root, "status", "--short")).toBe("");
  return { root, spec, parent };
}

async function dispatch(root: string, spec: string, parent: string, ticket: string) {
  const result = await execute(root, (services) =>
    services.assignmentService.implement({
      spec,
      ticket,
      author: "controller",
      workspace: parent,
    }),
  );
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout) as {
    assignment: { id: string; workspace: string; branch: string; report: string };
    headSha: string;
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
      assignment: first.assignment.id,
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);
  const check = await recordReviewCheck(root, spec, "test ticket", "passed");
  expect(check.status, check.stderr).toBe(0);
  const reviewed = await execute(root, (services) =>
    services.reviewService.review({
      spec,
      ticket: "T-0001",
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
      assignment: review.id,
      result: "passed",
      author: "controller",
    }),
  );
  expect(approved.status, approved.stderr).toBe(0);
  return { root, spec, parent, workspace };
}

function integrate(root: string, spec: string) {
  return invokeAsync(root, [
    "integrate",
    "--feature",
    spec.replace(/\/spec\.md$/, ""),
    "--ticket",
    "T-0001",
    "--actor",
    "controller",
  ]);
}

function integrateWithService(root: string, spec: string) {
  return execute(root, (services) =>
    services.ticketIntegrationService.integrate({
      spec,
      ticket: "T-0001",
      author: "controller",
    }),
  );
}

test("independent tickets get distinct persisted branches and isolated evidence", async () => {
  const { root, spec, parent } = await setup();
  const first = await dispatch(root, spec, parent, "T-0001");
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
  const commits = JSON.parse(status.stdout).commits as {
    ticket: string;
    headSha: string;
  }[];
  const firstHeadSha = commits.find((item) => item.ticket === "T-0001")!.headSha;
  const secondHeadSha = commits.find((item) => item.ticket === "T-0002")!.headSha;
  writeFileSync(join(second.assignment.workspace, "second.ts"), "export const second = 3;\n");
  const updated = await execute(root, (services) =>
    services.featureInspectionService.status({ spec }),
  );
  expect(updated.status, updated.stderr).toBe(0);
  const later = JSON.parse(updated.stdout).commits as { ticket: string; headSha: string }[];
  expect(later.find((item) => item.ticket === "T-0001")!.headSha).toBe(firstHeadSha);
  expect(later.find((item) => item.ticket === "T-0002")!.headSha).toBe(secondHeadSha);
  gitAt(second.assignment.workspace, "add", "second.ts");
  gitAt(second.assignment.workspace, "commit", "-qm", "commit second ticket");
  const committed = await execute(root, (services) =>
    services.featureInspectionService.status({ spec }),
  );
  expect(committed.status, committed.stderr).toBe(0);
  expect(
    JSON.parse(committed.stdout).commits.find(
      (item: { ticket: string }) => item.ticket === "T-0002",
    ).headSha,
  ).not.toBe(secondHeadSha);
  expect(existsSync(join(root, "first.ts"))).toBe(false);
  expect(existsSync(join(first.assignment.workspace, "second.ts"))).toBe(false);
});

test("implement reserves a ready ticket and creates its worktree and assignment in one operation", async () => {
  const { root, spec, parent } = await setup();
  const baseSha = gitAt(root, "rev-parse", "HEAD");
  const result = await invokeAsync(root, [
    "implement",
    "--feature",
    spec.replace(/\/spec\.md$/, ""),
    "--ticket",
    "T-0001",
    "--actor",
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

test("dispatch automatically commits pending canonical records", async () => {
  const { root, spec, parent } = await setup();
  const report = join(dirname(spec), "reports", "T-0001-review.md");
  writeFileSync(report, "# Reviewed record\n\nNo sensitive values.\n");
  expect(gitAt(root, "ls-files", "--others", "--exclude-standard")).toContain("T-0001-review.md");
  const before = gitAt(root, "rev-parse", "HEAD");
  const dispatched = await execute(root, (services) =>
    services.assignmentService.implement({
      spec,
      ticket: "T-0001",
      author: "controller",
      workspace: parent,
    }),
  );
  expect(dispatched.status, dispatched.stderr).toBe(0);
  expect(gitAt(root, "diff", "--cached", "--name-only")).toBe("");
  expect(gitAt(root, "rev-parse", "HEAD")).not.toBe(before);
  expect(readFileSync(report, "utf8")).toContain("No sensitive values");

  const reportCommitPaths = gitAt(root, "show", "--format=", "--name-only", "HEAD~1")
    .split("\n")
    .filter(Boolean);
  expect(reportCommitPaths).toEqual([
    ".spindle/features/0001-ticket-isolation/reports/T-0001-review.md",
  ]);
  const committedPaths = gitAt(root, "show", "--format=", "--name-only", "HEAD")
    .split("\n")
    .filter(Boolean);
  expect(committedPaths).toEqual([
    ".spindle/features/0001-ticket-isolation/sdd.json",
    ".spindle/features/0001-ticket-isolation/tickets/T-0001.md",
  ]);
  expect(gitAt(root, "rev-parse", "HEAD")).not.toBe(before);
  expect(JSON.parse(dispatched.stdout).assignment.workspace).toBe(
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

test("review assignments become stale when the committed ticket HEAD changes", async () => {
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
      assignment: first.assignment.id,
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);
  const initialHead = JSON.parse(submitted.stdout).headSha as string;
  const check = await recordReviewCheck(root, spec, "test ticket", "passed");
  expect(check.status, check.stderr).toBe(0);
  const review = () =>
    execute(root, (services) =>
      services.reviewService.review({
        spec,
        ticket: "T-0001",
        author: "controller",
      }),
    );
  const status = await execute(root, (services) =>
    services.featureInspectionService.status({ spec }),
  );
  expect(status.status, status.stderr).toBe(0);
  const currentHeadSha = JSON.parse(status.stdout).commits.find(
    (item: { ticket: string }) => item.ticket === "T-0001",
  )!.headSha as string;
  expect(currentHeadSha).toBe(initialHead);
  const committedCheck = await recordReviewCheck(root, spec, "test ticket", "passed");
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
  expect(assignment.headSha).toBe(initialHead);
  expect(assignment.report).toContain(join(dirname(spec), "reports"));
  writeFileSync(assignment.report, "# Review\n\nNo findings.\n");
  gitAt(workspace, "commit", "--allow-empty", "-qm", "advance ticket HEAD");
  const reviewSubmission = await execute(root, (services) =>
    services.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: assignment.id,
      result: "passed",
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
      assignment: first.assignment.id,
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);
  const check = await recordReviewCheck(root, spec, "test ticket", "passed");
  expect(check.status, check.stderr).toBe(0);
  const reviewed = await execute(root, (services) =>
    services.reviewService.review({
      spec,
      ticket: "T-0001",
      author: "controller",
    }),
  );
  expect(reviewed.status, reviewed.stderr).toBe(0);
  const review = JSON.parse(reviewed.stdout).assignments[0] as { id: string; report: string };
  writeFileSync(review.report, "# Review\n\nNo findings.\n");
  writeFileSync(join(root, "other-ticket.ts"), "export const otherTicket = 1;\n");
  gitAt(root, "add", ".spindle/features", "other-ticket.ts");
  gitAt(root, "commit", "-qm", "advance feature branch");
  const approval = await execute(root, (services) =>
    services.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: review.id,
      result: "passed",
      author: "controller",
    }),
  );
  expect(approval.status, approval.stderr).toBe(0);
  const before = gitAt(root, "rev-parse", "HEAD");
  const integrated = await invokeAsync(root, [
    "integrate",
    "--feature",
    spec.replace(/\/spec\.md$/, ""),
    "--ticket",
    "T-0001",
    "--actor",
    "controller",
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
  expect(mergeParents).toEqual([output.mergeCommit, before, output.ticketCommit]);
  expect(readFileSync(join(root, "first.ts"), "utf8")).toBe("export const first = 1;\n");
  expect(existsSync(workspace)).toBe(true);
  const repeated = await invokeAsync(root, [
    "integrate",
    "--feature",
    spec.replace(/\/spec\.md$/, ""),
    "--ticket",
    "T-0001",
    "--actor",
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
  const recorded = await execute(root, (services) =>
    services.checksService.checksRecord({
      spec,
      ticket: "T-0001",
      scope: "post-merge",
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
    "--feature",
    spec.replace(/\/spec\.md$/, ""),
    "--ticket",
    "T-0001",
    "--scope",
    "post-merge",
    "--command",
    "post-merge test",
    "--actor",
    "controller",
  ]);
  expect(require.status, require.stderr).toBe(0);
  const requiredHeadSha = cliOutput(require).headSha as string;
  expect(requiredHeadSha).toBe(cliOutput(firstMerge).mergeCommit);
  const failed = await invokeAsync(root, [
    "checks",
    "record",
    "--feature",
    spec.replace(/\/spec\.md$/, ""),
    "--ticket",
    "T-0001",
    "--scope",
    "post-merge",
    "--command",
    "post-merge test",
    "--result",
    "failed",
    "--details",
    "Post-merge validation found a defect.",
    "--actor",
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
      assignment: second.assignment.id,
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);
  const headBefore = gitAt(root, "rev-parse", "HEAD");
  const unrelatedMerge = await invokeAsync(root, [
    "integrate",
    "--feature",
    spec.replace(/\/spec\.md$/, ""),
    "--ticket",
    "T-0002",
    "--actor",
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
  const ledgerContents = readFileSync(ledgerPath, "utf8");
  writeFileSync(ledgerPath, `${ledgerContents}\n`);
  gitAt(root, "add", ledgerPath);
  const stagedRecords = await execute(root, (services) =>
    services.assignmentService.implement(dispatchOptions),
  );
  expect(stagedRecords.status).not.toBe(0);
  expect(stagedRecords.stderr).toMatch(/staged/i);
  gitAt(root, "reset", "-q", "HEAD", "--", ledgerPath);
  writeFileSync(ledgerPath, ledgerContents);
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
  expect(gitAt(root, "merge-base", "--is-ancestor", mergeSha, "HEAD")).toBe("");

  const dispatchHead = gitAt(root, "rev-parse", "HEAD");
  const independent = await execute(root, (services) =>
    services.assignmentService.implement(dispatchOptions),
  );
  expect(independent.status, independent.stderr).toBe(0);
  const assignment = JSON.parse(independent.stdout).assignment as { workspace: string };
  expect(gitAt(root, "merge-base", "--is-ancestor", dispatchHead, "HEAD")).toBe("");
  expect(gitAt(assignment.workspace, "rev-parse", "HEAD")).toBe(dispatchHead);
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
      author: "controller",
    }),
  );
  expect(result.status, result.stderr).toBe(0);
  expect(gitAt(root, "merge-base", "--is-ancestor", mergeSha, "HEAD")).toBe("");
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  expect(ledger.tickets[0].status).toBe("closed");
  expect(ledger.tickets[0].integration.postMerge.checks.records[0].headSha).toBe(mergeSha);
  expect(ledger.tickets[1].worktree.baseSha).toBe(dispatchHead);
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
  const record = (command: string) =>
    execute(root, (services) =>
      services.checksService.checksRecord({
        ...declaration,
        command,
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
  const readyBefore = await invokeAsync(root, [
    "ready",
    "--feature",
    spec.replace(/\/spec\.md$/, ""),
  ]);
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
  expect(JSON.parse(retried.stdout)).toMatchObject({ closed: true, headSha: mergeSha });
  ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  expect(ledger.tickets[0].status).toBe("closed");
  expect(ledger.tickets[0].integration.postMerge.status).toBe("passed");
  expect(ledger.tickets[0].integration.postMerge.checks.records).toHaveLength(2);
  expect(gitAt(root, "merge-base", "--is-ancestor", mergeSha, "HEAD")).toBe("");
  const readyAfter = await invokeAsync(root, [
    "ready",
    "--feature",
    spec.replace(/\/spec\.md$/, ""),
  ]);
  expect(readyAfter.status, readyAfter.stderr).toBe(0);
  expect(cliOutput(readyAfter).ready).toContain("T-0002");
});

test("pending-gate ticket startup resumes after worktree allocation without advancing HEAD", async () => {
  const { root, spec, parent } = await acceptedTicket();
  const integrated = await integrate(root, spec);
  expect(integrated.status, integrated.stderr).toBe(0);
  const featureHead = gitAt(root, "rev-parse", "HEAD");
  const app = applicationFixture(root, join(repoRoot, "assets/Blueprints"));
  await new LoadProjectSettings().bootstrap(app);
  await app.boot();
  const transaction = await app.make(WorkspaceTransaction);
  const assignments = await app.make(AssignmentService);
  const options = {
    spec,
    ticket: "T-0002",
    workspace: parent,
    author: "controller",
  };
  vi.spyOn(transaction, "writeWorkflowState").mockImplementationOnce(() => {
    throw new Error("assignment write interrupted");
  });
  expect(() => assignments.implement(options)).toThrow("assignment write interrupted");
  const workspace = join(parent, "0001-ticket-isolation-T-0002");
  expect(gitAt(workspace, "rev-parse", "HEAD")).toBe(featureHead);
  expect(gitAt(root, "rev-parse", "HEAD")).toBe(featureHead);
  const resumed = assignments.implement(options);
  expect(resumed.assignment.workspace).toBe(workspace);
  expect(resumed.headSha).toBe(featureHead);
  expect(gitAt(root, "merge-base", "--is-ancestor", featureHead, "HEAD")).toBe("");
});

test("sync refuses a divergent ticket branch without moving it", async () => {
  const { root, spec, workspace } = await acceptedTicket();
  const integrated = await integrate(root, spec);
  expect(integrated.status, integrated.stderr).toBe(0);
  const args = [
    "checks",
    "require",
    "--feature",
    spec.replace(/\/spec\.md$/, ""),
    "--ticket",
    "T-0001",
    "--scope",
    "post-merge",
    "--command",
    "post-merge test",
    "--actor",
    "controller",
  ];
  const required = await invokeAsync(root, args);
  expect(required.status, required.stderr).toBe(0);
  const failed = await invokeAsync(root, [
    "checks",
    "record",
    "--feature",
    spec.replace(/\/spec\.md$/, ""),
    "--ticket",
    "T-0001",
    "--scope",
    "post-merge",
    "--command",
    "post-merge test",
    "--result",
    "failed",
    "--details",
    "Post-merge validation found a defect.",
    "--actor",
    "controller",
  ]);
  expect(failed.status, failed.stderr).toBe(0);
  gitAt(workspace, "commit", "--allow-empty", "-qm", "diverge after integration");
  const divergentHead = gitAt(workspace, "rev-parse", "HEAD");

  const synced = await invokeAsync(root, [
    "sync",
    "--feature",
    spec.replace(/\/spec\.md$/, ""),
    "--ticket",
    "T-0001",
    "--actor",
    "controller",
  ]);
  expect(synced.status).not.toBe(0);
  expect(synced.stderr).toMatch(/diverg|fast-forward/i);
  expect(gitAt(workspace, "rev-parse", "HEAD")).toBe(divergentHead);
});

test("sync adopts a manually rebased review baseline and archives submitted reviews", async () => {
  const { root, spec, workspace } = await acceptedTicket();
  const ledgerPath = join(dirname(spec), "sdd.json");
  const before = JSON.parse(readFileSync(ledgerPath, "utf8"));
  const oldBase = before.tickets[0].baseSha as string;
  const oldReview = before.tickets[0].reviewAssignments[0];
  writeFileSync(join(root, "independent.ts"), "export const independent = true;\n");
  gitAt(root, "add", "independent.ts");
  gitAt(root, "commit", "-qm", "advance feature baseline");
  const currentBase = gitAt(root, "rev-parse", "HEAD");
  gitAt(workspace, "rebase", currentBase);
  const ticketHead = gitAt(workspace, "rev-parse", "HEAD");

  const synced = await invokeAsync(root, [
    "sync",
    "--feature",
    spec.replace(/\/spec\.md$/, ""),
    "--ticket",
    "T-0001",
    "--actor",
    "controller",
  ]);
  expect(synced.status, synced.stderr).toBe(0);
  expect(cliOutput(synced)).toMatchObject({
    mode: "review-baseline",
    baseSha: currentBase,
    headSha: ticketHead,
  });
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  expect(ledger.tickets[0]).toMatchObject({
    baseSha: currentBase,
    worktree: { baseSha: currentBase },
    baselineHistory: [
      {
        from: oldBase,
        to: currentBase,
        ticketHead,
        author: "controller",
      },
    ],
    reviewHistory: [{ id: oldReview.id, status: "submitted" }],
  });
  expect(ledger.tickets[0].reviewAssignments).toBeUndefined();
  const repeated = await invokeAsync(root, [
    "sync",
    "--feature",
    spec.replace(/\/spec\.md$/, ""),
    "--ticket",
    "T-0001",
    "--actor",
    "controller",
  ]);
  expect(repeated.status, repeated.stderr).toBe(0);
  expect(cliOutput(repeated).idempotent).toBe(true);
});

test("a reviewed post-merge correction preserves failures and requires fresh checks on its new merge", async () => {
  const { root, spec, workspace, parent } = await acceptedTicket();
  const initial = await integrateWithService(root, spec);
  expect(initial.status, initial.stderr).toBe(0);
  const oldMerge = JSON.parse(initial.stdout).mergeCommit as string;
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
  const failed = await execute(root, (services) =>
    services.checksService.checksRecord({
      spec,
      ticket: "T-0001",
      scope: "post-merge",
      command: "integration test",
      result: "failed",
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
      assignment: second.assignment.id,
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
  const beforeSync = await execute(root, (services) =>
    services.correctionService.correct(correctionOptions),
  );
  expect(beforeSync.status).not.toBe(0);
  expect(beforeSync.stderr).toMatch(/sdd sync/i);
  writeFileSync(join(workspace, "private.txt"), "preserve user work\n");
  const dirtySync = await execute(root, (services) =>
    services.ticketSyncService.sync({
      spec,
      ticket: "T-0001",
      author: "controller",
    }),
  );
  expect(dirtySync.status).not.toBe(0);
  expect(dirtySync.stderr).toMatch(/clean/i);
  expect(readFileSync(join(workspace, "private.txt"), "utf8")).toBe("preserve user work\n");
  rmSync(join(workspace, "private.txt"));
  const synced = await execute(root, (services) =>
    services.ticketSyncService.sync({
      spec,
      ticket: "T-0001",
      author: "controller",
    }),
  );
  expect(synced.status, synced.stderr).toBe(0);
  expect(JSON.parse(synced.stdout).mergeCommit).toBe(oldMerge);
  expect(gitAt(workspace, "rev-parse", "HEAD")).toBe(oldMerge);
  const repeatedSync = await execute(root, (services) =>
    services.ticketSyncService.sync({
      spec,
      ticket: "T-0001",
      author: "controller",
    }),
  );
  expect(repeatedSync.status, repeatedSync.stderr).toBe(0);
  expect(JSON.parse(repeatedSync.stdout).idempotent).toBe(true);
  const nextAfterSync = await invokeAsync(root, [
    "next",
    "--feature",
    spec.replace(/\/spec\.md$/, ""),
  ]);
  expect(nextAfterSync.status, nextAfterSync.stderr).toBe(0);
  const nextAfterSyncSummary = nextSummary(cliOutput(nextAfterSync)).join("\n");
  expect(nextAfterSyncSummary).toContain("step ticket:correct (judgment required)");
  expect(nextAfterSyncSummary).toContain("--check-failure 'integration test'");
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
  expect(stale.stderr).toMatch(/uncommitted changes/i);
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
  const assignment = JSON.parse(dispatched.stdout).assignment as { id: string; report: string };
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
      assignment: assignment.id,
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);
  const check = await recordReviewCheck(root, spec, "test ticket", "passed");
  expect(check.status, check.stderr).toBe(0);
  const review = await execute(root, (services) =>
    services.reviewService.review({
      spec,
      ticket: "T-0001",
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
      assignment: reviewer.id,
      result: "passed",
      author: "controller",
    }),
  );
  expect(approved.status, approved.stderr).toBe(0);
  const merged = await integrateWithService(root, spec);
  expect(merged.status, merged.stderr).toBe(0);
  const newMerge = JSON.parse(merged.stdout).mergeCommit as string;
  expect(newMerge).not.toBe(oldMerge);
  ledger = JSON.parse(readFileSync(join(dirname(spec), "sdd.json"), "utf8"));
  expect(ledger.tickets[0].status).toBe("open");
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
  const freshHeadSha = JSON.parse(fresh.stdout).headSha as string;
  expect(freshHeadSha).toBe(newMerge);
  const passed = await execute(root, (services) =>
    services.checksService.checksRecord({
      spec,
      ticket: "T-0001",
      scope: "post-merge",
      command: "integration test",
      result: "passed",
      author: "controller",
    }),
  );
  expect(passed.status, passed.stderr).toBe(0);
  const smoke = await execute(root, (services) =>
    services.checksService.checksRecord({
      spec,
      ticket: "T-0001",
      scope: "post-merge",
      command: "smoke",
      result: "passed",
      author: "controller",
    }),
  );
  expect(smoke.status, smoke.stderr).toBe(0);
  ledger = JSON.parse(readFileSync(join(dirname(spec), "sdd.json"), "utf8"));
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
  writeFileSync(join(dirname(spec), "reports", "pending.md"), "# Pending report\n");
  const app = applicationFixture(root, join(repoRoot, "assets/Blueprints"));
  await new LoadProjectSettings().bootstrap(app);
  await app.boot();
  const feature = (await app.make(FeatureInspectionService)).resolveFeature(spec);
  const committer = new WorkflowRecordsCommitter(app, new InterruptedRecordGit(app));
  expect(() => committer.commit(feature)).toThrow("record stage interrupted");
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
  const reviewedHead = gitAt(workspace, "rev-parse", "HEAD");
  writeFileSync(join(root, "tracked.txt"), "feature change\n");
  gitAt(root, "add", "tracked.txt");
  gitAt(root, "commit", "-qm", "independent feature change");
  const featureHead = gitAt(root, "rev-parse", "HEAD");
  const result = await integrate(root, spec);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/conflicts.*ticket worktree/i);
  expect(result.stderr).toMatch(/sdd sync/i);
  const preservedHead = gitAt(root, "rev-parse", "HEAD");
  expect(preservedHead).toBe(featureHead);
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
  const syncArgs = [
    "sync",
    "--feature",
    spec.replace(/\/spec\.md$/, ""),
    "--ticket",
    "T-0001",
    "--actor",
    "controller",
  ];
  const interrupted = await invokeAsync(root, syncArgs);
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
  const dependencyBlocked = await invokeAsync(root, syncArgs);
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
  const adopted = await invokeAsync(root, syncArgs);
  expect(adopted.status, adopted.stderr).toBe(0);
  const adoptedBaseline = cliOutput(adopted).baseSha as string;
  expect(adoptedBaseline).not.toBe(reviewedHead);
  const rechecked = await recordReviewCheck(root, spec, "test ticket", "passed");
  expect(rechecked.status, rechecked.stderr).toBe(0);
  const reviewed = await execute(root, (services) =>
    services.reviewService.review({
      spec,
      ticket: "T-0001",
      author: "controller",
    }),
  );
  expect(reviewed.status, reviewed.stderr).toBe(0);
  const reviewer = JSON.parse(reviewed.stdout).assignments[0] as {
    id: string;
    report: string;
    headSha: string;
    reworkBaseSha: string;
  };
  expect(reviewer.reworkBaseSha).toBe(reviewedHead);
  expect(reviewer.headSha).toBe(gitAt(workspace, "rev-parse", "HEAD"));
  writeFileSync(reviewer.report, "# Review\n\nResolution reviewed.\n");
  const approved = await execute(root, (services) =>
    services.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: reviewer.id,
      result: "passed",
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
  expect(preservedHead).toBe(before);
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
    "--feature",
    spec.replace(/\/spec\.md$/, ""),
    "--ticket",
    "T-0001",
    "--actor",
    "controller",
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
    "--feature",
    spec.replace(/\/spec\.md$/, ""),
    "--ticket",
    "T-0001",
    "--actor",
    "controller",
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

async function interruptAfterMergeNoCommit(root: string, spec: string) {
  const app = applicationFixture(root, join(repoRoot, "assets/Blueprints"));
  await new LoadProjectSettings().bootstrap(app);
  await app.boot();
  const gitService = await app.make(GitService);
  const originalRun = gitService.run.bind(gitService);
  vi.spyOn(gitService, "run").mockImplementation(((args: string[], options: never) => {
    const result = originalRun(args, options);
    if (args.includes("merge") && args.includes("--no-commit") && result.status === 0)
      throw new Error("fixture interruption after merge --no-commit");
    return result;
  }) as typeof gitService.run);
  const service = await app.make(TicketIntegrationService);
  const featureHead = gitAt(root, "rev-parse", "HEAD");
  expect(() => service.integrate({ spec, ticket: "T-0001", author: "controller" })).toThrow(
    /fixture interruption after merge --no-commit/,
  );
  const mergeHeadPath = gitAt(
    root,
    "rev-parse",
    "--path-format=absolute",
    "--git-path",
    "MERGE_HEAD",
  );
  expect(existsSync(mergeHeadPath)).toBe(true);
  expect(gitAt(root, "rev-parse", "HEAD")).toBe(featureHead);
  return { featureHead, mergeHeadPath };
}

test("integration resumes a journalled merge interrupted after merge --no-commit", async () => {
  const { root, spec, workspace } = await acceptedTicket();
  const ticketHead = gitAt(workspace, "rev-parse", "HEAD");
  const { featureHead, mergeHeadPath } = await interruptAfterMergeNoCommit(root, spec);
  expect(readFileSync(mergeHeadPath, "utf8").trim()).toBe(ticketHead);
  const resumed = await integrate(root, spec);
  expect(resumed.status, resumed.stderr).toBe(0);
  const output = cliOutput(resumed);
  const mergeCommit = output.mergeCommit as string;
  expect(gitAt(root, "merge-base", "--is-ancestor", mergeCommit, "HEAD")).toBe("");
  expect(output.ticketCommit).toBe(ticketHead);
  expect(gitAt(root, "rev-list", "--parents", "-n", "1", mergeCommit).split(" ")).toEqual([
    mergeCommit,
    featureHead,
    ticketHead,
  ]);
  const journal = JSON.parse(readFileSync(output.journal as string, "utf8")) as { id: string };
  expect(gitAt(root, "show", "-s", "--format=%B", mergeCommit)).toBe(
    `spindle: merge T-0001 (${journal.id})`,
  );
  expect(existsSync(mergeHeadPath)).toBe(false);
  expect(readFileSync(join(root, "first.ts"), "utf8")).toBe("ticket\n");
  const progress = JSON.parse(readFileSync(join(dirname(spec), "sdd.json"), "utf8")).tickets[0];
  expect(progress.execution).toBe("integrated");
  expect(progress.integration.commitSha).toBe(ticketHead);
  expect(progress.integration.mergeSha).toBe(mergeCommit);
  expect(progress.integration.postMerge).toMatchObject({
    status: "pending",
    mergeSha: mergeCommit,
  });
});

test("integration rejects an unrelated in-progress merge even with a journal", async () => {
  const { root, spec } = await acceptedTicket();
  const { featureHead, mergeHeadPath } = await interruptAfterMergeNoCommit(root, spec);
  const unrelated = gitAt(root, "rev-parse", "HEAD^");
  writeFileSync(mergeHeadPath, `${unrelated}\n`);
  const blocked = await integrate(root, spec);
  expect(blocked.status).not.toBe(0);
  expect(blocked.stderr).toMatch(/Existing Git operation MERGE_HEAD was preserved/);
  expect(readFileSync(mergeHeadPath, "utf8").trim()).toBe(unrelated);
  expect(gitAt(root, "rev-parse", "HEAD")).toBe(featureHead);
  expect(
    JSON.parse(readFileSync(join(dirname(spec), "sdd.json"), "utf8")).tickets[0].execution,
  ).toBe("reviewing");
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
    "--feature",
    spec.replace(/\/spec\.md$/, ""),
    "--ticket",
    "T-0001",
    "--actor",
    "controller",
  ]);
  expect(missing.status).not.toBe(0);
  expect(missing.stderr).toMatch(/--workspace/);
  const baseSha = gitAt(root, "rev-parse", "HEAD");
  const args = [
    "implement",
    "--feature",
    spec.replace(/\/spec\.md$/, ""),
    "--ticket",
    "T-0001",
    "--actor",
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
    "--feature",
    spec.replace(/\/spec\.md$/, ""),
    "--ticket",
    "T-0001",
    "--actor",
    "controller",
  ]);
  expect(resumed.status, resumed.stderr).toBe(0);
  expect(cliOutput(resumed).assignment).toEqual(assignment);
});

test("competing dispatches reuse one ticket assignment and worktree", async () => {
  const { root, spec, parent } = await setup();
  const args = [
    "implement",
    "--feature",
    spec.replace(/\/spec\.md$/, ""),
    "--ticket",
    "T-0001",
    "--actor",
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
    commits: { ticket: string }[];
  };
  expect(
    output.blockers.some((item) => item.ticket === "T-0001" && /unavailable/.test(item.reason)),
  ).toBe(true);
  expect(output.commits.some((item) => item.ticket === "T-0002")).toBe(true);
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

test("ticket review rejects committed changes to requirements that differ from canonical records", async () => {
  const { root, spec, parent } = await setup();
  const first = await dispatch(root, spec, parent, "T-0001");
  const workspace = first.assignment.workspace;
  writeFileSync(join(workspace, "first.ts"), "export const first = 1;\n");
  writeFileSync(
    join(workspace, ".spindle/features/0001-ticket-isolation/spec.md"),
    "changed locally\n",
  );
  gitAt(workspace, "add", "first.ts", ".spindle/features");
  gitAt(workspace, "commit", "-qm", "code and wrong records");
  writeFileSync(first.assignment.report, "# Implementation report\n\nImplemented.\n");
  const submitted = await execute(root, (services) =>
    services.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: first.assignment.id,
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);
  const check = await recordReviewCheck(root, spec, "test ticket", "passed");
  expect(check.status).not.toBe(0);
  expect(check.stderr).toMatch(/current committed requirements/i);
});

test("a check records the current ticket commit instead of accepting a supplied identity", async () => {
  const { root, spec, parent } = await setup();
  const first = await dispatch(root, spec, parent, "T-0001");
  gitAt(first.assignment.workspace, "commit", "--allow-empty", "-qm", "advance ticket");
  const recorded = await recordReviewCheck(root, spec, "test ticket", "passed");
  expect(recorded.status, recorded.stderr).toBe(0);
  expect(JSON.parse(recorded.stdout).record.headSha).toBe(
    gitAt(first.assignment.workspace, "rev-parse", "HEAD"),
  );
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
      "--feature",
      spec.replace(/\/spec\.md$/, ""),
      "--ticket",
      "T-0001",
      "--actor",
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
    "--feature",
    spec.replace(/\/spec\.md$/, ""),
    "--ticket",
    "T-0001",
    "--actor",
    "controller",
  ]);
  expect(resumed.status, resumed.stderr).toBe(0);
  const assignment = cliOutput(resumed).assignment as { workspace: string; branch: string };
  expect(assignment.workspace).toBe(join(parent, "0001-ticket-isolation-T-0001"));
  expect(gitAt(assignment.workspace, "branch", "--show-current")).toBe(assignment.branch);
  expect(existsSync(join(dirname(spec), ".sdd-write-recovery.json"))).toBe(false);
});
