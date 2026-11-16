import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { commitTicketWorkspace, execute } from "@test/Helpers/SubagentDrivenDevelopment/helpers";
import {
  acceptedTicket,
  dispatch,
  integrateWithService,
  setup,
} from "@test/Helpers/SubagentDrivenDevelopment/TicketWorktreeFixtures";
import { expect, test } from "vitest";

test.each(["unassigned", "assigned", "submitted", "changes-requested"] as const)(
  "ticket implementation submission is blocked while a task is %s",
  async (taskStatus) => {
    const { root, spec, parent } = await setup();
    const dispatched = await dispatch(root, spec, parent, "T-0001");
    let taskAssignment: { id: string; report: string } | undefined;

    if (taskStatus !== "unassigned") {
      const assigned = await execute(root, (services) =>
        services.taskService.assign({
          spec,
          ticket: "T-0001",
          task: "TASK-0001",
          worker: "task-worker",
          author: "controller",
        }),
      );
      expect(assigned.status, assigned.stderr).toBe(0);
      taskAssignment = JSON.parse(assigned.stdout).assignment as {
        id: string;
        report: string;
      };
    }

    if (taskStatus === "submitted" || taskStatus === "changes-requested") {
      writeFileSync(taskAssignment!.report, "# Task report\n\nSubmitted.\n");
      const submitted = await execute(root, (services) =>
        services.taskService.submit({
          spec,
          ticket: "T-0001",
          task: "TASK-0001",
          assignment: taskAssignment!.id,
          author: "controller",
        }),
      );
      expect(submitted.status, submitted.stderr).toBe(0);
    }

    if (taskStatus === "changes-requested") {
      const changes = await execute(root, (services) =>
        services.taskService.requestChanges({
          spec,
          ticket: "T-0001",
          task: "TASK-0001",
          assignment: taskAssignment!.id,
          details: "Revise the task result.",
          author: "controller",
        }),
      );
      expect(changes.status, changes.stderr).toBe(0);
    }

    writeFileSync(
      join(dispatched.assignment.workspace, "feature.ts"),
      "export const feature = 1;\n",
    );
    commitTicketWorkspace(dispatched.assignment.workspace, "commit combined ticket work");
    writeFileSync(dispatched.assignment.report, "# Ticket report\n\nCombined changes.\n");
    const result = await execute(root, (services) =>
      services.submissionService.submit({
        spec,
        ticket: "T-0001",
        assignment: dispatched.assignment.id,
        author: "controller",
      }),
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(new RegExp(`Task TASK-0001 is ${taskStatus}, not accepted`, "i"));
    const progress = JSON.parse(readFileSync(join(dirname(spec), "sdd.json"), "utf8")).tickets[0];
    expect(progress.execution).toBe("implementing");
    expect(progress.assignment.status).toBe("pending");
  },
);

test("integration and ticket closure remain blocked until every task is accepted", async () => {
  const { root, spec } = await acceptedTicket();
  const ledgerPath = join(dirname(spec), "sdd.json");
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  const progress = ledger.tickets.find((ticket: { id: string }) => ticket.id === "T-0001");
  const acceptedTask = structuredClone(progress.tasks[0]);
  progress.tasks[0] = { ...acceptedTask, status: "unassigned" };
  delete progress.tasks[0].assignment;
  delete progress.tasks[0].review;
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);

  const blockedIntegration = await integrateWithService(root, spec);
  expect(blockedIntegration.status).not.toBe(0);
  expect(blockedIntegration.stderr).toMatch(/Task TASK-0001 is unassigned, not accepted/i);

  const restored = JSON.parse(readFileSync(ledgerPath, "utf8"));
  restored.tickets[0].tasks[0] = acceptedTask;
  writeFileSync(ledgerPath, `${JSON.stringify(restored, null, 2)}\n`);
  const integrated = await integrateWithService(root, spec);
  expect(integrated.status, integrated.stderr).toBe(0);

  const integratedLedger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  const integratedProgress = integratedLedger.tickets.find(
    (ticket: { id: string }) => ticket.id === "T-0001",
  );
  integratedProgress.tasks[0] = { ...acceptedTask, status: "submitted" };
  delete integratedProgress.tasks[0].review;
  writeFileSync(ledgerPath, `${JSON.stringify(integratedLedger, null, 2)}\n`);
  const required = await execute(root, (services) =>
    services.checksService.checksRequire({
      spec,
      ticket: "T-0001",
      scope: "post-merge",
      command: "post-merge validation",
      author: "controller",
    }),
  );
  expect(required.status, required.stderr).toBe(0);
  const recorded = await execute(root, (services) =>
    services.checksService.checksRecord({
      spec,
      ticket: "T-0001",
      scope: "post-merge",
      command: "post-merge validation",
      result: "passed",
      author: "controller",
    }),
  );
  expect(recorded.status, recorded.stderr).toBe(0);
  expect(JSON.parse(recorded.stdout)).toMatchObject({
    closed: false,
    closureBlocked: ["Task TASK-0001 is submitted, not accepted."],
  });
  const after = JSON.parse(readFileSync(ledgerPath, "utf8")).tickets[0];
  expect(after.status).toBe("open");
  expect(after.integration.postMerge.status).toBe("pending");
});
