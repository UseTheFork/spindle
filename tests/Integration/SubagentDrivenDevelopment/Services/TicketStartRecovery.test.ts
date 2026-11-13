import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { expect, test, vi } from "vitest";

import { LoadProjectConfiguration } from "@/Foundation/Bootstrap/LoadProjectConfiguration";
import { LedgerRepository } from "@/SubagentDrivenDevelopment/Persistence/LedgerRepository";
import { WorkspaceTransaction } from "@/SubagentDrivenDevelopment/Persistence/WorkspaceTransaction";
import { AssignmentService } from "@/SubagentDrivenDevelopment/Services/AssignmentService";
import { FeatureInspectionService } from "@/SubagentDrivenDevelopment/Services/FeatureInspectionService";
import { TicketWorktreeService } from "@/SubagentDrivenDevelopment/Services/TicketWorktreeService";

import { applicationFixture } from "../../../Helpers/ApplicationFixture";
import {
  cliOutput,
  execute,
  fixture,
  invokeAsync,
} from "../../../Helpers/SubagentDrivenDevelopment/helpers";
import { repoRoot } from "../../../Helpers/TemporaryDirectories";

async function preparedDispatch() {
  const { repo } = fixture();
  const created = await execute(repo, (services) =>
    services.featureCreationService.create({ title: "Recover dispatch", author: "controller" }),
  );
  expect(created.status, created.stderr).toBe(0);
  const parent = join(dirname(repo), "external");
  mkdirSync(parent);
  const started = await invokeAsync(repo, [
    "start",
    "--spec",
    JSON.parse(created.stdout).spec,
    "--workspace",
    parent,
    "--confirm-records",
  ]);
  expect(started.status, started.stderr).toBe(0);
  const { featureWorkspace: root, spec } = cliOutput(started) as {
    featureWorkspace: string;
    spec: string;
  };
  const ticket = await execute(root, (services) =>
    services.ticketService.ticketCreate({
      spec,
      title: "Recover",
      reporter: "requester",
      category: "enhancement",
      author: "controller",
    }),
  );
  expect(ticket.status, ticket.stderr).toBe(0);
  const app = applicationFixture(root, join(repoRoot, "assets/Blueprints"));
  await new LoadProjectConfiguration().bootstrap(app);
  await app.boot();
  const assignment = await app.make(AssignmentService);
  const options = {
    spec,
    ticket: "T-0001",
    author: "controller",
    workspace: parent,
    confirmRecords: true,
  };
  const workspace = join(parent, "0001-recover-dispatch-T-0001");
  return { root, spec, workspace, assignment, options, app };
}

async function interruptedDispatch() {
  const prepared = await preparedDispatch();
  const transaction = await prepared.app.make(WorkspaceTransaction);
  vi.spyOn(transaction, "writeWorkflowState").mockImplementationOnce(() => {
    throw new Error("interrupted before assignment persistence");
  });
  expect(() => prepared.assignment.implement(prepared.options)).toThrow(
    "interrupted before assignment persistence",
  );
  return prepared;
}

test("resumes a journalled worktree allocation before Git worktree creation", async () => {
  const { root, workspace, assignment, options } = await preparedDispatch();
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  git("add", ".scratch");
  git("commit", "-qm", "prepare ticket records");
  const common = git("rev-parse", "--path-format=absolute", "--git-common-dir");
  const journals = join(common, "spindle-ticket-start");
  mkdirSync(journals);
  mkdirSync(workspace);
  const directory = statSync(workspace);
  writeFileSync(
    join(journals, "0001-recover-dispatch-T-0001.json"),
    JSON.stringify({
      version: 2,
      id: "interrupted-allocation",
      feature: "0001-recover-dispatch",
      ticket: "T-0001",
      owner: "controller",
      featureWorkspace: root,
      workspace,
      branch: "tickets/0001-recover-dispatch/T-0001",
      baseSha: git("rev-parse", "HEAD"),
      directory: { device: directory.dev, inode: directory.ino },
    }),
  );
  const resumed = assignment.implement(options);
  expect(resumed.assignment.workspace).toBe(workspace);
  expect(resumed.assignment.branch).toBe("tickets/0001-recover-dispatch/T-0001");
});

test("retries dispatch after worktree creation without duplicating the branch or assignment", async () => {
  const { root, spec, workspace, assignment, options } = await interruptedDispatch();
  const branch = execFileSync("git", ["branch", "--show-current"], {
    cwd: workspace,
    encoding: "utf8",
  }).trim();
  const resumed = assignment.implement(options);
  expect(resumed.assignment.workspace).toBe(workspace);
  expect(resumed.assignment.branch).toBe(branch);
  const repeated = assignment.implement(options);
  expect(repeated.assignment.id).toBe(resumed.assignment.id);
  const ledger = JSON.parse(readFileSync(join(dirname(spec), "sdd.json"), "utf8"));
  expect(ledger.tickets[0].assignment.id).toBe(resumed.assignment.id);
  expect(execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" })).toContain(
    ".scratch/",
  );
});

test("retry preserves a previously created ticket worktree containing new work", async () => {
  const { workspace, assignment, options } = await interruptedDispatch();
  const work = join(workspace, "unsaved.ts");
  writeFileSync(work, "preserve this work\n");
  expect(() => assignment.implement(options)).toThrow("failed verification");
  expect(readFileSync(work, "utf8")).toBe("preserve this work\n");
});

test("resumes an independent ticket after the feature branch advances", async () => {
  const { root, workspace, assignment, options } = await interruptedDispatch();
  const git = (cwd: string, ...args: string[]) =>
    execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  const baseline = git(workspace, "rev-parse", "HEAD");
  writeFileSync(join(root, "independent.ts"), "independent work\n");
  git(root, "add", "independent.ts");
  git(root, "commit", "-qm", "integrate independent work");
  const resumed = assignment.implement(options);
  expect(resumed.assignment.workspace).toBe(workspace);
  expect(resumed.headSha).toBe(baseline);
  expect(git(workspace, "rev-parse", "HEAD")).toBe(baseline);
  expect(git(root, "rev-parse", "HEAD")).not.toBe(baseline);
});

test("does not resume a ticket whose recorded baseline excludes a new prerequisite", async () => {
  const { root, spec, workspace, options, app } = await interruptedDispatch();
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  writeFileSync(join(root, "prerequisite.ts"), "prerequisite work\n");
  git("add", "prerequisite.ts");
  git("commit", "-qm", "integrate prerequisite");
  const feature = (await app.make(FeatureInspectionService)).resolveFeature(spec);
  const ledger = (await app.make(LedgerRepository)).readLedger(feature);
  const progress = ledger.tickets[0]!;
  progress.owner = "controller";
  const worktrees = await app.make(TicketWorktreeService);
  expect(() =>
    worktrees.create(feature, progress, options.workspace, [git("rev-parse", "HEAD")]),
  ).toThrow("does not include the current prerequisite integrations");
  expect(
    execFileSync("git", ["branch", "--show-current"], { cwd: workspace, encoding: "utf8" }).trim(),
  ).toBe("tickets/0001-recover-dispatch/T-0001");
});
