import { isAbsolute, win32 } from "node:path";

import { TASK_ID, TASK_STATUSES } from "@spindle/SubagentDrivenDevelopment/Models/Tasks";
import type { TaskDefinition } from "@spindle/SubagentDrivenDevelopment/Models/Tasks";
import { Records } from "@spindle/Support/Records";

export class TaskSchema {
  public static isPath(value: unknown): value is string {
    return (
      typeof value === "string" &&
      value.length > 0 &&
      value === value.trim() &&
      !isAbsolute(value) &&
      !win32.isAbsolute(value) &&
      !value.startsWith("!") &&
      // eslint-disable-next-line no-control-regex -- Control characters are invalid in task paths.
      !/[\u0000-\u001f\u007f\\:*?[\]{}]/.test(value) &&
      !/[!+@]\(/.test(value) &&
      value.split("/").every((part) => part !== "" && part !== "." && part !== "..")
    );
  }

  public static validate(tasks: unknown): asserts tasks is TaskDefinition[] {
    if (!Array.isArray(tasks)) throw new Error("Tasks must be an array.");
    const ids = new Set<string>();
    for (const task of tasks) {
      if (!Records.isRecord(task)) throw new Error("Task definition must be an object.");
      const match = typeof task.id === "string" ? TASK_ID.exec(task.id) : null;
      if (!match || BigInt(match[1]!) === 0n) throw new Error("Invalid task ID.");
      if (ids.has(task.id as string)) throw new Error(`Duplicate task ID: ${task.id}.`);
      ids.add(task.id as string);
      if (typeof task.title !== "string" || !task.title.trim())
        throw new Error("Task title must not be empty.");
      if (typeof task.instructions !== "string" || !task.instructions.trim())
        throw new Error("Task instructions must not be empty.");
      if (
        !Array.isArray(task.acceptanceCriteria) ||
        task.acceptanceCriteria.length === 0 ||
        !task.acceptanceCriteria.every((item) => typeof item === "string" && !!item.trim())
      ) {
        throw new Error("Task acceptance criteria must be a non-empty list of non-empty strings.");
      }
      for (const field of ["editPaths", "createPaths", "referencePaths"] as const) {
        const paths = task[field];
        if (!Array.isArray(paths) || !paths.every(TaskSchema.isPath)) {
          throw new Error(`Task ${field} must contain explicit repository-relative paths.`);
        }
        if (new Set(paths).size !== paths.length) throw new Error(`Duplicate task ${field}.`);
      }
      if (
        !Array.isArray(task.dependencies) ||
        !task.dependencies.every((id) => typeof id === "string" && TASK_ID.test(id)) ||
        new Set(task.dependencies).size !== task.dependencies.length
      ) {
        throw new Error("Task dependencies must be unique task IDs.");
      }
      if (!TASK_STATUSES.some((status) => status === task.status)) {
        throw new Error("Invalid task status.");
      }
    }

    const definitions = tasks as TaskDefinition[];
    const byId = new Map(definitions.map((task) => [task.id, task]));
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (task: TaskDefinition): void => {
      if (visiting.has(task.id)) throw new Error(`Task dependency cycle involving ${task.id}.`);
      if (visited.has(task.id)) return;
      visiting.add(task.id);
      for (const dependency of task.dependencies) {
        const target = byId.get(dependency);
        if (!target)
          throw new Error(`Task dependency ${dependency} does not exist in this ticket.`);
        visit(target);
      }
      visiting.delete(task.id);
      visited.add(task.id);
    };
    for (const task of definitions) visit(task);
  }
}
