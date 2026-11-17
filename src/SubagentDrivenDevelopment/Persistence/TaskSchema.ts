import { isAbsolute, win32 } from "node:path";

import { TASK_ID, TASK_STATUSES } from "@spindle/SubagentDrivenDevelopment/Models/Tasks";
import type {
  TaskAssignment,
  TaskDefinition,
  TaskReview,
} from "@spindle/SubagentDrivenDevelopment/Models/Tasks";
import { Records } from "@spindle/Support/Records";

export class TaskSchema {
  private static isDate(value: unknown): value is string {
    return typeof value === "string" && Number.isFinite(Date.parse(value));
  }

  private static validateAssignment(value: unknown): asserts value is TaskAssignment {
    if (
      !Records.isRecord(value) ||
      typeof value.id !== "string" ||
      !value.id.trim() ||
      typeof value.controller !== "string" ||
      !value.controller.trim() ||
      typeof value.worker !== "string" ||
      !value.worker.trim() ||
      // Finished ledgers keep a submitted assignment's execution location in the finish journal.
      ((Object.hasOwn(value, "worktree") || !Object.hasOwn(value, "submittedAt")) &&
        (typeof value.worktree !== "string" || !isAbsolute(value.worktree))) ||
      typeof value.report !== "string" ||
      !isAbsolute(value.report) ||
      !TaskSchema.isDate(value.assignedAt)
    ) {
      throw new Error("Invalid task assignment.");
    }
    if (
      Object.hasOwn(value, "submittedAt") !== Object.hasOwn(value, "reportSha256") ||
      (Object.hasOwn(value, "submittedAt") && !TaskSchema.isDate(value.submittedAt)) ||
      (Object.hasOwn(value, "submittedBy") &&
        (typeof value.submittedBy !== "string" || !value.submittedBy.trim())) ||
      (Object.hasOwn(value, "reportSha256") &&
        (typeof value.reportSha256 !== "string" || !/^[0-9a-f]{64}$/i.test(value.reportSha256)))
    ) {
      throw new Error("Invalid submitted task assignment.");
    }
  }

  private static validateReview(value: unknown): asserts value is TaskReview {
    if (
      !Records.isRecord(value) ||
      typeof value.assignment !== "string" ||
      !value.assignment.trim() ||
      (value.result !== "accepted" && value.result !== "changes-requested") ||
      typeof value.details !== "string" ||
      !value.details.trim() ||
      typeof value.controller !== "string" ||
      !value.controller.trim() ||
      !TaskSchema.isDate(value.recordedAt)
    ) {
      throw new Error("Invalid task review record.");
    }
  }

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
      if (Object.hasOwn(task, "assignment")) TaskSchema.validateAssignment(task.assignment);
      if (Object.hasOwn(task, "assignmentHistory")) {
        if (!Array.isArray(task.assignmentHistory))
          throw new Error("Invalid task assignment history.");
        for (const assignment of task.assignmentHistory) TaskSchema.validateAssignment(assignment);
      }
      if (Object.hasOwn(task, "review")) TaskSchema.validateReview(task.review);
      if (Object.hasOwn(task, "reviewHistory")) {
        if (!Array.isArray(task.reviewHistory)) throw new Error("Invalid task review history.");
        for (const review of task.reviewHistory) TaskSchema.validateReview(review);
      }
      const assigned = task.status !== "unassigned";
      if (assigned !== Object.hasOwn(task, "assignment")) {
        throw new Error(`Task ${task.id} assignment does not match its status.`);
      }
      if (
        (task.status === "submitted" ||
          task.status === "accepted" ||
          task.status === "changes-requested") &&
        (!Records.isRecord(task.assignment) ||
          !Object.hasOwn(task.assignment, "submittedAt") ||
          !Object.hasOwn(task.assignment, "reportSha256"))
      ) {
        throw new Error(`Task ${task.id} has no submitted report.`);
      }
      if (
        task.status === "assigned" &&
        Records.isRecord(task.assignment) &&
        (Object.hasOwn(task.assignment, "submittedAt") ||
          Object.hasOwn(task.assignment, "reportSha256"))
      ) {
        throw new Error(`Task ${task.id} has a submitted report while assigned.`);
      }
      if (
        (task.status === "accepted" || task.status === "changes-requested") &&
        (!Records.isRecord(task.review) || task.review.result !== task.status)
      ) {
        throw new Error(`Task ${task.id} has no matching controller review.`);
      }
      if (
        Object.hasOwn(task, "review") &&
        (!Records.isRecord(task.assignment) ||
          !Records.isRecord(task.review) ||
          task.review.assignment !== task.assignment.id)
      ) {
        throw new Error(`Task ${task.id} review does not match its assignment.`);
      }
      const assignmentHistory = Array.isArray(task.assignmentHistory) ? task.assignmentHistory : [];
      const assignmentIds = assignmentHistory.map((assignment) =>
        Records.isRecord(assignment) ? assignment.id : undefined,
      );
      if (
        (Records.isRecord(task.assignment) && assignmentIds.includes(task.assignment.id)) ||
        new Set(assignmentIds).size !== assignmentIds.length
      ) {
        throw new Error(`Task ${task.id} has duplicate assignment history.`);
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
