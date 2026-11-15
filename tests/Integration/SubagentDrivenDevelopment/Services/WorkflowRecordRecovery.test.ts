import { execFileSync } from "node:child_process";
import type {
  SpawnSyncOptionsWithBufferEncoding,
  SpawnSyncOptionsWithStringEncoding,
  SpawnSyncReturns,
} from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { expect, test, vi } from "vitest";

import type { Application } from "@/Foundation/Application";
import { LoadProjectSettings } from "@/Foundation/Bootstrap/LoadProjectSettings";
import { GitService } from "@/Git/Services/GitService";
import { LedgerRepository } from "@/SubagentDrivenDevelopment/Persistence/LedgerRepository";
import { WorkspaceTransaction } from "@/SubagentDrivenDevelopment/Persistence/WorkspaceTransaction";
import { AssignmentService } from "@/SubagentDrivenDevelopment/Services/AssignmentService";
import { FeatureInspectionService } from "@/SubagentDrivenDevelopment/Services/FeatureInspectionService";
import { TicketService } from "@/SubagentDrivenDevelopment/Services/TicketService";
import { WorkflowRecordsCommitter } from "@/SubagentDrivenDevelopment/Services/WorkflowRecordsCommitter";

import { applicationFixture } from "../../../Helpers/ApplicationFixture";
import {
  cliOutput,
  execute,
  fixture,
  invokeAsync,
  prepareReadyTicket,
} from "../../../Helpers/SubagentDrivenDevelopment/helpers";
import { repoRoot } from "../../../Helpers/TemporaryDirectories";

function stringEncoding(
  options: SpawnSyncOptionsWithStringEncoding | SpawnSyncOptionsWithBufferEncoding,
): options is SpawnSyncOptionsWithStringEncoding {
  return typeof options.encoding === "string" && options.encoding !== "buffer";
}

class InterruptingGitService extends GitService {
  public interrupt: "add" | "commit" | undefined;

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
    const result = stringEncoding(options) ? super.run(args, options) : super.run(args, options);
    if (
      result.status === 0 &&
      ((this.interrupt === "add" && args[0] === "add") ||
        (this.interrupt === "commit" && args[0] === "commit"))
    ) {
      this.interrupt = undefined;
      throw new Error("simulated interruption");
    }
    return result;
  }
}

async function interruptAppGit(app: Application, command: "add" | "commit") {
  const git = await app.make(GitService);
  const run = git.run.bind(git) as (
    args: string[],
    options: SpawnSyncOptionsWithStringEncoding,
  ) => SpawnSyncReturns<string>;
  const spy = vi.spyOn(git, "run").mockImplementation(((
    args: string[],
    options: SpawnSyncOptionsWithStringEncoding,
  ) => {
    const result = run(args, options);
    if (result.status === 0 && args[0] === command) {
      spy.mockRestore();
      throw new Error("simulated interruption");
    }
    return result;
  }) as typeof git.run);
}

async function bootedApp(root: string) {
  const app = applicationFixture(root, join(repoRoot, "assets/Blueprints"));
  await new LoadProjectSettings().bootstrap(app);
  await app.boot();
  return app;
}

function gitOutput(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function recordCommitJournal(root: string, feature: string): string {
  return join(
    gitOutput(root, "rev-parse", "--path-format=absolute", "--git-common-dir"),
    "spindle-record-commit",
    `${feature}.json`,
  );
}

async function setup() {
  const { repo } = fixture();
  const created = await execute(repo, (services) =>
    services.featureCreationService.create({ title: "Record recovery", author: "controller" }),
  );
  expect(created.status, created.stderr).toBe(0);
  const parent = join(dirname(repo), "external");
  mkdirSync(parent);
  const started = await invokeAsync(repo, [
    "start",
    "--feature",
    JSON.parse(created.stdout).workspace,
    "--workspace",
    parent,
    "--confirm-records",
  ]);
  expect(started.status, started.stderr).toBe(0);
  const { featureWorkspace: root, spec } = cliOutput(started) as {
    featureWorkspace: string;
    spec: string;
  };
  const app = applicationFixture(root, join(repoRoot, "assets/Blueprints"));
  await new LoadProjectSettings().bootstrap(app);
  await app.boot();
  const feature = (await app.make(FeatureInspectionService)).resolveFeature(spec);
  const git = new InterruptingGitService(app);
  const committer = new WorkflowRecordsCommitter(app, git);
  writeFileSync(spec, `${readFileSync(spec, "utf8")}\nNew requirement.\n`);
  const original = JSON.parse(created.stdout) as { spec: string };
  return { repo, originalSpec: original.spec, root, spec, feature, git, committer, app };
}

test.each(["add", "commit"] as const)(
  "resumes canonical record commit after interruption following %s",
  async (interrupted) => {
    const { root, spec, feature, git, committer } = await setup();
    const before = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    git.interrupt = interrupted;
    expect(() => committer.commit(feature)).toThrow("simulated interruption");
    const after = committer.commit(feature);
    expect(after).toBe(
      execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    );
    expect(
      execFileSync("git", ["rev-list", "--count", `${before}..HEAD`], {
        cwd: root,
        encoding: "utf8",
      }).trim(),
    ).toBe("1");
    expect(readFileSync(spec, "utf8")).toContain("New requirement.");
    expect(committer.commit(feature)).toBeUndefined();
  },
);

test("workflow writes in the feature worktree are committed immediately", async () => {
  const { root, feature, app } = await setup();
  const transaction = await app.make(WorkspaceTransaction);
  const ledgers = await app.make(LedgerRepository);
  const before = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  transaction.run(feature.workspace, () => {
    const ledger = ledgers.readLedger(feature);
    ledger.delivery.history.push({
      at: new Date().toISOString(),
      author: "controller",
      action: "workflow-write-test",
    });
    transaction.writeLedger(feature, ledger);
  });

  const after = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  expect(after).not.toBe(before);
  expect(
    execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
  ).toBe("");
  expect(
    execFileSync("git", ["show", "-s", "--format=%s", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
  ).toBe("spindle: record 0001-record-recovery workflow");
});

test("refuses recovery when journalled records have changed and preserves staged content", async () => {
  const { root, spec, feature, git, committer } = await setup();
  git.interrupt = "add";
  expect(() => committer.commit(feature)).toThrow("simulated interruption");
  writeFileSync(spec, `${readFileSync(spec, "utf8")}\nUnexpected change.\n`);
  expect(() => committer.commit(feature)).toThrow("changed during recovery");
  expect(readFileSync(spec, "utf8")).toContain("Unexpected change.");
  expect(
    execFileSync("git", ["show", ":.scratch/0001-record-recovery/spec.md"], {
      cwd: root,
      encoding: "utf8",
    }),
  ).not.toContain("Unexpected change.");
});

test("does not commit workflow records during an existing merge", async () => {
  const { root, spec, feature, committer } = await setup();
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  git("checkout", "-qb", "unrelated-branch");
  writeFileSync(join(root, "unrelated.ts"), "other work\n");
  git("add", "unrelated.ts");
  git("commit", "-qm", "other work");
  git("checkout", "-q", "features/0001-record-recovery");
  const before = git("rev-parse", "HEAD");
  git("merge", "--no-ff", "--no-commit", "unrelated-branch");
  expect(() => committer.commit(feature)).toThrow("existing Git operation");
  expect(git("rev-parse", "HEAD")).toBe(before);
  expect(git("rev-parse", "--verify", "MERGE_HEAD")).toBe(git("rev-parse", "unrelated-branch"));
  expect(readFileSync(spec, "utf8")).toContain("New requirement.");
});

test("does not bypass an active Git hook while committing workflow records", async () => {
  const { root, feature, committer } = await setup();
  const hook = execFileSync("git", ["rev-parse", "--git-path", "hooks/pre-commit"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  writeFileSync(resolve(root, hook), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  expect(() => committer.commit(feature)).toThrow("Active Git hook");
  expect(
    execFileSync("git", ["diff", "--cached", "--name-only"], {
      cwd: root,
      encoding: "utf8",
    }),
  ).toBe("");
});

test("commits canonical report paths literally", async () => {
  const { root, feature, committer } = await setup();
  const report = join(dirname(feature.spec), "reports", "[review].md");
  writeFileSync(report, "Reviewed.\n");
  const commit = committer.commit(feature);
  expect(commit).toBeTruthy();
  expect(
    execFileSync("git", ["show", "HEAD:.scratch/0001-record-recovery/reports/[review].md"], {
      cwd: root,
      encoding: "utf8",
    }),
  ).toBe("Reviewed.\n");
});

test.each(["add", "commit"] as const)(
  "retrying ticket create after an interrupted record commit following %s recovers it without a duplicate ticket",
  async (interrupted) => {
    const { root, spec, feature, app } = await setup();
    const tickets = await app.make(TicketService);
    const options = {
      spec,
      title: "Recover the commit",
      reporter: "requester",
      category: "enhancement",
      author: "controller",
    };
    const before = gitOutput(root, "rev-parse", "HEAD");
    await interruptAppGit(app, interrupted);
    expect(() => tickets.ticketCreate(options)).toThrow("simulated interruption");
    expect(existsSync(recordCommitJournal(root, feature.feature))).toBe(true);

    expect(tickets.ticketCreate(options).ticket).toBe("T-0001");

    expect(readdirSync(join(feature.workspace, "tickets"))).toEqual(["T-0001.md"]);
    const ledger = JSON.parse(readFileSync(feature.ledger, "utf8")) as {
      tickets: { id: string }[];
    };
    expect(ledger.tickets.map((ticket) => ticket.id)).toEqual(["T-0001"]);
    expect(gitOutput(root, "rev-list", "--count", `${before}..HEAD`)).toBe("1");
    expect(gitOutput(root, "status", "--porcelain=v1", "--untracked-files=all")).toBe("");
    expect(existsSync(recordCommitJournal(root, feature.feature))).toBe(false);
    expect(tickets.ticketCreate(options).ticket).toBe("T-0002");
  },
);

test("retrying implement after an interrupted record commit recovers it without a duplicate assignment", async () => {
  const { repo: root, spec, worktreeParent } = await prepareReadyTicket();
  const app = await bootedApp(root);
  const assignments = await app.make(AssignmentService);
  const options = { spec, ticket: "T-0001", author: "controller", workspace: worktreeParent };
  const before = gitOutput(root, "rev-parse", "HEAD");
  await interruptAppGit(app, "commit");
  expect(() => assignments.implement(options)).toThrow("simulated interruption");

  const resumed = assignments.implement(options);

  const ledger = JSON.parse(readFileSync(join(dirname(spec), "sdd.json"), "utf8")) as {
    tickets: { assignment?: { id: string } }[];
  };
  expect(ledger.tickets[0]?.assignment?.id).toBe(resumed.assignment.id);
  expect(gitOutput(root, "rev-list", "--count", `${before}..HEAD`)).toBe("1");
  expect(gitOutput(root, "status", "--porcelain=v1", "--untracked-files=all")).toBe("");
  expect(gitOutput(root, "show", "HEAD:.scratch/0001-ticket-flow/sdd.json")).toContain(
    resumed.assignment.id,
  );
  expect(assignments.implement(options).assignment.id).toBe(resumed.assignment.id);
});

test("rejects post-start workflow writes from the original checkout", async () => {
  const { repo, originalSpec, root } = await setup();
  const before = gitOutput(repo, "rev-parse", "HEAD");
  const result = await execute(repo, (services) =>
    services.ticketService.ticketCreate({
      spec: originalSpec,
      title: "Misplaced",
      reporter: "requester",
      category: "enhancement",
      author: "controller",
    }),
  );
  expect(result.status).toBe(1);
  expect(result.stderr).toContain(`run this command from its feature worktree ${root}`);
  expect(result.stderr).toContain("features/0001-record-recovery");
  expect(gitOutput(repo, "rev-parse", "HEAD")).toBe(before);
  expect(gitOutput(repo, "status", "--porcelain=v1", "--untracked-files=all")).toBe("");
});
