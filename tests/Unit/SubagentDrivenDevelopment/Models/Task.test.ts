import { taskSchema } from "@spindle/SubagentDrivenDevelopment/Models/Task";
import { expect, test } from "vitest";

const task = {
  id: "T-0002.1",
  instructions: "Implement the schema and satisfy its criteria.",
  writeScope: ["src/Models/Schema.ts"],
  dependencies: [],
  state: "Pending",
  attempt: 0,
};

test.each(["/src/file.ts", "../file.ts", "src/", "src/*.ts", "C:/file.ts"])(
  "rejects invalid write scope path %s",
  (path) => {
    expect(taskSchema.safeParse({ ...task, writeScope: [path] }).success).toBe(false);
  },
);

test("requires a write scope and a dispatch attempt for started tasks", () => {
  expect(taskSchema.safeParse({ ...task, writeScope: [] }).success).toBe(false);
  expect(taskSchema.safeParse({ ...task, state: "InProgress" }).success).toBe(false);
  expect(taskSchema.safeParse({ ...task, state: "Done", attempt: 2 }).success).toBe(true);
});
