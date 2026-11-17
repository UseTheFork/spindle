import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { GitEvidence } from "@spindle/SubagentDrivenDevelopment/Evidence/GitEvidence";
import { ReportEvidence } from "@spindle/SubagentDrivenDevelopment/Evidence/ReportEvidence";
import { APPROVED_TASK_PLAN_EXCEPTION } from "@spindle/SubagentDrivenDevelopment/Models/Assignments";
import type {
  ApprovedTaskPlanException,
  CorrectionAttempt,
  ImplementationAssignment,
} from "@spindle/SubagentDrivenDevelopment/Models/Assignments";
import type {
  AcceptedEvidence,
  CommitIdentity,
  IntegrationRecord,
} from "@spindle/SubagentDrivenDevelopment/Models/Evidence";
import type {
  FeatureLedger,
  FeaturePaths,
  TicketProgress,
} from "@spindle/SubagentDrivenDevelopment/Models/Workflow";
import { LedgerRepository } from "@spindle/SubagentDrivenDevelopment/Persistence/LedgerRepository";
import { AcceptancePolicy } from "@spindle/SubagentDrivenDevelopment/Policies/AcceptancePolicy";
import { TicketIntegrationService } from "@spindle/SubagentDrivenDevelopment/Services/TicketIntegrationService";
import { WorkflowRecordsCommitter } from "@spindle/SubagentDrivenDevelopment/Services/WorkflowRecordsCommitter";
import {
  cliOutput,
  execute,
  fixture,
  invokeAsync,
  recordReviewCheck,
} from "@test/Helpers/SubagentDrivenDevelopment/helpers";
import {
  gitAt,
  dispatch,
  acceptedTicket,
  integrate,
} from "@test/Helpers/SubagentDrivenDevelopment/TicketWorktreeFixtures";
import { expect, test, afterEach, vi } from "vitest";

import { acceptTaskPlan } from "../Fixtures/TaskPlans";

afterEach(() => {
  vi.restoreAllMocks();
});

async function integrationGateFixture(title = "Ticket Task Dispatch") {
  const { repo } = fixture();
  const created = await execute(repo, (services) =>
    services.featureCreationService.create({ title, author: "controller" }),
  );
  expect(created.status, created.stderr).toBe(0);
  const initialSpec = JSON.parse(created.stdout).spec as string;
  const parent = join(dirname(repo), "feature-worktrees");
  mkdirSync(parent);
  const started = await invokeAsync(repo, [
    "start",
    "--feature",
    initialSpec.replace(/\/spec\.md$/, ""),
    "--workspace",
    parent,
    "--confirm-records",
  ]);
  expect(started.status, started.stderr).toBe(0);
  const { featureWorkspace: root, spec } = cliOutput(started) as {
    featureWorkspace: string;
    spec: string;
  };
  for (let index = 1; index <= 5; index++) {
    const ticket = await execute(root, (services) =>
      services.ticketService.ticketCreate({
        spec,
        title: `Integration gate ticket ${index}`,
        reporter: "requester",
        category: "enhancement",
        author: "controller",
      }),
    );
    expect(ticket.status, ticket.stderr).toBe(0);
  }
  const ledger = JSON.parse(readFileSync(join(dirname(spec), "sdd.json"), "utf8")) as FeatureLedger;
  return { root, spec, ledger };
}

function progressFor(ledger: FeatureLedger, ticket: string): TicketProgress {
  const progress = ledger.tickets.find((candidate) => candidate.id === ticket);
  if (!progress) throw new Error(`Missing fixture progress for ${ticket}.`);
  return progress;
}

function setReviewing(progress: TicketProgress, root: string): void {
  const baseSha = gitAt(root, "rev-parse", "HEAD");
  progress.execution = "reviewing";
  progress.owner = "controller";
  progress.baseSha = baseSha;
  progress.worktree = {
    workspace: root,
    branch: `tickets/0001-ticket-task-dispatch/${progress.id}`,
    baseSha,
  };
}

function pendingIntegration(commit = "a".repeat(40), merge = "b".repeat(40)): IntegrationRecord {
  return {
    commitSha: commit,
    mergeSha: merge,
    postMerge: { status: "pending", mergeSha: merge },
    integratedAt: "2026-11-16T00:00:00.000Z",
    integratedBy: "controller",
    files: [],
  };
}

function mockIntegrationGates(ledger: FeatureLedger, blockers: string[]) {
  vi.spyOn(LedgerRepository.prototype, "readLedger").mockReturnValue(ledger);
  vi.spyOn(GitEvidence.prototype, "commitIdentity").mockReturnValue({
    headSha: "c".repeat(40),
  });
  return vi.spyOn(AcceptancePolicy.prototype, "acceptBlockers").mockReturnValue(blockers);
}

function integrateFixtureTicket(
  root: string,
  spec: string,
  ticket: string,
  prepare?: (service: TicketIntegrationService) => void,
) {
  return execute(root, (services) => {
    prepare?.(services.ticketIntegrationService);
    return services.ticketIntegrationService.integrate({ spec, ticket, author: "controller" });
  });
}

interface IntegrationServiceSeam {
  run(root: string, args: string[]): string;
  assertCanonical(root: string, feature: FeaturePaths): void;
  assertNoOperation(root: string, allowMerge?: boolean): void;
  assertNoHooks(root: string): void;
  assertClean(root: string, feature: FeaturePaths): void;
  assertAncestor(root: string, ancestor: string, descendant: string, message: string): void;
  isAncestor(root: string, ancestor: string, descendant: string): boolean;
  assertMergePreflight(
    root: string,
    featureHead: string,
    ticketHead: string,
    files: string[],
    workspace: string,
  ): void;
  assertNoIgnoredCollisions(root: string, journal: object): void;
  assertIndexMatchesReview(root: string, journal: object): void;
  assertMergeCommit(root: string, journal: object, mergeSha: string): void;
  acceptedEvidence(
    feature: FeaturePaths,
    progress: TicketProgress,
    identity: CommitIdentity,
  ): AcceptedEvidence;
}

function allowSuccessfulIntegration(
  service: TicketIntegrationService,
  root: string,
  ticketCommit: string,
) {
  const seam = service as unknown as IntegrationServiceSeam;
  const featureHead = gitAt(root, "rev-parse", "--verify", "HEAD");
  const commonDirectory = gitAt(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
  const mergeCommit = "9".repeat(40);
  let mergeStarted = false;
  let mergeCommitted = false;

  vi.spyOn(seam, "assertCanonical").mockImplementation(() => {});
  vi.spyOn(seam, "assertNoOperation").mockImplementation(() => {});
  vi.spyOn(seam, "assertNoHooks").mockImplementation(() => {});
  vi.spyOn(seam, "assertClean").mockImplementation(() => {});
  vi.spyOn(seam, "assertAncestor").mockImplementation(() => {});
  vi.spyOn(seam, "isAncestor").mockReturnValue(false);
  vi.spyOn(seam, "assertMergePreflight").mockImplementation(() => {});
  vi.spyOn(seam, "assertNoIgnoredCollisions").mockImplementation(() => {});
  vi.spyOn(seam, "assertIndexMatchesReview").mockImplementation(() => {});
  vi.spyOn(seam, "assertMergeCommit").mockImplementation(() => {});
  vi.spyOn(seam, "acceptedEvidence").mockImplementation((_feature, _progress, identity) => ({
    commitSha: identity.headSha,
    files: [],
  }));
  vi.spyOn(seam, "run").mockImplementation((_root, args) => {
    if (
      args[0] === "rev-parse" &&
      args[1] === "--path-format=absolute" &&
      args[2] === "--git-common-dir"
    ) {
      return commonDirectory;
    }
    if (args[0] === "-c" && args.includes("merge")) {
      mergeStarted = true;
      return "";
    }
    if (args[0] === "rev-parse" && args[1] === "--verify" && args[2] === "MERGE_HEAD") {
      if (!mergeStarted) throw new Error("The integration seam did not reach the merge boundary.");
      return ticketCommit;
    }
    if (args[0] === "rev-parse" && args[1] === "--verify" && args[2] === "HEAD") {
      return mergeCommitted ? mergeCommit : featureHead;
    }
    if (args[0] === "commit") {
      if (!mergeStarted)
        throw new Error("The integration seam committed before the merge boundary.");
      mergeCommitted = true;
      return "";
    }
    throw new Error(`Unexpected integration Git command: ${args.join(" ")}`);
  });

  vi.spyOn(GitEvidence.prototype, "ticketWorkspace").mockReturnValue(root);
  vi.spyOn(GitEvidence.prototype, "assertTicketCodeCommitted").mockImplementation(() => {});
  vi.spyOn(GitEvidence.prototype, "assertCommittedRequirements").mockImplementation(() => {});
  vi.spyOn(GitEvidence.prototype, "assertTicketRequirementsCurrent").mockImplementation(() => {});
  vi.spyOn(GitEvidence.prototype, "changedPaths").mockReturnValue([]);
  vi.spyOn(ReportEvidence.prototype, "assertAcceptedReportsCurrent").mockImplementation(() => {});
  vi.spyOn(WorkflowRecordsCommitter.prototype, "commit").mockReturnValue(undefined);

  return {
    mergeCommit,
    mergeWasStubbed: () => mergeStarted && mergeCommitted,
  };
}

test("the T-0005 bootstrap reaches normal acceptance only with T-0004 as the sole pending integration", async () => {
  const { root, spec, ledger } = await integrationGateFixture();
  const prior = progressFor(ledger, "T-0004");
  prior.execution = "integrated";
  prior.status = "open";
  prior.tasks = [];
  prior.integration = pendingIntegration();
  const bootstrap = progressFor(ledger, "T-0005");
  setReviewing(bootstrap, root);
  const unrelated = progressFor(ledger, "T-0001");
  setReviewing(unrelated, root);
  const acceptance = mockIntegrationGates(ledger, ["Required current check is missing."]);

  const authorized = await integrateFixtureTicket(root, spec, "T-0005");
  expect(authorized.status).not.toBe(0);
  expect(authorized.stderr).toContain("Ticket review or checks are not current");
  expect(authorized.stderr).toContain("Required current check is missing.");
  expect(acceptance).toHaveBeenCalledTimes(1);
  expect(prior.tasks).toEqual([]);
  expect(prior.integration?.postMerge?.status).toBe("pending");

  const wrongTicket = await integrateFixtureTicket(root, spec, "T-0001");
  expect(wrongTicket.status).not.toBe(0);
  expect(wrongTicket.stderr).toMatch(/post-merge validation is pending or failed.*T-0004/i);
  expect(acceptance).toHaveBeenCalledTimes(1);

  const additional = progressFor(ledger, "T-0002");
  additional.integration = pendingIntegration("d".repeat(40), "e".repeat(40));
  const multiplePending = await integrateFixtureTicket(root, spec, "T-0005");
  expect(multiplePending.status).not.toBe(0);
  expect(multiplePending.stderr).toMatch(
    /post-merge validation is pending or failed.*T-0002, T-0004/i,
  );
  expect(acceptance).toHaveBeenCalledTimes(1);
});

test("the allowed T-0005 bootstrap preserves T-0004 pending integration and accepted history", async () => {
  const { root, spec, ledger } = await integrationGateFixture();
  const prior = progressFor(ledger, "T-0004");
  prior.execution = "integrated";
  prior.status = "open";
  prior.tasks = [];
  prior.integration = pendingIntegration();
  const historicalMergeSha = "5".repeat(40);
  const historicalIntegration = pendingIntegration("4".repeat(40), historicalMergeSha);
  historicalIntegration.postMerge = {
    status: "passed",
    mergeSha: historicalMergeSha,
    checks: { required: [], records: [] },
  };
  prior.integrationHistory = [historicalIntegration];
  prior.acceptedEvidence = {
    commitSha: historicalIntegration.commitSha,
    files: ["previously-accepted.ts"],
  };
  const integrationBefore = structuredClone(prior.integration);
  const historyBefore = structuredClone(prior.integrationHistory);
  const evidenceBefore = structuredClone(prior.acceptedEvidence);
  setReviewing(progressFor(ledger, "T-0005"), root);
  const acceptance = mockIntegrationGates(ledger, []);
  let seam: ReturnType<typeof allowSuccessfulIntegration> | undefined;

  const integrated = await integrateFixtureTicket(root, spec, "T-0005", (service) => {
    seam = allowSuccessfulIntegration(service, root, "c".repeat(40));
  });

  expect(integrated.status, integrated.stderr).toBe(0);
  expect(JSON.parse(integrated.stdout)).toMatchObject({
    ticket: "T-0005",
    ticketCommit: "c".repeat(40),
    mergeCommit: seam?.mergeCommit,
    postMerge: "pending",
  });
  expect(seam?.mergeWasStubbed()).toBe(true);
  expect(acceptance).toHaveBeenCalledTimes(2);
  expect(prior.tasks).toEqual([]);
  expect(prior.integration).toEqual(integrationBefore);
  expect(prior.integrationHistory).toEqual(historyBefore);
  expect(prior.acceptedEvidence).toEqual(evidenceBefore);
  const persistedPrior = progressFor(
    JSON.parse(readFileSync(join(dirname(spec), "sdd.json"), "utf8")) as FeatureLedger,
    "T-0004",
  );
  expect(persistedPrior.integration).toEqual(integrationBefore);
  expect(persistedPrior.integrationHistory).toEqual(historyBefore);
  expect(persistedPrior.acceptedEvidence).toEqual(evidenceBefore);
});

test("the T-0005 bootstrap rejects a different feature", async () => {
  const { root, spec, ledger } = await integrationGateFixture("Unrelated Feature");
  const prior = progressFor(ledger, "T-0004");
  prior.execution = "integrated";
  prior.status = "open";
  prior.tasks = [];
  prior.integration = pendingIntegration();
  setReviewing(progressFor(ledger, "T-0005"), root);
  const acceptance = mockIntegrationGates(ledger, []);

  const rejected = await integrateFixtureTicket(root, spec, "T-0005");
  expect(rejected.status).not.toBe(0);
  expect(rejected.stderr).toMatch(/post-merge validation is pending or failed.*T-0004/i);
  expect(acceptance).not.toHaveBeenCalled();
});

function seedValidatedCorrection(ledger: FeatureLedger, root: string): TicketProgress {
  const target = progressFor(ledger, "T-0004");
  const recovery = progressFor(ledger, "T-0005");
  const prior = pendingIntegration();
  const exceptionId = "exception-0001";
  const assignmentId = "assignment-0001";
  const objective = "Correct the approved T-0004 behavior.";
  const mergeSha = "f".repeat(40);
  const required = {
    command: "fresh T-0005 check",
    addedAt: "2026-11-16T00:00:00.000Z",
    addedBy: "controller",
  };
  recovery.status = "closed";
  recovery.execution = "integrated";
  recovery.integration = {
    commitSha: "e".repeat(40),
    mergeSha,
    postMerge: {
      status: "passed",
      mergeSha,
      checks: {
        required: [required],
        records: [
          {
            command: required.command,
            result: "passed",
            author: "controller",
            headSha: mergeSha,
            recordedAt: "2026-11-16T00:00:00.000Z",
          },
        ],
      },
    },
    integratedAt: "2026-11-16T00:00:00.000Z",
    integratedBy: "controller",
    files: [],
  };

  const assignment: ImplementationAssignment = {
    id: assignmentId,
    role: "implementation",
    action: "correct",
    controller: "controller",
    report: join(root, ".spindle/features/0001-ticket-task-dispatch/reports/T-0004-fix.md"),
    requestedAt: "2026-11-16T00:00:00.000Z",
    status: "submitted",
    attempt: 1,
    findingIds: [],
    objective,
    approvedExceptionId: exceptionId,
    handoffs: [],
  };
  const exception: ApprovedTaskPlanException = {
    id: exceptionId,
    feature: APPROVED_TASK_PLAN_EXCEPTION.feature,
    ticket: APPROVED_TASK_PLAN_EXCEPTION.ticket,
    recoveryTicket: APPROVED_TASK_PLAN_EXCEPTION.recoveryTicket,
    scope: APPROVED_TASK_PLAN_EXCEPTION.scope,
    approval: {
      author: APPROVED_TASK_PLAN_EXCEPTION.approvalAuthor,
      date: APPROVED_TASK_PLAN_EXCEPTION.approvalDate,
      commentAt: APPROVED_TASK_PLAN_EXCEPTION.approvalCommentAt,
      quote: APPROVED_TASK_PLAN_EXCEPTION.approvalQuote,
      comment: APPROVED_TASK_PLAN_EXCEPTION.approvalComment,
      source: APPROVED_TASK_PLAN_EXCEPTION.approvalSource,
    },
    controller: "controller",
    recordedAt: "2026-11-16T00:00:00.000Z",
    objective,
    assignmentId,
    attempt: 1,
    priorIntegration: prior,
    priorAcceptedEvidence: { commitSha: prior.commitSha, files: [] },
  };
  const attempt: CorrectionAttempt = {
    number: 1,
    findingIds: [],
    objective,
    approvedExceptionId: exceptionId,
    startedAt: "2026-11-16T00:00:00.000Z",
    startedBy: "controller",
    assignmentId,
    assignment,
  };
  target.status = "open";
  target.execution = "reviewing";
  target.tasks = [];
  target.integration = undefined;
  target.integrationHistory = [prior];
  target.taskPlanException = exception;
  target.assignment = assignment;
  target.correctionAttempts = [attempt];
  setReviewing(target, root);
  return target;
}

test("exception-linked T-0004 integration requires a valid exception, validated T-0005, and current acceptance evidence", async () => {
  const { root, spec, ledger } = await integrationGateFixture();
  const target = seedValidatedCorrection(ledger, root);
  const recovery = progressFor(ledger, "T-0005");
  const acceptance = mockIntegrationGates(ledger, []);

  for (const blocker of [
    "Required check 'ticket test' has no current passing record.",
    "Required check 'ticket test' is stale.",
    "Independent corrective review coverage is missing.",
    "Independent corrective review evidence is stale.",
  ]) {
    acceptance.mockReturnValue([blocker]);
    const gated = await integrateFixtureTicket(root, spec, "T-0004");
    expect(gated.status).not.toBe(0);
    expect(gated.stderr).toContain("Ticket review or checks are not current");
    expect(gated.stderr).toContain(blocker);
  }
  expect(acceptance).toHaveBeenCalledTimes(4);

  target.taskPlanException = undefined;
  const absent = await integrateFixtureTicket(root, spec, "T-0004");
  expect(absent.status).not.toBe(0);
  expect(absent.stderr).toMatch(/post-merge validation is pending or failed.*T-0004/i);

  const invalidTarget = seedValidatedCorrection(ledger, root);
  if (!invalidTarget.assignment) throw new Error("Missing corrective assignment in fixture.");
  invalidTarget.assignment.approvedExceptionId = "unlinked-exception";
  const invalid = await integrateFixtureTicket(root, spec, "T-0004");
  expect(invalid.status).not.toBe(0);
  expect(invalid.stderr).toMatch(/post-merge validation is pending or failed.*T-0004/i);

  recovery.integration!.postMerge!.status = "pending";
  const unvalidated = await integrateFixtureTicket(root, spec, "T-0004");
  expect(unvalidated.status).not.toBe(0);
  expect(unvalidated.stderr).toMatch(/post-merge validation is pending or failed.*T-0004/i);
  expect(acceptance).toHaveBeenCalledTimes(4);
});

test("the allowed exception-linked correction preserves T-0004 prior integration and evidence", async () => {
  const { root, spec, ledger } = await integrationGateFixture();
  const target = seedValidatedCorrection(ledger, root);
  const historyBefore = structuredClone(target.integrationHistory);
  const exceptionBefore = structuredClone(target.taskPlanException);
  const acceptance = mockIntegrationGates(ledger, []);
  let seam: ReturnType<typeof allowSuccessfulIntegration> | undefined;

  const integrated = await integrateFixtureTicket(root, spec, "T-0004", (service) => {
    seam = allowSuccessfulIntegration(service, root, "c".repeat(40));
  });

  expect(integrated.status, integrated.stderr).toBe(0);
  expect(JSON.parse(integrated.stdout)).toMatchObject({
    ticket: "T-0004",
    ticketCommit: "c".repeat(40),
    mergeCommit: seam?.mergeCommit,
    postMerge: "pending",
  });
  expect(seam?.mergeWasStubbed()).toBe(true);
  expect(acceptance).toHaveBeenCalledTimes(2);
  expect(target.integrationHistory).toEqual(historyBefore);
  expect(target.taskPlanException).toEqual(exceptionBefore);
  expect(target.taskPlanException?.priorIntegration).toEqual(historyBefore?.at(-1));
  expect(target.taskPlanException?.priorAcceptedEvidence).toEqual({
    commitSha: historyBefore?.at(-1)?.commitSha,
    files: [],
  });
  expect(target.integration?.postMerge?.status).toBe("pending");
  const persistedTarget = progressFor(
    JSON.parse(readFileSync(join(dirname(spec), "sdd.json"), "utf8")) as FeatureLedger,
    "T-0004",
  );
  expect(persistedTarget.integrationHistory).toEqual(historyBefore);
  expect(persistedTarget.taskPlanException).toEqual(exceptionBefore);
  expect(persistedTarget.taskPlanException?.priorAcceptedEvidence).toEqual(
    exceptionBefore?.priorAcceptedEvidence,
  );
});

test("the exception-linked correction guard rejects a different ticket", async () => {
  const { root, spec, ledger } = await integrationGateFixture();
  seedValidatedCorrection(ledger, root);
  setReviewing(progressFor(ledger, "T-0003"), root);
  const acceptance = mockIntegrationGates(ledger, []);

  const rejected = await integrateFixtureTicket(root, spec, "T-0003");

  expect(rejected.status).not.toBe(0);
  expect(rejected.stderr).toMatch(/post-merge validation is pending or failed.*T-0004/i);
  expect(acceptance).not.toHaveBeenCalled();
});

test("the exception-linked correction guard rejects a different feature", async () => {
  const { root, spec, ledger } = await integrationGateFixture("Unrelated Feature");
  seedValidatedCorrection(ledger, root);
  const acceptance = mockIntegrationGates(ledger, []);

  const rejected = await integrateFixtureTicket(root, spec, "T-0004");

  expect(rejected.status).not.toBe(0);
  expect(rejected.stderr).toMatch(/post-merge validation is pending or failed.*T-0004/i);
  expect(acceptance).not.toHaveBeenCalled();
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
  await acceptTaskPlan(root, spec, "T-0002");
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

test.each(["modified", "deleted"] as const)(
  "ticket integration rejects an accepted task report that was %s",
  async (change) => {
    const { root, spec } = await acceptedTicket();
    const ledgerPath = join(dirname(spec), "sdd.json");
    const before = JSON.parse(readFileSync(ledgerPath, "utf8"));
    const task = before.tickets[0].tasks[0];
    const report = task.assignment.report as string;
    if (change === "modified") writeFileSync(report, "# Changed task report\n");
    else rmSync(report);

    const result = await integrate(root, spec);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(
      change === "modified"
        ? /Task TASK-0001 report changed after acceptance; accepted report integrity failed/i
        : /Task TASK-0001 report is missing; accepted report integrity cannot be verified/i,
    );
    const after = JSON.parse(readFileSync(ledgerPath, "utf8"));
    expect(after.tickets[0].execution).toBe("reviewing");
    expect(after.tickets[0].integration).toBeUndefined();
    expect(after.tickets[0].tasks[0].status).toBe("accepted");
  },
);
