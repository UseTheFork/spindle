import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { TaskCreateOptions } from "@spindle/SubagentDrivenDevelopment/Models/Options";
import { LedgerRepository } from "@spindle/SubagentDrivenDevelopment/Persistence/LedgerRepository";
import { WorkspaceTransaction } from "@spindle/SubagentDrivenDevelopment/Persistence/WorkspaceTransaction";
import { TaskService } from "@spindle/SubagentDrivenDevelopment/Services/TaskService";
import { runCli } from "@test/Helpers/Cli";
import { cliOutput } from "@test/Helpers/SubagentDrivenDevelopment/helpers";
import {
  createTicket,
  ticketFixture,
} from "@test/Helpers/SubagentDrivenDevelopment/ticket-helpers";
import { expect, test, vi } from "vitest";

async function setup() {
  const fixture = await ticketFixture("Task plans");
  createTicket(fixture.service, fixture.feature.spec, "First ticket");
  createTicket(fixture.service, fixture.feature.spec, "Second ticket");
  const tasks = await fixture.app.make(TaskService);
  const base: TaskCreateOptions = {
    spec: fixture.feature.spec,
    ticket: "T-0001",
    author: "controller",
    title: "Implement",
    instructions: "Implement the bounded change.",
    acceptanceCriteria: ["Works as specified"],
    editPaths: ["src/index.ts"],
    createPaths: ["tests/new.test.ts"],
    referencePaths: ["docs/guide.md"],
    dependencies: [],
  };
  return { ...fixture, tasks, base };
}

function prepareTaskController(feature: { feature: string; workspace: string; ledger: string }) {
  const ledger = JSON.parse(readFileSync(feature.ledger, "utf8"));
  const progress = ledger.tickets.find((item: { id: string }) => item.id === "T-0001");
  const baseSha = "a".repeat(40);
  progress.execution = "implementing";
  progress.owner = "controller";
  progress.baseSha = baseSha;
  progress.worktree = {
    workspace: join(feature.workspace, "..", "shared-ticket-worktree"),
    branch: `tickets/${feature.feature}/T-0001`,
    baseSha,
  };
  writeFileSync(feature.ledger, `${JSON.stringify(ledger, null, 2)}\n`);
  writeFileSync(
    join(feature.workspace, "tickets", "T-0001.md"),
    [
      "---",
      "id: T-0001",
      "---",
      "## Requirements",
      "Parent requirement for the handoff.",
      "",
      "## Acceptance Criteria",
      "- Parent criterion one.",
      "- Parent criterion two.",
      "",
      "## Comments",
      "",
    ].join("\n"),
  );
}

test("create and update persist only task fields, with IDs local to each ticket", async () => {
  const { feature, tasks, base } = await setup();
  const ticketPath = join(feature.workspace, "tickets", "T-0001.md");
  const ticketBefore = readFileSync(ticketPath, "utf8");
  expect(tasks.create(base)).toEqual({ ticket: "T-0001", task: "TASK-0001" });
  expect(tasks.create({ ...base, dependencies: ["TASK-0001"] }).task).toBe("TASK-0002");
  expect(tasks.create({ ...base, ticket: "T-0002" }).task).toBe("TASK-0001");

  const before = JSON.parse(readFileSync(feature.ledger, "utf8"));
  expect(before.schemaVersion).toBe(4);
  expect(before.tickets[0].tasks[0]).toEqual({
    id: "TASK-0001",
    title: base.title,
    instructions: base.instructions,
    acceptanceCriteria: base.acceptanceCriteria,
    editPaths: base.editPaths,
    createPaths: base.createPaths,
    referencePaths: base.referencePaths,
    dependencies: [],
    status: "unassigned",
  });
  tasks.update({
    spec: base.spec,
    ticket: base.ticket,
    author: base.author,
    task: "TASK-0002",
    title: "Revised",
    referencePaths: [],
  });
  const after = JSON.parse(readFileSync(feature.ledger, "utf8"));
  expect(after.tickets[0].tasks[1]).toEqual({
    ...before.tickets[0].tasks[1],
    title: "Revised",
    referencePaths: [],
  });
  expect(after.tickets[0].tasks[0]).toEqual(before.tickets[0].tasks[0]);
  expect(after.tickets[1]).toEqual(before.tickets[1]);
  expect(readFileSync(ticketPath, "utf8")).toBe(ticketBefore);
});

test("retry after interrupted task creation returns the recovered task ID without duplicating it", async () => {
  const { app, feature, tasks, base } = await setup();
  const transaction = await app.make(WorkspaceTransaction);
  const recoveryPath = join(feature.workspace, ".sdd-write-recovery.json");
  const applyWrites = vi
    .spyOn(transaction, "applyWrites")
    .mockImplementation((_workspace, writes) => {
      writeFileSync(recoveryPath, `${JSON.stringify({ version: 1, writes }, null, 2)}\n`);
      throw new Error("simulated interruption after writing the recovery journal");
    });
  try {
    expect(() => tasks.create(base)).toThrow("simulated interruption");
  } finally {
    applyWrites.mockRestore();
  }

  expect(JSON.parse(readFileSync(feature.ledger, "utf8")).tickets[0].tasks).toEqual([]);
  expect(tasks.create(base)).toEqual({ ticket: "T-0001", task: "TASK-0001" });
  const recoveredTasks = JSON.parse(readFileSync(feature.ledger, "utf8")).tickets[0].tasks;
  expect(recoveredTasks).toHaveLength(1);
  expect(recoveredTasks[0]).toMatchObject({
    id: "TASK-0001",
    title: base.title,
    instructions: base.instructions,
    status: "unassigned",
  });
  expect(() => readFileSync(recoveryPath, "utf8")).toThrow();
});

test("invalid task fields and graph changes reject without changing the ledger", async () => {
  const { feature, tasks, base } = await setup();
  tasks.create(base);
  tasks.create({ ...base, dependencies: ["TASK-0001"] });
  tasks.create({ ...base, ticket: "T-0002" });
  const before = readFileSync(feature.ledger, "utf8");
  const invalidCreates: TaskCreateOptions[] = [
    { ...base, title: "" },
    { ...base, instructions: "  " },
    { ...base, acceptanceCriteria: [] },
    { ...base, acceptanceCriteria: [""] },
    { ...base, editPaths: ["../outside"] },
    { ...base, editPaths: ["src/\u0000file"] },
    { ...base, createPaths: ["/absolute"] },
    { ...base, createPaths: ["src/\u001ffile"] },
    { ...base, referencePaths: ["src/*.ts"] },
    { ...base, referencePaths: ["src/\u007ffile"] },
    { ...base, referencePaths: ["src/{a,b}.ts"] },
    { ...base, referencePaths: ["src/+(a|b).ts"] },
    { ...base, referencePaths: ["!src/secret.ts"] },
    { ...base, referencePaths: ["C:\\outside"] },
    { ...base, referencePaths: ["src//file"] },
    { ...base, dependencies: ["TASK-0999"] },
  ];
  for (const options of invalidCreates) {
    expect(() => tasks.create(options)).toThrow();
    expect(readFileSync(feature.ledger, "utf8")).toBe(before);
  }
  for (const changes of [
    { task: "TASK-0001", dependencies: ["TASK-0002"] },
    { task: "TASK-0001", dependencies: ["TASK-0001"] },
    { task: "TASK-0002", dependencies: ["TASK-0999"] },
    { task: "TASK-0001", editPaths: ["src/[ab].ts"] },
    { task: "TASK-0001", title: "" },
  ]) {
    expect(() =>
      tasks.update({ spec: base.spec, ticket: base.ticket, author: base.author, ...changes }),
    ).toThrow();
    expect(readFileSync(feature.ledger, "utf8")).toBe(before);
  }
  expect(() =>
    tasks.update({
      spec: base.spec,
      ticket: "T-0002",
      author: base.author,
      task: "TASK-0001",
      dependencies: ["TASK-0002"],
    }),
  ).toThrow(/does not exist/);
  expect(readFileSync(feature.ledger, "utf8")).toBe(before);
});

test("task paths accept interior spaces and non-ASCII characters", async () => {
  const { feature, tasks, base } = await setup();
  const editPaths = ["src/name with space.ts", "src/café.ts"];
  tasks.create({ ...base, editPaths });
  const ledger = JSON.parse(readFileSync(feature.ledger, "utf8"));
  expect(ledger.tickets[0].tasks[0].editPaths).toEqual(editPaths);
});

test("ledger validation rejects invalid tasks, duplicate IDs, missing dependencies and cycles", async () => {
  const { app, feature, tasks, base } = await setup();
  tasks.create(base);
  tasks.create({ ...base, dependencies: ["TASK-0001"] });
  const repository = await app.make(LedgerRepository);
  const raw = JSON.parse(readFileSync(feature.ledger, "utf8"));
  for (const mutate of [
    (items: any[]) => {
      items[0].id = "TASK-0000";
    },
    (items: any[]) => {
      items[1].id = items[0].id;
    },
    (items: any[]) => {
      items[0].status = "invalid";
    },
    (items: any[]) => {
      items[0].editPaths = ["../unsafe"];
    },
    (items: any[]) => {
      items[0].dependencies = ["TASK-9999"];
    },
    (items: any[]) => {
      items[0].dependencies = ["TASK-0002"];
    },
  ]) {
    const invalid = structuredClone(raw);
    mutate(invalid.tickets[0].tasks);
    expect(() => repository.validateLedger(invalid, feature.feature)).toThrow();
  }
  expect(repository.validateLedger(raw, feature.feature)).toEqual(raw);
});

test("ledger validation allows a missing task worktree only for submitted assignments", async () => {
  const { app, feature, tasks, base } = await setup();
  tasks.create(base);
  const repository = await app.make(LedgerRepository);
  const raw = JSON.parse(readFileSync(feature.ledger, "utf8"));
  const assignment = {
    id: "assignment-1",
    controller: "controller",
    worker: "worker",
    report: join(feature.workspace, "reports", "T-0001-TASK-0001-assignment-1.md"),
    assignedAt: "2026-01-01T00:00:00.000Z",
  };
  const withTask = (status: string, value: Record<string, unknown>) => {
    const ledger = structuredClone(raw);
    Object.assign(ledger.tickets[0].tasks[0], { status, assignment: value });
    return ledger;
  };
  const submitted = {
    ...assignment,
    submittedAt: "2026-01-01T01:00:00.000Z",
    reportSha256: "a".repeat(64),
  };

  const relocated = withTask("submitted", submitted);
  expect(repository.validateLedger(relocated, feature.feature)).toEqual(relocated);
  expect(() =>
    repository.validateLedger(
      withTask("submitted", { ...submitted, worktree: "relative/worktree" }),
      feature.feature,
    ),
  ).toThrow("Invalid task assignment.");
  expect(() =>
    repository.validateLedger(withTask("assigned", assignment), feature.feature),
  ).toThrow("Invalid task assignment.");
  const active = withTask("assigned", { ...assignment, worktree: join(feature.workspace, "..") });
  expect(repository.validateLedger(active, feature.feature)).toEqual(active);
});

test("CLI creates and updates definitions and rejects invalid commands without writes", async () => {
  const { repo, feature } = await setup();
  const cli = (...args: string[]) =>
    runCli(repo, ["--json", "sdd", "task", ...args], process.env.PATH ?? "");
  const selection = ["--feature", feature.workspace, "--ticket", "T-0001", "--actor", "controller"];
  const created = cli(
    "create",
    ...selection,
    "--title",
    "CLI task",
    "--instructions",
    "Do it",
    "--acceptance-criteria",
    "First",
    "Second",
    "--edit-paths",
    "src/index.ts",
    "--reference-paths",
    "docs/guide.md",
  );
  expect(cliOutput(created)).toEqual({ ticket: "T-0001", task: "TASK-0001" });
  const updated = cli(
    "update",
    ...selection,
    "--task",
    "TASK-0001",
    "--title",
    "New title",
    "--clear-edit-paths",
  );
  expect(cliOutput(updated)).toEqual({ ticket: "T-0001", task: "TASK-0001" });
  const record = JSON.parse(readFileSync(feature.ledger, "utf8")).tickets[0].tasks[0];
  expect(record).toMatchObject({
    title: "New title",
    instructions: "Do it",
    acceptanceCriteria: ["First", "Second"],
    editPaths: [],
    createPaths: [],
    referencePaths: ["docs/guide.md"],
    dependencies: [],
    status: "unassigned",
  });
  const before = readFileSync(feature.ledger, "utf8");
  for (const result of [
    cli("create", ...selection, "--title", "Missing fields"),
    cli("update", ...selection, "--task", "TASK-0001", "--create-paths", "../bad"),
    cli("update", ...selection, "--task", "TASK-0001", "--edit-paths", "a", "--clear-edit-paths"),
  ]) {
    expect(result.status).not.toBe(0);
    expect(result.stderr).not.toBe("");
    expect(readFileSync(feature.ledger, "utf8")).toBe(before);
  }
});

test("assignment returns a complete handoff and instructions are read-only", async () => {
  const { feature, tasks, base } = await setup();
  prepareTaskController(feature);
  tasks.create(base);
  const handoff = tasks.assign({
    spec: base.spec,
    ticket: base.ticket,
    task: "TASK-0001",
    author: "controller",
    worker: "worker-one",
  });

  expect(handoff).toMatchObject({
    ticket: "T-0001",
    task: "TASK-0001",
    objective: base.instructions,
    acceptanceCriteria: base.acceptanceCriteria,
    parentTicket: {
      requirements: "Parent requirement for the handoff.",
      acceptanceCriteria: "- Parent criterion one.\n- Parent criterion two.",
    },
    editPaths: base.editPaths,
    createPaths: base.createPaths,
    referencePaths: base.referencePaths,
    sharedTicketWorktree: join(feature.workspace, "..", "shared-ticket-worktree"),
    assignment: {
      controller: "controller",
      worker: "worker-one",
    },
  });
  expect(handoff.reportDestination).toMatch(
    new RegExp(`/reports/T-0001-TASK-0001-${handoff.assignment.id}\\.md$`),
  );
  const beforeInstructions = readFileSync(feature.ledger, "utf8");
  expect(
    tasks.instructions({
      spec: base.spec,
      ticket: base.ticket,
      task: "TASK-0001",
    }),
  ).toEqual(handoff);
  expect(readFileSync(feature.ledger, "utf8")).toBe(beforeInstructions);
});

test("assignment waits for accepted dependencies and succeeds after their reservations release", async () => {
  const { feature, tasks, base } = await setup();
  prepareTaskController(feature);
  tasks.create(base);
  tasks.create({
    ...base,
    title: "Dependent task",
    dependencies: ["TASK-0001"],
  });
  const assign = (task: string) =>
    tasks.assign({
      spec: base.spec,
      ticket: base.ticket,
      task,
      author: "controller",
      worker: `worker-${task}`,
    });

  expect(() => assign("TASK-0002")).toThrow(
    "Task TASK-0002 is unavailable for assignment: dependency TASK-0001 is unassigned, not accepted.",
  );
  const prerequisite = assign("TASK-0001");
  writeFileSync(prerequisite.reportDestination, "Prerequisite report.");
  tasks.submit({
    spec: base.spec,
    ticket: base.ticket,
    task: "TASK-0001",
    assignment: prerequisite.assignment.id,
    author: "controller",
  });
  tasks.accept({
    spec: base.spec,
    ticket: base.ticket,
    task: "TASK-0001",
    assignment: prerequisite.assignment.id,
    author: "controller",
  });

  expect(assign("TASK-0002").task).toBe("TASK-0002");
});

test("active assigned, submitted, and changes-requested tasks reserve edit and create paths", async () => {
  for (const status of ["assigned", "submitted", "changes-requested"] as const) {
    const { feature, tasks, base } = await setup();
    prepareTaskController(feature);
    tasks.create(base);
    tasks.create({
      ...base,
      title: "Create-path conflict",
      editPaths: [],
      createPaths: ["src/index.ts"],
    });
    tasks.create({
      ...base,
      title: "Reserved create-path conflict",
      editPaths: ["tests/new.test.ts"],
      createPaths: [],
    });
    const reservation = tasks.assign({
      spec: base.spec,
      ticket: base.ticket,
      task: "TASK-0001",
      author: "controller",
      worker: "worker-one",
    });
    if (status !== "assigned") {
      writeFileSync(reservation.reportDestination, "Reserved task report.");
      tasks.submit({
        spec: base.spec,
        ticket: base.ticket,
        task: "TASK-0001",
        assignment: reservation.assignment.id,
        author: "controller",
      });
    }
    if (status === "changes-requested") {
      tasks.requestChanges({
        spec: base.spec,
        ticket: base.ticket,
        task: "TASK-0001",
        assignment: reservation.assignment.id,
        author: "controller",
        details: "Keep the reservation while changes are pending.",
      });
    }

    for (const [task, path] of [
      ["TASK-0002", "src/index.ts"],
      ["TASK-0003", "tests/new.test.ts"],
    ]) {
      expect(() =>
        tasks.assign({
          spec: base.spec,
          ticket: base.ticket,
          task,
          author: "controller",
          worker: `worker-${task}`,
        }),
      ).toThrow(
        `Task ${task} cannot be assigned: path "${path}" is reserved by active task TASK-0001.`,
      );
    }
  }
});

test("active task scopes cannot change and rejected updates leave the ledger unchanged", async () => {
  for (const status of ["assigned", "submitted", "changes-requested"] as const) {
    const { feature, tasks, base } = await setup();
    prepareTaskController(feature);
    tasks.create(base);
    tasks.create({
      ...base,
      title: "Second task",
      editPaths: ["src/second.ts"],
      createPaths: ["tests/second.test.ts"],
    });
    tasks.assign({
      spec: base.spec,
      ticket: base.ticket,
      task: "TASK-0001",
      author: "controller",
      worker: "worker-one",
    });
    const second = tasks.assign({
      spec: base.spec,
      ticket: base.ticket,
      task: "TASK-0002",
      author: "controller",
      worker: "worker-two",
    });
    if (status !== "assigned") {
      writeFileSync(second.reportDestination, "Reserved task report.");
      tasks.submit({
        spec: base.spec,
        ticket: base.ticket,
        task: "TASK-0002",
        assignment: second.assignment.id,
        author: "controller",
      });
    }
    if (status === "changes-requested") {
      tasks.requestChanges({
        spec: base.spec,
        ticket: base.ticket,
        task: "TASK-0002",
        assignment: second.assignment.id,
        author: "controller",
        details: "Keep the reservation while changes are pending.",
      });
    }

    const before = readFileSync(feature.ledger, "utf8");
    expect(() =>
      tasks.update({
        spec: base.spec,
        ticket: base.ticket,
        author: base.author,
        task: "TASK-0002",
        editPaths: ["src/index.ts"],
      }),
    ).toThrow(`Task TASK-0002 cannot change edit/create paths while active (${status}).`);
    expect(readFileSync(feature.ledger, "utf8")).toBe(before);
    expect(() =>
      tasks.update({
        spec: base.spec,
        ticket: base.ticket,
        author: base.author,
        task: "TASK-0002",
        createPaths: ["tests/new.test.ts"],
      }),
    ).toThrow(`Task TASK-0002 cannot change edit/create paths while active (${status}).`);
    expect(readFileSync(feature.ledger, "utf8")).toBe(before);
  }
});

test("unassigned and accepted tasks can update edit and create paths", async () => {
  const { feature, tasks, base } = await setup();
  tasks.create(base);
  tasks.update({
    spec: base.spec,
    ticket: base.ticket,
    author: base.author,
    task: "TASK-0001",
    editPaths: ["src/unassigned.ts"],
    createPaths: [],
  });

  prepareTaskController(feature);
  const assignment = tasks.assign({
    spec: base.spec,
    ticket: base.ticket,
    task: "TASK-0001",
    author: "controller",
    worker: "worker-one",
  });
  writeFileSync(assignment.reportDestination, "Task report.");
  tasks.submit({
    spec: base.spec,
    ticket: base.ticket,
    task: "TASK-0001",
    assignment: assignment.assignment.id,
    author: "controller",
  });
  tasks.accept({
    spec: base.spec,
    ticket: base.ticket,
    task: "TASK-0001",
    assignment: assignment.assignment.id,
    author: "controller",
  });
  tasks.update({
    spec: base.spec,
    ticket: base.ticket,
    author: base.author,
    task: "TASK-0001",
    editPaths: ["src/accepted.ts"],
    createPaths: ["tests/accepted.test.ts"],
  });

  const task = JSON.parse(readFileSync(feature.ledger, "utf8")).tickets[0].tasks[0];
  expect(task).toMatchObject({
    status: "accepted",
    editPaths: ["src/accepted.ts"],
    createPaths: ["tests/accepted.test.ts"],
  });
});

test("disjoint write paths can be assigned when reference paths are shared", async () => {
  const { feature, tasks, base } = await setup();
  prepareTaskController(feature);
  tasks.create(base);
  tasks.create({
    ...base,
    title: "Second task",
    editPaths: ["src/second.ts"],
    createPaths: ["tests/second.test.ts"],
  });

  expect(
    tasks.assign({
      spec: base.spec,
      ticket: base.ticket,
      task: "TASK-0001",
      author: "controller",
      worker: "worker-one",
    }).task,
  ).toBe("TASK-0001");
  expect(
    tasks.assign({
      spec: base.spec,
      ticket: base.ticket,
      task: "TASK-0002",
      author: "controller",
      worker: "worker-two",
    }).task,
  ).toBe("TASK-0002");
});

test("dependency updates that create a cycle are rejected without changing the ledger", async () => {
  const { feature, tasks, base } = await setup();
  tasks.create(base);
  tasks.create({ ...base, dependencies: ["TASK-0001"] });
  const before = readFileSync(feature.ledger, "utf8");

  expect(() =>
    tasks.update({
      spec: base.spec,
      ticket: base.ticket,
      author: base.author,
      task: "TASK-0001",
      dependencies: ["TASK-0002"],
    }),
  ).toThrow(/Task dependency cycle/);
  expect(readFileSync(feature.ledger, "utf8")).toBe(before);
});

test("task report submission, acceptance, changes-requested, and reassignment preserve details", async () => {
  const { feature, tasks, base } = await setup();
  prepareTaskController(feature);
  tasks.create(base);
  const first = tasks.assign({
    spec: base.spec,
    ticket: base.ticket,
    task: "TASK-0001",
    author: "controller",
    worker: "worker-one",
  });
  writeFileSync(first.reportDestination, "Worker one report.");
  const submission = tasks.submit({
    spec: base.spec,
    ticket: base.ticket,
    task: "TASK-0001",
    assignment: first.assignment.id,
    author: "controller",
  });
  expect(submission.status).toBe("submitted");
  expect(submission.assignment).toMatchObject({
    id: first.assignment.id,
    worker: "worker-one",
    worktree: first.sharedTicketWorktree,
    report: first.reportDestination,
    submittedBy: "controller",
  });
  let task = JSON.parse(readFileSync(feature.ledger, "utf8")).tickets[0].tasks[0];
  expect(task.status).toBe("submitted");
  expect(task.assignment).toMatchObject(submission.assignment);

  expect(
    tasks.accept({
      spec: base.spec,
      ticket: base.ticket,
      task: "TASK-0001",
      assignment: first.assignment.id,
      author: "controller",
    }).status,
  ).toBe("accepted");
  task = JSON.parse(readFileSync(feature.ledger, "utf8")).tickets[0].tasks[0];
  expect(task).toMatchObject({
    status: "accepted",
    assignment: { id: first.assignment.id, worker: "worker-one" },
    review: { result: "accepted", controller: "controller" },
  });

  tasks.create({ ...base, title: "Needs revision" });
  const second = tasks.assign({
    spec: base.spec,
    ticket: base.ticket,
    task: "TASK-0002",
    author: "controller",
    worker: "worker-two",
  });
  writeFileSync(second.reportDestination, "Worker two initial report.");
  tasks.submit({
    spec: base.spec,
    ticket: base.ticket,
    task: "TASK-0002",
    assignment: second.assignment.id,
    author: "controller",
  });
  expect(
    tasks.requestChanges({
      spec: base.spec,
      ticket: base.ticket,
      task: "TASK-0002",
      assignment: second.assignment.id,
      author: "controller",
      details: "Please address the missing case.",
    }).status,
  ).toBe("changes-requested");
  const reassigned = tasks.assign({
    spec: base.spec,
    ticket: base.ticket,
    task: "TASK-0002",
    author: "controller",
    worker: "worker-three",
  });
  expect(reassigned.assignment.id).not.toBe(second.assignment.id);
  expect(reassigned.reportDestination).not.toBe(second.reportDestination);
  task = JSON.parse(readFileSync(feature.ledger, "utf8")).tickets[0].tasks[1];
  expect(task).toMatchObject({
    status: "assigned",
    assignment: { worker: "worker-three" },
    assignmentHistory: [
      { id: second.assignment.id, worker: "worker-two", report: second.reportDestination },
    ],
    reviewHistory: [{ result: "changes-requested", details: "Please address the missing case." }],
  });
});

test("worker identities cannot mutate task workflow state or change the ledger", async () => {
  const { feature, tasks, base } = await setup();
  prepareTaskController(feature);
  tasks.create(base);
  const handoff = tasks.assign({
    spec: base.spec,
    ticket: base.ticket,
    task: "TASK-0001",
    author: "controller",
    worker: "worker-one",
  });
  const before = readFileSync(feature.ledger, "utf8");
  const selection = {
    spec: base.spec,
    ticket: base.ticket,
    task: "TASK-0001",
    author: "worker-one",
    assignment: handoff.assignment.id,
  };
  expect(() => tasks.submit(selection)).toThrow(/Worker identities cannot change/);
  expect(() => tasks.accept(selection)).toThrow(/Worker identities cannot change/);
  expect(() => tasks.requestChanges({ ...selection, details: "Change this." })).toThrow(
    /Worker identities cannot change/,
  );
  expect(() =>
    tasks.assign({
      spec: base.spec,
      ticket: base.ticket,
      task: "TASK-0001",
      author: "worker-one",
      worker: "worker-two",
    }),
  ).toThrow(/Worker identities cannot change/);
  expect(readFileSync(feature.ledger, "utf8")).toBe(before);
});

test("CLI exposes handoff, report, review, reassignment, and worker authorization", async () => {
  const { repo, feature } = await setup();
  prepareTaskController(feature);
  const cli = (...args: string[]) =>
    runCli(repo, ["--json", "sdd", "task", ...args], process.env.PATH ?? "");
  const selection = ["--feature", feature.workspace, "--ticket", "T-0001"];
  const created = cli(
    "create",
    ...selection,
    "--actor",
    "controller",
    "--title",
    "CLI lifecycle",
    "--instructions",
    "Exercise the task lifecycle.",
    "--acceptance-criteria",
    "CLI handoff works",
    "--edit-paths",
    "src/index.ts",
  );
  expect(cliOutput(created).task).toBe("TASK-0001");
  const assigned = cli(
    "assign",
    ...selection,
    "--task",
    "TASK-0001",
    "--worker",
    "worker-one",
    "--actor",
    "controller",
  );
  const handoff = cliOutput(assigned);
  expect(handoff).toMatchObject({
    objective: "Exercise the task lifecycle.",
    editPaths: ["src/index.ts"],
    assignment: { worker: "worker-one" },
  });

  const beforeInstructions = readFileSync(feature.ledger, "utf8");
  expect(cliOutput(cli("instructions", ...selection, "--task", "TASK-0001"))).toEqual(handoff);
  expect(readFileSync(feature.ledger, "utf8")).toBe(beforeInstructions);

  writeFileSync(handoff.reportDestination, "CLI worker report.");
  const workerAttempt = cli(
    "submit",
    ...selection,
    "--task",
    "TASK-0001",
    "--assignment",
    handoff.assignment.id,
    "--actor",
    "worker-one",
  );
  expect(workerAttempt.status).not.toBe(0);
  expect(readFileSync(feature.ledger, "utf8")).toBe(beforeInstructions);

  expect(
    cliOutput(
      cli(
        "submit",
        ...selection,
        "--task",
        "TASK-0001",
        "--assignment",
        handoff.assignment.id,
        "--actor",
        "controller",
      ),
    ).status,
  ).toBe("submitted");
  expect(
    cliOutput(
      cli(
        "request-changes",
        ...selection,
        "--task",
        "TASK-0001",
        "--assignment",
        handoff.assignment.id,
        "--details",
        "Please revise the output.",
        "--actor",
        "controller",
      ),
    ).status,
  ).toBe("changes-requested");
  const reassigned = cli(
    "assign",
    ...selection,
    "--task",
    "TASK-0001",
    "--worker",
    "worker-two",
    "--actor",
    "controller",
  );
  const secondHandoff = cliOutput(reassigned);
  expect(secondHandoff.assignment.worker).toBe("worker-two");
  expect(secondHandoff.reportDestination).not.toBe(handoff.reportDestination);
  writeFileSync(secondHandoff.reportDestination, "Revised CLI report.");
  expect(
    cliOutput(
      cli(
        "submit",
        ...selection,
        "--task",
        "TASK-0001",
        "--assignment",
        secondHandoff.assignment.id,
        "--actor",
        "controller",
      ),
    ).status,
  ).toBe("submitted");
  expect(
    cliOutput(
      cli(
        "accept",
        ...selection,
        "--task",
        "TASK-0001",
        "--assignment",
        secondHandoff.assignment.id,
        "--actor",
        "controller",
      ),
    ).status,
  ).toBe("accepted");
});
