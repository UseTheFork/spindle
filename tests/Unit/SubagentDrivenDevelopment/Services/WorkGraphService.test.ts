import { Application } from "@spindle/Foundation/Application";
import type { Feature } from "@spindle/SubagentDrivenDevelopment/Models/Feature";
import type { Task } from "@spindle/SubagentDrivenDevelopment/Models/Task";
import type { Ticket } from "@spindle/SubagentDrivenDevelopment/Models/Ticket";
import { WorkGraphService } from "@spindle/SubagentDrivenDevelopment/Services/WorkGraphService";
import { SubagentDrivenDevelopmentServiceProvider } from "@spindle/SubagentDrivenDevelopment/SubagentDrivenDevelopmentServiceProvider";
import { beforeAll, describe, expect, test } from "vitest";

let workGraph: WorkGraphService;

beforeAll(async () => {
  const app = new Application({ basePath: "/workspace" });
  app.register(SubagentDrivenDevelopmentServiceProvider);
  await app.boot();
  workGraph = await app.make(WorkGraphService);
});

const task = (id: string, overrides: Partial<Task> = {}): Task => ({
  id,
  instructions: "Complete the task.",
  writeScope: [`src/${id}.ts`],
  dependencies: [],
  state: "Pending",
  attempt: 0,
  ...overrides,
});

const ticket = (id: string, overrides: Partial<Ticket> = {}): Ticket => ({
  id,
  title: "Ticket",
  requirements: "Requirements",
  acceptanceCriteria: "Criteria",
  dependencies: [],
  tasks: [],
  workRoundCommits: [],
  merged: false,
  ...overrides,
});

const feature = (tickets: Ticket[]): Feature => ({
  name: "0001-example",
  specification: "Specification",
  tickets,
  findings: [],
  reviewRounds: [],
});

test("registers a booted singleton that requires a booted application", async () => {
  const app = new Application({ basePath: "/workspace" });
  app.register(SubagentDrivenDevelopmentServiceProvider);
  const service = await app.make(WorkGraphService);

  expect(service.isBooted).toBe(true);
  expect(() => service.validate(feature([]))).toThrow("application has booted");
  await app.boot();
  expect(await app.make(WorkGraphService)).toBe(service);
  expect(service.validate(feature([]))).toEqual([]);
});

describe("work graph validation", () => {
  test("rejects duplicate IDs, wrong task ownership, and missing dependencies", () => {
    const graph = feature([
      ticket("T-0001", {
        dependencies: ["T-9999"],
        tasks: [
          task("T-0001.1", { dependencies: ["T-0002.1"] }),
          task("T-0001.1"),
          task("T-0002.1"),
        ],
      }),
      ticket("T-0001"),
    ]);

    expect(workGraph.validate(graph)).toEqual(
      expect.arrayContaining([
        { code: "duplicate-ticket", ticketId: "T-0001" },
        { code: "duplicate-task", ticketId: "T-0001", taskId: "T-0001.1" },
        { code: "task-ticket-mismatch", ticketId: "T-0001", taskId: "T-0002.1" },
        { code: "unknown-ticket-dependency", ticketId: "T-0001", dependencyId: "T-9999" },
      ]),
    );
    const crossTicket = feature([
      ticket("T-0001", { tasks: [task("T-0001.1", { dependencies: ["T-0002.1"] })] }),
      ticket("T-0002", { tasks: [task("T-0002.1")] }),
    ]);
    expect(workGraph.validate(crossTicket)).toContainEqual({
      code: "unknown-task-dependency",
      taskId: "T-0001.1",
      dependencyId: "T-0002.1",
    });
    expect(() => workGraph.readiness(crossTicket)).toThrow("unknown-task-dependency");
  });

  test("detects ticket and task dependency cycles", () => {
    const graph = feature([
      ticket("T-0001", {
        dependencies: ["T-0002"],
        tasks: [
          task("T-0001.1", { dependencies: ["T-0001.2"] }),
          task("T-0001.2", { dependencies: ["T-0001.1"] }),
        ],
      }),
      ticket("T-0002", { dependencies: ["T-0001"], tasks: [task("T-0002.1")] }),
    ]);
    expect(workGraph.validate(graph)).toEqual(
      expect.arrayContaining([
        { code: "ticket-dependency-cycle", ticketId: "T-0001" },
        { code: "ticket-dependency-cycle", ticketId: "T-0002" },
        { code: "task-dependency-cycle", taskId: "T-0001.1" },
        { code: "task-dependency-cycle", taskId: "T-0001.2" },
      ]),
    );
  });

  test("rejects unordered overlapping scopes and accepts transitive ordering", () => {
    const first = task("T-0001.1", { writeScope: ["src/shared.ts"] });
    const middle = task("T-0001.2", { dependencies: ["T-0001.1"] });
    const last = task("T-0001.3", { writeScope: ["src/shared.ts"] });
    const graph = feature([ticket("T-0001", { tasks: [first, middle, last] })]);
    expect(workGraph.validate(graph)).toContainEqual({
      code: "unordered-write-conflict",
      ticketId: "T-0001",
      taskId: "T-0001.1",
      conflictingTaskId: "T-0001.3",
      paths: ["src/shared.ts"],
    });
    last.dependencies = ["T-0001.2"];
    expect(workGraph.validate(graph)).toEqual([]);
  });
});

describe("work graph readiness", () => {
  test("reports ticket and task prerequisites and unblocks dependent work", () => {
    const first = ticket("T-0001", { tasks: [task("T-0001.1")] });
    const second = ticket("T-0002", {
      dependencies: ["T-0001"],
      tasks: [
        task("T-0002.1"),
        task("T-0002.2", { dependencies: ["T-0002.1"] }),
        task("T-0002.3", { dependencies: ["T-0002.1"] }),
      ],
    });
    const graph = feature([first, second, ticket("T-0003")]);
    const before = workGraph.readiness(graph);
    expect(before.tickets[0]).toMatchObject({ ready: true });
    expect(before.tickets[1].blockers).toContainEqual({
      code: "dependency-not-merged",
      dependencyId: "T-0001",
    });
    expect(before.tickets[1].tasks[1].blockers).toEqual(
      expect.arrayContaining([
        { code: "no-worktree" },
        { code: "ticket-dependency-not-merged", dependencyId: "T-0001" },
        { code: "dependency-not-done", dependencyId: "T-0002.1" },
      ]),
    );
    expect(before.tickets[2].blockers).toContainEqual({ code: "no-tasks" });

    first.merged = true;
    second.worktree = "/worktrees/T-0002";
    second.tasks[0].state = "Done";
    second.tasks[0].attempt = 1;
    const after = workGraph.readiness(graph);
    expect(after.tickets[0].blockers).toContainEqual({ code: "merged" });
    expect(after.tickets[1].blockers).toContainEqual({
      code: "task-started",
      taskId: "T-0002.1",
    });
    expect(after.tickets[1].tasks.map((item) => item.ready)).toEqual([false, true, true]);
  });

  test("blocks task dispatch while a ticket review is in progress", () => {
    const graph = feature([
      ticket("T-0001", {
        worktree: "/worktrees/T-0001",
        tasks: [task("T-0001.1"), task("T-0001.2")],
      }),
    ]);
    graph.reviewRounds.push({
      target: { type: "ticket", ticketId: "T-0001" },
      codeRevision: "revision",
      reviews: [
        { id: "R-1", targetWorktree: "/worktrees/T-0001", scope: "diff", findingsToVerify: [] },
      ],
    });
    const tasks = workGraph.readiness(graph).tickets[0].tasks;
    expect(tasks[0].blockers).toEqual([{ code: "review-in-progress" }]);
    expect(tasks[1].blockers).toEqual([{ code: "review-in-progress" }]);
    graph.reviewRounds[0].reviews[0].result = { recommendation: "pass", findingIds: [] };
    expect(workGraph.readiness(graph).tickets[0].tasks.map((item) => item.ready)).toEqual([
      true,
      true,
    ]);
  });

  test("blocks task readiness until a ticket review finding has a decision", () => {
    const graph = feature([
      ticket("T-0001", { worktree: "/worktrees/T-0001", tasks: [task("T-0001.1")] }),
    ]);
    graph.reviewRounds.push({
      target: { type: "ticket", ticketId: "T-0001" },
      codeRevision: "revision",
      reviews: [
        {
          id: "R-1",
          targetWorktree: "/worktrees/T-0001",
          scope: "diff",
          findingsToVerify: [],
          result: { recommendation: "changes-required", findingIds: ["F-1"] },
        },
      ],
    });
    graph.findings.push({
      type: "review",
      id: "F-1",
      reviewId: "R-1",
      title: "Missing behavior",
      severity: "high",
      location: "src/file.ts",
      criterion: "Criterion",
      evidence: "Evidence",
      suggestedFix: "Fix",
      decision: { status: "open" },
    });
    expect(workGraph.readiness(graph).tickets[0].tasks[0].blockers).toContainEqual({
      code: "undecided-finding",
      findingId: "F-1",
    });
    expect(workGraph.readiness(graph).tickets[0].blockers).toContainEqual({
      code: "undecided-finding",
      findingId: "F-1",
    });
    const finding = graph.findings[0];
    if (finding.type !== "review") throw new Error("Expected review finding");
    finding.fixWork = { type: "task", taskId: "T-0001.1" };
    expect(workGraph.readiness(graph).tickets[0].tasks[0].ready).toBe(true);
  });
});
