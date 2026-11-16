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

export async function acceptTaskPlan(
  root: string,
  spec: string,
  ticket: string,
  task = "TASK-0001",
): Promise<void> {
  const assigned = await execute(root, (services) =>
    services.taskService.assign({
      spec,
      ticket,
      task,
      worker: "task-worker",
      author: "controller",
    }),
  );
  expect(assigned.status, assigned.stderr).toBe(0);
  const assignment = JSON.parse(assigned.stdout).assignment as {
    id: string;
    report: string;
  };
  writeFileSync(assignment.report, "# Task report\n\nCompleted the assigned task.\n");

  const submitted = await execute(root, (services) =>
    services.taskService.submit({
      spec,
      ticket,
      task,
      assignment: assignment.id,
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);

  const accepted = await execute(root, (services) =>
    services.taskService.accept({
      spec,
      ticket,
      task,
      assignment: assignment.id,
      author: "controller",
    }),
  );
  expect(accepted.status, accepted.stderr).toBe(0);
}

export function useExternalTaskWorktreeReference(
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
