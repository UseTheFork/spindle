import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { expect, onTestFinished, vi } from "vitest";

import { SddCommand } from "@/commands/sdd/sdd-command";

import { applicationFixture } from "../application-fixture";

vi.setConfig({ testTimeout: 30_000 });

export function fixture() {
  const directory = mkdtempSync(join(process.cwd(), ".sdd-workflow-test-"));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
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
  const app = applicationFixture(workspace.repo, resolve("src/blueprints"));
  await app.boot();
  const service = await app.make(SddCommand);
  return { ...workspace, service };
}

export async function execute(repo: string, run: (service: SddCommand) => unknown) {
  const app = applicationFixture(repo, resolve(process.cwd(), "src/blueprints"));
  await app.boot();
  const command = await app.make(SddCommand);
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
      env: { ...process.env, TSX_TSCONFIG_PATH: resolve("tsconfig.json"), FORCE_COLOR: "0" },
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

export async function prepareClaimableIssue(
  options: { requireRetrospective?: boolean; issueCount?: number } = {},
) {
  const { repo, git } = fixture();
  const created = await execute(repo, (service) =>
    service.create({
      title: "Claim flow",
      author: "maintainer",
      ...(options.requireRetrospective ? { requireRetrospective: true } : {}),
    }),
  );
  expect(created.status, created.stderr).toBe(0);
  const feature = JSON.parse(created.stdout) as { spec: string };
  commitAll(repo, git, "create feature");

  for (let index = 1; index <= (options.issueCount ?? 1); index++) {
    const issueId = `I-${String(index).padStart(4, "0")}`;
    const issue = await execute(repo, (service) =>
      service.issueCreate({
        spec: feature.spec,
        title: `Implement the flow ${index}`,
        reporter: "requester",
        category: "enhancement",
        author: "maintainer",
      }),
    );
    expect(issue.status, issue.stderr).toBe(0);
    const triaged = await execute(repo, (service) =>
      service.triage({
        spec: feature.spec,
        issue: issueId,
        status: "ready-for-agent",
        category: "enhancement",
        details: "Requirements are complete.",
        author: "maintainer",
      }),
    );
    expect(triaged.status, triaged.stderr).toBe(0);
  }
  commitAll(repo, git, "prepare issue");
  const baseSha = git("rev-parse", "HEAD");
  return { repo, git, spec: feature.spec, baseSha };
}

export async function prepareImplementationForReview(
  options: {
    requireRetrospective?: boolean;
    issueCount?: number;
    issueId?: string;
    file?: string;
  } = {},
) {
  const { repo, git, spec } = await prepareClaimableIssue(options);
  const issueId = options.issueId ?? "I-0001";
  const file = options.file ?? "feature.ts";
  const command = "just test::test tests/feature.test.ts";
  const required = await execute(repo, (service) =>
    service.checksRequire({ spec, issue: issueId, command, author: "controller" }),
  );
  expect(required.status, required.stderr).toBe(0);
  commitAll(repo, git, "declare required check");

  const claimed = await execute(repo, (service) =>
    service.claim({ spec, issue: issueId, author: "controller" }),
  );
  expect(claimed.status, claimed.stderr).toBe(0);
  writeFileSync(join(repo, file), `export const feature = ${JSON.stringify(issueId)};\n`);

  const implemented = await execute(repo, (service) =>
    service.implement({ spec, issue: issueId, author: "controller" }),
  );
  expect(implemented.status, implemented.stderr).toBe(0);
  const implementation = JSON.parse(implemented.stdout) as {
    assignment: { report: string };
  };
  writeFileSync(implementation.assignment.report, "# Implementation report\n\nCompleted.\n");
  const submitted = await execute(repo, (service) =>
    service.submit({
      spec,
      issue: issueId,
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
    issueId,
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
  issueId = "I-0001",
) {
  return await execute(repo, (service) =>
    service.checksRecord({
      spec,
      issue: issueId,
      snapshot,
      command,
      result,
      ...(result === "failed" ? { details: "The required check failed." } : {}),
      author: "controller",
    }),
  );
}

export async function prepareReviewAssignment(
  options: {
    requireRetrospective?: boolean;
    issueCount?: number;
    issueId?: string;
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
    prepared.issueId,
  );
  expect(passingCheck.status, passingCheck.stderr).toBe(0);
  const dispatched = await execute(prepared.repo, (service) =>
    service.review({
      spec: prepared.spec,
      issue: prepared.issueId,
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

export async function prepareAcceptedIssue(
  options: {
    requireRetrospective?: boolean;
    issueCount?: number;
    issueId?: string;
    file?: string;
  } = {},
) {
  const prepared = await prepareReviewAssignment(options);
  writeFileSync(prepared.assignment.report, "# Review report\n\nNo defects found.\n");
  const submitted = await execute(prepared.repo, (service) =>
    service.submit({
      spec: prepared.spec,
      issue: prepared.issueId,
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
    service.accept({ spec: prepared.spec, issue: prepared.issueId, author: "controller" }),
  );
  expect(accepted.status, accepted.stderr).toBe(0);
  return prepared;
}

export async function prepareDeliveryReady(requireRetrospective = false) {
  const prepared = await prepareAcceptedIssue({ requireRetrospective });
  prepared.git("add", "feature.ts");
  prepared.git("commit", "-qm", "deliver accepted issue");
  const integrated = await execute(prepared.repo, (service) =>
    service.integrate({
      spec: prepared.spec,
      issue: "I-0001",
      commit: prepared.git("rev-parse", "HEAD"),
      author: "controller",
    }),
  );
  expect(integrated.status, integrated.stderr).toBe(0);

  const command = "just test::test tests/whole-feature.test.ts";
  const required = await execute(prepared.repo, (service) =>
    service.checksRequire({
      issue: "",
      spec: prepared.spec,
      scope: "delivery",
      command,
      author: "controller",
    }),
  );
  expect(required.status, required.stderr).toBe(0);
  const snapshot = JSON.parse(required.stdout).snapshot as string;
  const recorded = await execute(prepared.repo, (service) =>
    service.checksRecord({
      issue: "",
      spec: prepared.spec,
      scope: "delivery",
      snapshot,
      command,
      result: "passed",
      author: "controller",
    }),
  );
  expect(recorded.status, recorded.stderr).toBe(0);

  const review = await execute(prepared.repo, (service) =>
    service.review({
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
    service.submit({
      issue: "",
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
  const status = await execute(repo, (service) => service.status({ spec }));
  expect(status.status, status.stderr).toBe(0);
  const snapshot = JSON.parse(status.stdout).snapshots[0].snapshot as string;
  return await recordReviewCheck(repo, spec, command, snapshot, "passed");
}
