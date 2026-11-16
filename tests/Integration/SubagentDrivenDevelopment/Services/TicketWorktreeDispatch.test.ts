import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { LoadProjectSettings } from "@spindle/Foundation/Bootstrap/LoadProjectSettings";
import { WorkspaceTransaction } from "@spindle/SubagentDrivenDevelopment/Persistence/WorkspaceTransaction";
import { AssignmentService } from "@spindle/SubagentDrivenDevelopment/Services/AssignmentService";
import { applicationFixture } from "@test/Helpers/ApplicationFixture";
import {
  cliOutput,
  execute,
  invokeAsync,
  recordReviewCheck,
} from "@test/Helpers/SubagentDrivenDevelopment/helpers";
import {
  gitAt,
  setup,
  dispatch,
  acceptedTicket,
  integrate,
} from "@test/Helpers/SubagentDrivenDevelopment/TicketWorktreeFixtures";
import { repoRoot } from "@test/Helpers/TemporaryDirectories";
import { expect, test, vi } from "vitest";

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
