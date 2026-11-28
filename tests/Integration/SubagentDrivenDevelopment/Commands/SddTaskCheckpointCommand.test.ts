import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { projectSettingsSchema } from "@spindle/Settings/Models/ProjectSettings";
import { SddNextCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SddNextCommand";
import { SddTaskCheckpointCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SddTaskCheckpointCommand";
import { FeatureWorkspaceService } from "@spindle/SubagentDrivenDevelopment/Services/FeatureWorkspaceService";
import { TaskDispatchService } from "@spindle/SubagentDrivenDevelopment/Services/TaskDispatchService";
import { WorktreeStartService } from "@spindle/SubagentDrivenDevelopment/Services/WorktreeStartService";
import { applicationFixture } from "@test/Helpers/ApplicationFixture";
import { runCliRaw } from "@test/Helpers/Cli";
import { fixture } from "@test/Helpers/SubagentDrivenDevelopment/helpers";
import { repoRoot } from "@test/Helpers/TemporaryDirectories";
import { expect, test } from "vitest";

const name = "0001-checkpoints";
const progress = {
  phase: "implementing",
  summary: "Added assignment validation.",
  next: "Run focused dispatch tests.",
};

async function checkpointFixture() {
  const { repo, git } = fixture();
  const app = applicationFixture(repo, join(repoRoot, "assets/Blueprints"), {
    status: "valid",
    data: projectSettingsSchema.parse({
      stacks: ["python"],
      sdd: { worktree_directory: "../worktrees", setup_command: [] },
    }),
  });
  await app.boot();
  const workspace = await app.make(FeatureWorkspaceService);
  await workspace.create({ name, specification: "Record worker progress." });
  const { ticket } = await workspace.createTicket(name, {
    title: "Checkpoints",
    requirements: "Record progress without completing work.",
    acceptanceCriteria: "Progress is preserved and visible.",
    dependencies: [],
  });
  const { task } = await workspace.createTask(name, ticket, {
    instructions: "Add assignment validation.",
    writeScope: ["src/Dispatch.ts"],
    dependencies: [],
  });
  const { task: dependent } = await workspace.createTask(name, ticket, {
    instructions: "Use assignment validation.",
    writeScope: ["src/Consumer.ts"],
    dependencies: [task],
  });
  const start = await app.make(WorktreeStartService);
  await start.start(name);
  const started = await start.start(name, ticket);
  return {
    repo,
    git,
    task,
    dependent,
    workspace,
    worktree: started.worktree,
    ledgerPath: join(repo, ".spindle/features", name, "sdd.json"),
    ticketPath: join(repo, ".spindle/features", name, "tickets", `${ticket}.md`),
    dispatch: await app.make(TaskDispatchService),
    command: await app.make(SddTaskCheckpointCommand),
    next: await app.make(SddNextCommand),
  };
}

test("records CLI checkpoints and exposes current progress and full history without completing work", async () => {
  const {
    repo,
    git,
    task,
    dependent,
    workspace,
    worktree,
    ledgerPath,
    ticketPath,
    dispatch,
    command,
    next,
  } = await checkpointFixture();
  await dispatch.dispatch(name, task);
  const featureBefore = await workspace.load(name);
  const markdown = await readFile(ticketPath, "utf8");
  const head = git("-C", worktree, "rev-parse", "HEAD");
  const status = git("-C", worktree, "status", "--porcelain");
  const before = Date.now();
  const recorded = runCliRaw(
    repo,
    [
      "--json",
      "sdd",
      "task",
      "checkpoint",
      "--feature",
      name,
      "--task",
      task,
      "--attempt",
      "1",
      "--phase",
      " planning ",
      "--summary",
      " Read the assignment. ",
      "--next",
      " Implement validation. ",
      "--files-changed",
      "src/Dispatch.ts",
      "--files-changed",
      "src/Additional.ts",
    ],
    process.env.PATH ?? "",
  );
  expect(recorded.status, recorded.stderr).toBe(0);
  const first = JSON.parse(recorded.stdout).data.checkpoint;
  expect(first).toEqual({
    attempt: 1,
    recordedAt: expect.any(String),
    phase: "planning",
    summary: "Read the assignment.",
    next: "Implement validation.",
    filesChanged: ["src/Dispatch.ts", "src/Additional.ts"],
  });
  expect(Date.parse(first.recordedAt)).toBeGreaterThanOrEqual(before);
  expect(Date.parse(first.recordedAt)).toBeLessThanOrEqual(Date.now());

  const { checkpoint: second } = await command.run(name, task, 1, {
    ...progress,
    blocker: "Need the controller to clarify an overlap.",
  });
  const feature = await workspace.load(name);
  expect(feature.tickets[0].tasks[0]).toEqual({
    ...featureBefore.tickets[0].tasks[0],
    checkpoints: [first, second],
  });
  expect(feature.tickets[0].tasks[1]).toEqual(featureBefore.tickets[0].tasks[1]);
  expect(feature.reviewRounds).toEqual(featureBefore.reviewRounds);
  expect(feature.findings).toEqual(featureBefore.findings);
  expect(await readFile(ticketPath, "utf8")).toBe(markdown);
  expect(git("-C", worktree, "rev-parse", "HEAD")).toBe(head);
  expect(git("-C", worktree, "status", "--porcelain")).toBe(status);
  const output = await next.run(name, true);
  expect(output.tickets[0].tasks[0].checkpoint).toEqual(second);
  expect(output.tickets[0].tasks.find(({ taskId }) => taskId === dependent)).toMatchObject({
    ready: false,
    blockers: [{ code: "dependency-not-done", dependencyId: task }],
  });
  expect(output.graph?.[0].tasks[0]).toMatchObject({
    attempt: 1,
    checkpoints: [first, second],
  });
  const ledger = JSON.parse(await readFile(ledgerPath, "utf8"));
  expect(ledger.tickets[0].tasks[0].checkpoints).toEqual([first, second]);

  const json = runCliRaw(
    repo,
    ["--json", "sdd", "next", "--feature", name],
    process.env.PATH ?? "",
  );
  expect(json.status, json.stderr).toBe(0);
  expect(JSON.parse(json.stdout).data.tickets[0].tasks[0].checkpoint).toEqual(second);
  const human = runCliRaw(repo, ["sdd", "next", "--feature", name], process.env.PATH ?? "");
  expect(human.status, human.stderr).toBe(0);
  expect(human.stdout).toContain(`Checkpoint (attempt 1, ${second.recordedAt})`);
  expect(human.stdout).toContain(progress.summary);
  expect(human.stdout).toContain(`Next: ${progress.next}`);
  expect(human.stdout).toContain(`Blocker: ${second.blocker}`);
});

test("rejects inactive, stale, malformed, and locked checkpoint writes without altering the ledger", async () => {
  const { repo, task, ledgerPath, dispatch, command } = await checkpointFixture();
  let before = await readFile(ledgerPath, "utf8");
  await expect(command.run(name, task, 1, progress)).rejects.toThrow("not the active assignment");
  expect(await readFile(ledgerPath, "utf8")).toBe(before);
  await dispatch.dispatch(name, task);
  before = await readFile(ledgerPath, "utf8");

  for (const attempt of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    await expect(command.run(name, task, attempt, progress)).rejects.toThrow(
      "positive safe integer",
    );
  }
  await expect(command.run(name, "T-9999.1", 1, progress)).rejects.toThrow("Unknown task");
  for (const invalid of [
    { ...progress, phase: " " },
    { ...progress, summary: "" },
    { ...progress, next: "\n" },
    { ...progress, blocker: " " },
    { ...progress, filesChanged: ["../outside.ts"] },
  ]) {
    await expect(command.run(name, task, 1, invalid)).rejects.toThrow();
    expect(await readFile(ledgerPath, "utf8")).toBe(before);
  }

  const args = [
    "--json",
    "sdd",
    "task",
    "checkpoint",
    "--feature",
    name,
    "--task",
    task,
    "--attempt",
    "1",
    "--phase",
    progress.phase,
    "--summary",
    progress.summary,
  ];
  const missing = runCliRaw(repo, args, process.env.PATH ?? "");
  expect(missing.status).not.toBe(0);
  expect(missing.stderr).toContain("--next");
  const duplicate = runCliRaw(
    repo,
    [...args, "--next", progress.next, "--attempt", "1"],
    process.env.PATH ?? "",
  );
  expect(duplicate.status).not.toBe(0);
  expect(duplicate.stderr).toContain("may only be provided once");
  expect(await readFile(ledgerPath, "utf8")).toBe(before);

  await dispatch.dispatch(name, task, 1);
  before = await readFile(ledgerPath, "utf8");
  await expect(command.run(name, task, 1, progress)).rejects.toThrow("not the active assignment");
  expect(await readFile(ledgerPath, "utf8")).toBe(before);

  await mkdir(join(repo, ".spindle/features", name, ".ledger-lock"));
  await expect(command.run(name, task, 2, progress)).rejects.toThrow("Feature storage is locked");
  expect(await readFile(ledgerPath, "utf8")).toBe(before);
});

test("preserves checkpoint history across retries and completion without presenting old progress as current", async () => {
  const { task, workspace, ledgerPath, dispatch, command, next } = await checkpointFixture();
  await dispatch.dispatch(name, task);
  const { checkpoint: first } = await command.run(name, task, 1, progress);
  await dispatch.dispatch(name, task, 1);
  let output = await next.run(name, true);
  expect(output.tickets[0].tasks[0]).not.toHaveProperty("checkpoint");
  expect(output.graph?.[0].tasks[0].checkpoints).toEqual([first]);
  const { checkpoint: second } = await command.run(name, task, 2, {
    ...progress,
    phase: "checking",
  });
  expect((await next.run(name)).tickets[0].tasks[0].checkpoint).toEqual(second);
  await dispatch.submit(name, task, 2);
  const before = await readFile(ledgerPath, "utf8");
  await expect(command.run(name, task, 2, progress)).rejects.toThrow("not the active assignment");
  expect(await readFile(ledgerPath, "utf8")).toBe(before);
  output = await next.run(name, true);
  expect(output.tickets[0].tasks[0]).not.toHaveProperty("checkpoint");
  expect(output.graph?.[0].tasks[0].checkpoints).toEqual([first, second]);
  expect((await workspace.load(name)).tickets[0].tasks[0].checkpoints).toEqual([first, second]);
});
