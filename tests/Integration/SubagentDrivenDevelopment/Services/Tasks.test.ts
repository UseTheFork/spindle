import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { TaskCreateOptions } from "@spindle/SubagentDrivenDevelopment/Models/Options";
import { LedgerRepository } from "@spindle/SubagentDrivenDevelopment/Persistence/LedgerRepository";
import { TaskService } from "@spindle/SubagentDrivenDevelopment/Services/TaskService";
import { runCli } from "@test/Helpers/Cli";
import { cliOutput } from "@test/Helpers/SubagentDrivenDevelopment/helpers";
import {
  createTicket,
  ticketFixture,
} from "@test/Helpers/SubagentDrivenDevelopment/ticket-helpers";
import { expect, test } from "vitest";

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

test("create and update persist only task fields, with IDs local to each ticket", async () => {
  const { feature, tasks, base } = await setup();
  const ticketPath = join(feature.workspace, "tickets", "T-0001.md");
  const ticketBefore = readFileSync(ticketPath, "utf8");
  expect(tasks.create(base)).toEqual({ ticket: "T-0001", task: "TASK-0001" });
  expect(tasks.create({ ...base, dependencies: ["TASK-0001"] }).task).toBe("TASK-0002");
  expect(tasks.create({ ...base, ticket: "T-0002" }).task).toBe("TASK-0001");

  const before = JSON.parse(readFileSync(feature.ledger, "utf8"));
  expect(before.schemaVersion).toBe(3);
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
    { ...base, createPaths: ["/absolute"] },
    { ...base, referencePaths: ["src/*.ts"] },
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
