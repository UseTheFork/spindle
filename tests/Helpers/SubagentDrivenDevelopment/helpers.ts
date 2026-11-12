import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { expect, onTestFinished, vi } from "vitest";

import { LoadProjectConfiguration } from "@/Foundation/Bootstrap/LoadProjectConfiguration";

import { applicationFixture } from "../ApplicationFixture.ts";
import { makeTempDirSync, repoRoot } from "../TemporaryDirectories.ts";
import { workflowServices, type WorkflowServices } from "./WorkflowServices";

vi.setConfig({ testTimeout: 30_000 });

export function fixture() {
  const directory = makeTempDirSync("spindle-sdd-workflow-test-");
  const repo = join(directory, "checkout");
  mkdirSync(repo);
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
  git("init", "-q");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  mkdirSync(join(repo, ".github"), { recursive: true });
  writeFileSync(
    join(repo, ".github", "spindle.json"),
    `${JSON.stringify({ stacks: ["python"], spindle_package_manager: "pnpm" }, null, 2)}\n`,
  );
  writeFileSync(join(repo, "tracked.txt"), "base\n");
  git("add", ".");
  git("commit", "-qm", "base");
  return { repo, git };
}

export async function serviceFixture() {
  const workspace = fixture();
  const app = applicationFixture(workspace.repo, join(repoRoot, "src/Assets/Blueprints"));
  await new LoadProjectConfiguration().bootstrap(app);
  await app.boot();
  const service = await workflowServices(app);
  return { ...workspace, service, app };
}

export async function execute(repo: string, run: (service: WorkflowServices) => unknown) {
  const app = applicationFixture(repo, join(repoRoot, "src/Assets/Blueprints"));
  await new LoadProjectConfiguration().bootstrap(app);
  await app.boot();
  const command = await workflowServices(app);
  try {
    const result = await run(command);
    return { status: 0, stdout: JSON.stringify(result, null, 2), stderr: "" };
  } catch (error) {
    return {
      status: 1,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
    };
  }
}

export function cliOutput(result: { status: number | null; stdout: string; stderr: string }) {
  expect(result.status, result.stderr).toBe(0);
  const envelope = JSON.parse(result.stdout);
  expect(envelope).toMatchObject({ ok: true, data: expect.any(Object) });
  return envelope.data;
}

export function invokeAsync(
  repo: string,
  args: string[],
  options: { preload?: string; killOnOutput?: string; env?: Record<string, string> } = {},
) {
  const command = join(repoRoot, "src", "index.ts");
  return new Promise<{
    status: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
  }>((resolveResult, reject) => {
    const childArgs = ["--import", import.meta.resolve("tsx")];
    if (options.preload) childArgs.push("--import", options.preload);
    childArgs.push(command, "--json", "sdd", ...args);
    const child = spawn(process.execPath, childArgs, {
      cwd: repo,
      env: {
        ...process.env,
        TSX_TSCONFIG_PATH: join(repoRoot, "tsconfig.json"),
        FORCE_COLOR: "0",
        ...options.env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`SDD subprocess timed out after 20000ms: ${args.join(" ")}`));
    }, 20_000);
    onTestFinished(async () => {
      clearTimeout(timer);
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill("SIGKILL");
      await new Promise<void>((resolve) => {
        const finish = () => {
          clearTimeout(cleanupTimer);
          child.off("close", finish);
          resolve();
        };
        const cleanupTimer = setTimeout(finish, 1_000);
        child.once("close", finish);
      });
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
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (status, signal) => {
      clearTimeout(timer);
      resolveResult({ status, signal, stdout, stderr });
    });
  });
}

export function commitAll(repo: string, git: (...args: string[]) => string, message: string) {
  git("add", "-A");
  git("commit", "-qm", message);
}

export function commitTicketWorkspace(workspace: string, message: string) {
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: workspace, encoding: "utf8" }).trim();
  git("add", "-A");
  if (git("status", "--porcelain=v1", "--untracked-files=all")) {
    git("commit", "-qm", message);
  }
}

export async function prepareReadyTicket(
  options: { requireRetrospective?: boolean; ticketCount?: number } = {},
) {
  const { repo: originalRepo } = fixture();
  const created = await execute(originalRepo, (service) =>
    service.featureCreationService.create({
      title: "Ticket flow",
      author: "maintainer",
      ...(options.requireRetrospective ? { requireRetrospective: true } : {}),
    }),
  );
  expect(created.status, created.stderr).toBe(0);
  const initialFeature = JSON.parse(created.stdout) as { spec: string };
  const featureParent = join(dirname(originalRepo), "feature-worktrees");
  mkdirSync(featureParent);
  const started = await execute(originalRepo, (service) =>
    service.featureWorktreeService.start({
      spec: initialFeature.spec,
      workspace: featureParent,
      confirmRecords: true,
    }),
  );
  expect(started.status, started.stderr).toBe(0);
  const start = JSON.parse(started.stdout) as { spec: string; featureWorkspace: string };
  const repo = start.featureWorkspace;
  const spec = start.spec;
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
  const worktreeParent = join(dirname(originalRepo), "ticket-workspaces");
  mkdirSync(worktreeParent);

  for (let index = 1; index <= (options.ticketCount ?? 1); index++) {
    const ticketId = `T-${String(index).padStart(4, "0")}`;
    const ticket = await execute(repo, (service) =>
      service.ticketService.ticketCreate({
        spec,
        title: `Implement the flow ${index}`,
        reporter: "requester",
        category: "enhancement",
        author: "maintainer",
      }),
    );
    expect(ticket.status, ticket.stderr).toBe(0);
    const updated = await execute(repo, (service) =>
      service.ticketService.ticketUpdate({
        spec,
        ticket: ticketId,
        status: "open",
        author: "maintainer",
      }),
    );
    expect(updated.status, updated.stderr).toBe(0);
  }
  commitAll(repo, git, "prepare ticket");
  const baseSha = git("rev-parse", "HEAD");
  return { repo, git, spec, baseSha, originalRepo, worktreeParent };
}

export async function prepareImplementationForReview(
  options: {
    requireRetrospective?: boolean;
    ticketCount?: number;
    ticketId?: string;
    file?: string;
  } = {},
) {
  const { repo, git, spec, worktreeParent, originalRepo } = await prepareReadyTicket(options);
  const ticketId = options.ticketId ?? "T-0001";
  const file = options.file ?? "feature.ts";
  const command = "just test::test tests/feature.test.ts";
  const required = await execute(repo, (service) =>
    service.checksService.checksRequire({ spec, ticket: ticketId, command, author: "controller" }),
  );
  expect(required.status, required.stderr).toBe(0);
  commitAll(repo, git, "declare required check");

  const implemented = await execute(repo, (service) =>
    service.assignmentService.implement({
      spec,
      ticket: ticketId,
      author: "controller",
      workspace: worktreeParent,
      confirmRecords: true,
    }),
  );
  expect(implemented.status, implemented.stderr).toBe(0);
  const implementation = JSON.parse(implemented.stdout) as {
    assignment: { report: string; workspace: string };
  };
  writeFileSync(
    join(implementation.assignment.workspace, file),
    `export const feature = ${JSON.stringify(ticketId)};\n`,
  );
  commitTicketWorkspace(implementation.assignment.workspace, `implement ${ticketId}`);
  writeFileSync(implementation.assignment.report, "# Implementation report\n\nCompleted.\n");
  const submitted = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: ticketId,
      role: "implementation",
      report: implementation.assignment.report,
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);
  return {
    repo,
    originalRepo,
    git,
    spec,
    worktreeParent,
    ticketId,
    file,
    ticketWorkspace: implementation.assignment.workspace,
    command,
    report: implementation.assignment.report,
    submission: JSON.parse(submitted.stdout) as {
      snapshot: string;
      codeSnapshot: string;
      requirementsSnapshot: string;
    },
  };
}

export async function recordReviewCheck(
  repo: string,
  spec: string,
  command: string,
  snapshot: string,
  result: "passed" | "failed",
  ticketId = "T-0001",
) {
  return await execute(repo, (service) =>
    service.checksService.checksRecord({
      spec,
      ticket: ticketId,
      snapshot,
      command,
      result,
      ...(result === "failed" ? { details: "The required check failed." } : {}),
      author: "controller",
    }),
  );
}

export async function recordDeliveryCheck(
  repo: string,
  spec: string,
  command = "just test::test tests/whole-feature.test.ts",
) {
  const status = await execute(repo, (service) =>
    service.featureInspectionService.status({ spec }),
  );
  expect(status.status, status.stderr).toBe(0);
  const delivery = JSON.parse(status.stdout).delivery as {
    snapshot?: string;
    requiredChecks: { command: string; removedAt?: string }[];
  };
  let snapshot = delivery.snapshot;
  if (!delivery.requiredChecks.some((check) => check.command === command && !check.removedAt)) {
    const required = await execute(repo, (service) =>
      service.checksService.checksRequire({
        ticket: "",
        spec,
        scope: "delivery",
        command,
        author: "controller",
      }),
    );
    expect(required.status, required.stderr).toBe(0);
    snapshot = JSON.parse(required.stdout).snapshot as string;
  }
  if (!snapshot) throw new Error("Feature status did not include a delivery snapshot.");
  const recorded = await execute(repo, (service) =>
    service.checksService.checksRecord({
      ticket: "",
      spec,
      scope: "delivery",
      snapshot,
      command,
      result: "passed",
      author: "controller",
    }),
  );
  expect(recorded.status, recorded.stderr).toBe(0);
}

export async function prepareReviewAssignment(
  options: {
    requireRetrospective?: boolean;
    ticketCount?: number;
    ticketId?: string;
    file?: string;
  } = {},
) {
  const prepared = await prepareImplementationForReview(options);
  const passingCheck = await recordReviewCheck(
    prepared.repo,
    prepared.spec,
    prepared.command,
    prepared.submission.snapshot,
    "passed",
    prepared.ticketId,
  );
  expect(passingCheck.status, passingCheck.stderr).toBe(0);
  const dispatched = await execute(prepared.repo, (service) =>
    service.reviewService.review({
      spec: prepared.spec,
      ticket: prepared.ticketId,
      inventory: JSON.stringify([prepared.file]),
      author: "controller",
    }),
  );
  expect(dispatched.status, dispatched.stderr).toBe(0);
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

export async function prepareReviewedTicket(
  options: {
    requireRetrospective?: boolean;
    ticketCount?: number;
    ticketId?: string;
    file?: string;
  } = {},
) {
  const prepared = await prepareReviewAssignment(options);
  writeFileSync(prepared.assignment.report, "# Review report\n\nNo defects found.\n");
  const submitted = await execute(prepared.repo, (service) =>
    service.submissionService.submit({
      spec: prepared.spec,
      ticket: prepared.ticketId,
      role: "review",
      assignment: prepared.assignment.id,
      report: prepared.assignment.report,
      result: "passed",
      noFindings: true,
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);
  return prepared;
}

export async function integrateReviewedTicket(
  prepared: Awaited<ReturnType<typeof prepareReviewedTicket>>,
  postMerge = false,
) {
  const ticketGit = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: prepared.ticketWorkspace,
      encoding: "utf8",
    }).trim();
  ticketGit("add", "-A");
  const pending = ticketGit("status", "--porcelain=v1", "--untracked-files=all");
  if (pending) ticketGit("commit", "-qm", `implement ${prepared.ticketId}`);
  const integrated = await execute(prepared.repo, (service) =>
    service.ticketIntegrationService.integrate({
      spec: prepared.spec,
      ticket: prepared.ticketId,
      author: "controller",
      confirmRecords: true,
    }),
  );
  expect(integrated.status, integrated.stderr).toBe(0);
  const result = JSON.parse(integrated.stdout) as { mergeCommit: string };

  if (postMerge) {
    const command = "fixture post-merge validation";
    const required = await execute(prepared.repo, (service) =>
      service.checksService.checksRequire({
        spec: prepared.spec,
        ticket: prepared.ticketId,
        scope: "post-merge",
        command,
        author: "controller",
      }),
    );
    expect(required.status, required.stderr).toBe(0);
    const recorded = await execute(prepared.repo, (service) =>
      service.checksService.checksRecord({
        spec: prepared.spec,
        ticket: prepared.ticketId,
        scope: "post-merge",
        snapshot: JSON.parse(required.stdout).snapshot,
        command,
        result: "passed",
        author: "controller",
      }),
    );
    expect(recorded.status, recorded.stderr).toBe(0);
  }
  return result;
}

export async function prepareIntegratedTicket(
  options: {
    requireRetrospective?: boolean;
    ticketCount?: number;
    ticketId?: string;
    file?: string;
  } = {},
) {
  const prepared = await prepareReviewedTicket(options);
  await integrateReviewedTicket(prepared, true);
  return prepared;
}

export async function prepareDeliveryReady(requireRetrospective = false) {
  const prepared = await prepareIntegratedTicket({ requireRetrospective });

  const command = "just test::test tests/whole-feature.test.ts";
  await recordDeliveryCheck(prepared.repo, prepared.spec, command);

  const review = await execute(prepared.repo, (service) =>
    service.reviewService.review({
      spec: prepared.spec,
      scope: "delivery",
      inventory: JSON.stringify(["feature.ts"]),
      author: "controller",
    }),
  );
  expect(review.status, review.stderr).toBe(0);
  const assignment = JSON.parse(review.stdout).assignments[0] as {
    id: string;
    report: string;
  };
  writeFileSync(assignment.report, "# Whole-feature review\n\nNo findings.\n");
  const submitted = await execute(prepared.repo, (service) =>
    service.submissionService.submit({
      ticket: "",
      spec: prepared.spec,
      scope: "delivery",
      role: "review",
      assignment: assignment.id,
      report: assignment.report,
      result: "passed",
      noFindings: true,
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);
  return { ...prepared, deliveryCheck: command };
}

type PendingFeatureFinalization = {
  feature: string;
  finalValidation: "pending";
  cleanup: "retained";
  mergeCommit: string;
  snapshot: string;
  originalWorkspace: string;
  originalSpec: string;
  journal: string;
};

export async function beginDeliveryFinalization(
  prepared: { repo: string; spec: string },
  options: { report?: string } = {},
): Promise<PendingFeatureFinalization> {
  const started = await execute(prepared.repo, (service) =>
    service.deliveryService.finish({
      spec: prepared.spec,
      author: "controller",
      confirmRecords: true,
      ...(options.report ? { report: options.report } : {}),
    }),
  );
  expect(started.status, started.stderr).toBe(0);
  const pending = JSON.parse(started.stdout) as PendingFeatureFinalization;
  expect(pending).toMatchObject({
    finalValidation: "pending",
    cleanup: "retained",
  });
  return pending;
}

export async function declareFinalDeliveryChecks(
  pending: PendingFeatureFinalization,
  commands: string[],
) {
  const declared = await invokeAsync(pending.originalWorkspace, [
    "checks",
    "require",
    "--spec",
    pending.originalSpec,
    "--scope",
    "final",
    ...commands.flatMap((command) => ["--command", command]),
    "--author",
    "controller",
  ]);
  expect(declared.status, declared.stderr).toBe(0);
  return declared;
}

export async function recordFinalDeliveryCheck(
  pending: PendingFeatureFinalization,
  command: string,
  result: "passed" | "failed" | "unavailable" = "passed",
  details?: string,
) {
  const recorded = await invokeAsync(pending.originalWorkspace, [
    "checks",
    "record",
    "--spec",
    pending.originalSpec,
    "--scope",
    "final",
    "--merge",
    pending.mergeCommit,
    "--snapshot",
    pending.snapshot,
    "--command",
    command,
    "--result",
    result,
    ...(details ? ["--details", details] : []),
    "--author",
    "controller",
  ]);
  return recorded;
}

export async function completeDeliveryFinalization(pending: PendingFeatureFinalization) {
  return await invokeAsync(pending.originalWorkspace, [
    "finish",
    "--spec",
    pending.originalSpec,
    "--author",
    "controller",
  ]);
}

export async function finalizeDelivery(
  prepared: { repo: string; spec: string },
  options: { report?: string; finalChecks?: string[] } = {},
) {
  const pending = await beginDeliveryFinalization(prepared, options);
  const commands = options.finalChecks ?? ["fixture final delivery validation"];
  await declareFinalDeliveryChecks(pending, commands);
  for (const command of commands) {
    const recorded = await recordFinalDeliveryCheck(pending, command);
    expect(recorded.status, recorded.stderr).toBe(0);
  }
  const completed = await completeDeliveryFinalization(pending);
  expect(completed.status, completed.stderr).toBe(0);
  const envelope = JSON.parse(completed.stdout) as {
    ok: boolean;
    data?: Record<string, unknown>;
  };
  expect(envelope).toMatchObject({ ok: true, data: expect.any(Object) });
  return {
    pending,
    completed: envelope.data!,
  };
}

export async function refreshReviewCheck(repo: string, spec: string, command: string) {
  const status = await execute(repo, (service) =>
    service.featureInspectionService.status({ spec }),
  );
  expect(status.status, status.stderr).toBe(0);
  const snapshot = JSON.parse(status.stdout).snapshots[0].snapshot as string;
  return await recordReviewCheck(repo, spec, command, snapshot, "passed");
}
