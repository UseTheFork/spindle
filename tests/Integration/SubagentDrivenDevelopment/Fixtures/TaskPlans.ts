import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { execute } from "@test/Helpers/SubagentDrivenDevelopment/helpers";
import { expect } from "vitest";

export async function createTaskPlan(root: string, spec: string, ticket: string): Promise<string> {
  const created = await execute(root, (services) =>
    services.taskService.create({
      spec,
      ticket,
      author: "controller",
      title: `Implement ${ticket}`,
      instructions: `Implement the assigned work for ${ticket}.`,
      acceptanceCriteria: [`The behavior for ${ticket} is implemented.`],
      editPaths: [`src/${ticket}.ts`],
      createPaths: [],
      referencePaths: [],
      dependencies: [],
    }),
  );
  expect(created.status, created.stderr).toBe(0);
  return JSON.parse(created.stdout).task as string;
}

export function acceptTaskPlan(
  root: string,
  spec: string,
  ticket: string,
  task = "TASK-0001",
): void {
  const ledgerPath = join(dirname(spec), "sdd.json");
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  const progress = ledger.tickets.find((item: { id: string }) => item.id === ticket);
  expect(progress).toBeDefined();
  const definition = progress.tasks?.find((item: { id: string }) => item.id === task);
  expect(definition).toBeDefined();

  // These downstream-gate fixtures begin after task review; task lifecycle tests exercise the
  // real assignment, report, and acceptance commands separately.
  const at = new Date().toISOString();
  const assignment = `fixture-${ticket}-${task}`;
  definition.status = "accepted";
  definition.assignment = {
    id: assignment,
    controller: "controller",
    worker: "task-worker",
    worktree: dirname(root),
    report: join(dirname(root), "reports", `${ticket}-${task}-fixture.md`),
    assignedAt: at,
    submittedAt: at,
    submittedBy: "controller",
    reportSha256: "a".repeat(64),
  };
  definition.review = {
    assignment,
    result: "accepted",
    details: "Task accepted in the downstream fixture.",
    controller: "controller",
    recordedAt: at,
  };
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
}

/** Keep finalization fixtures' historical task worktree outside the cleanup target. */
export function rehomeTaskWorktreeForFinalizationFixture(
  spec: string,
  ticket: string,
  worktree: string,
): void {
  const ledgerPath = join(dirname(spec), "sdd.json");
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  const progress = ledger.tickets.find((item: { id: string }) => item.id === ticket);
  expect(progress).toBeDefined();
  for (const task of progress.tasks ?? []) {
    if (task.assignment) task.assignment.worktree = worktree;
    for (const assignment of task.assignmentHistory ?? []) assignment.worktree = worktree;
  }
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
}
