import type {
  SpawnSyncOptionsWithBufferEncoding,
  SpawnSyncOptionsWithStringEncoding,
  SpawnSyncReturns,
} from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { Application } from "@spindle/Foundation/Application";
import { LoadProjectSettings } from "@spindle/Foundation/Bootstrap/LoadProjectSettings";
import { GitService } from "@spindle/Git/Services/GitService";
import { FeatureInspectionService } from "@spindle/SubagentDrivenDevelopment/Services/FeatureInspectionService";
import { TicketIntegrationService } from "@spindle/SubagentDrivenDevelopment/Services/TicketIntegrationService";
import { WorkflowRecordsCommitter } from "@spindle/SubagentDrivenDevelopment/Services/WorkflowRecordsCommitter";
import { applicationFixture } from "@test/Helpers/ApplicationFixture";
import { cliOutput, invokeAsync } from "@test/Helpers/SubagentDrivenDevelopment/helpers";
import {
  gitAt,
  acceptedTicket,
  integrate,
} from "@test/Helpers/SubagentDrivenDevelopment/TicketWorktreeFixtures";
import { repoRoot } from "@test/Helpers/TemporaryDirectories";
import { expect, test, vi } from "vitest";

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
