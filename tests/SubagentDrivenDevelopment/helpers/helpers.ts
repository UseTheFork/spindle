import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, onTestFinished, vi } from "vitest";

import { LoadProjectConfiguration } from "@/Foundation/Bootstrap/LoadProjectConfiguration";

import { applicationFixture } from "../../helpers/ApplicationFixture.ts";
import { makeTempDirSync, repoRoot } from "../../helpers/TemporaryDirectories.ts";
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
    childArgs.push(command, "sdd", ...args);
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

export async function prepareClaimableTicket(
  options: { requireRetrospective?: boolean; ticketCount?: number } = {},
) {
  const { repo, git } = fixture();
  const created = await execute(repo, (service) =>
    service.featureCreationService.create({
      title: "Claim flow",
      author: "maintainer",
      ...(options.requireRetrospective ? { requireRetrospective: true } : {}),
    }),
  );
  expect(created.status, created.stderr).toBe(0);
  const feature = JSON.parse(created.stdout) as { spec: string };
  commitAll(repo, git, "create feature");

  for (let index = 1; index <= (options.ticketCount ?? 1); index++) {
    const ticketId = `T-${String(index).padStart(4, "0")}`;
    const ticket = await execute(repo, (service) =>
      service.ticketService.ticketCreate({
        spec: feature.spec,
        title: `Implement the flow ${index}`,
        reporter: "requester",
        category: "enhancement",
        author: "maintainer",
      }),
    );
    expect(ticket.status, ticket.stderr).toBe(0);
    const updated = await execute(repo, (service) =>
      service.ticketService.ticketUpdate({
        spec: feature.spec,
        ticket: ticketId,
        status: "open",
        author: "maintainer",
      }),
    );
    expect(updated.status, updated.stderr).toBe(0);
  }
  commitAll(repo, git, "prepare ticket");
  const baseSha = git("rev-parse", "HEAD");
  return { repo, git, spec: feature.spec, baseSha };
}

export async function prepareImplementationForReview(
  options: {
    requireRetrospective?: boolean;
    ticketCount?: number;
    ticketId?: string;
    file?: string;
  } = {},
) {
  const { repo, git, spec } = await prepareClaimableTicket(options);
  const ticketId = options.ticketId ?? "T-0001";
  const file = options.file ?? "feature.ts";
  const command = "just test::test tests/feature.test.ts";
  const required = await execute(repo, (service) =>
    service.checksService.checksRequire({ spec, ticket: ticketId, command, author: "controller" }),
  );
  expect(required.status, required.stderr).toBe(0);
  commitAll(repo, git, "declare required check");

  const claimed = await execute(repo, (service) =>
    service.assignmentService.claim({ spec, ticket: ticketId, author: "controller" }),
  );
  expect(claimed.status, claimed.stderr).toBe(0);
  writeFileSync(join(repo, file), `export const feature = ${JSON.stringify(ticketId)};\n`);

  const implemented = await execute(repo, (service) =>
    service.assignmentService.implement({ spec, ticket: ticketId, author: "controller" }),
  );
  expect(implemented.status, implemented.stderr).toBe(0);
  const implementation = JSON.parse(implemented.stdout) as {
    assignment: { report: string };
  };
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
    git,
    spec,
    ticketId,
    file,
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

export async function prepareAcceptedTicket(
  options: {
    requireRetrospective?: boolean;
    ticketCount?: number;
    ticketId?: string;
    file?: string;
    close?: boolean;
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
  const accepted = await execute(prepared.repo, (service) =>
    service.integrationService.accept({
      spec: prepared.spec,
      ticket: prepared.ticketId,
      author: "controller",
    }),
  );
  expect(accepted.status, accepted.stderr).toBe(0);
  if (options.close) {
    for (let index = 1; index <= (options.ticketCount ?? 1); index += 1) {
      const ticket = `T-${String(index).padStart(4, "0")}`;
      const closed = await execute(prepared.repo, (service) =>
        service.ticketService.ticketUpdate({
          spec: prepared.spec,
          ticket,
          status: "closed",
          author: "controller",
        }),
      );
      expect(closed.status, closed.stderr).toBe(0);
    }
  }
  return prepared;
}

export async function prepareDeliveryReady(requireRetrospective = false) {
  const prepared = await prepareAcceptedTicket({ requireRetrospective, close: true });
  prepared.git("add", "feature.ts");
  prepared.git("commit", "-qm", "deliver accepted ticket");
  const integrated = await execute(prepared.repo, (service) =>
    service.integrationService.integrate({
      spec: prepared.spec,
      ticket: "T-0001",
      commit: prepared.git("rev-parse", "HEAD"),
      author: "controller",
    }),
  );
  expect(integrated.status, integrated.stderr).toBe(0);

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

export async function refreshReviewCheck(repo: string, spec: string, command: string) {
  const status = await execute(repo, (service) =>
    service.featureInspectionService.status({ spec }),
  );
  expect(status.status, status.stderr).toBe(0);
  const snapshot = JSON.parse(status.stdout).snapshots[0].snapshot as string;
  return await recordReviewCheck(repo, spec, command, snapshot, "passed");
}
