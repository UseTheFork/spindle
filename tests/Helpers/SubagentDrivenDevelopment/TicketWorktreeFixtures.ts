import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  cliOutput,
  execute,
  fixture,
  invokeAsync,
  recordReviewCheck,
} from "@test/Helpers/SubagentDrivenDevelopment/helpers";
import { expect } from "vitest";

export function gitAt(directory: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd: directory,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export async function setup() {
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

export async function dispatch(root: string, spec: string, parent: string, ticket: string) {
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

export async function acceptedTicket(file = "first.ts", content = "ticket\n", baseline?: string) {
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

export function integrate(root: string, spec: string) {
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

export function integrateWithService(root: string, spec: string) {
  return execute(root, (services) =>
    services.ticketIntegrationService.integrate({
      spec,
      ticket: "T-0001",
      author: "controller",
    }),
  );
}
