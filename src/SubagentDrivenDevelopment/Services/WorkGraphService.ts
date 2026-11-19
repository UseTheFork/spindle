import { Service } from "@spindle/Foundation/Service";
import type { Feature } from "@spindle/SubagentDrivenDevelopment/Models/Feature";

type GraphNode = { id: string; dependencies: string[] };

type WorkGraphIssue =
  | { code: "duplicate-ticket"; ticketId: string }
  | { code: "duplicate-task"; ticketId: string; taskId: string }
  | { code: "delivery-task-mismatch"; ticketId: string }
  | { code: "task-ticket-mismatch"; ticketId: string; taskId: string }
  | { code: "unknown-ticket-dependency"; ticketId: string; dependencyId: string }
  | { code: "unknown-task-dependency"; taskId: string; dependencyId: string }
  | { code: "ticket-dependency-cycle"; ticketId: string }
  | { code: "task-dependency-cycle"; taskId: string }
  | {
      code: "unordered-write-conflict";
      ticketId: string;
      taskId: string;
      conflictingTaskId: string;
      paths: string[];
    };

type TicketBlocker =
  | { code: "no-tasks" }
  | { code: "dependency-not-merged"; dependencyId: string }
  | { code: "task-started"; taskId: string }
  | { code: "undecided-finding"; findingId: string }
  | { code: "merged" };

type TaskBlocker =
  | { code: "no-worktree" }
  | { code: "no-write-scope" }
  | { code: "ticket-dependency-not-merged"; dependencyId: string }
  | { code: "dependency-not-done"; dependencyId: string }
  | { code: "in-progress" }
  | { code: "done" }
  | { code: "ticket-merged" }
  | { code: "review-in-progress" }
  | { code: "undecided-finding"; findingId: string }
  | { code: "unresolved-conflict"; findingId: string }
  | { code: "worktree-in-use"; taskId: string };

type WorkGraphReadiness = {
  tickets: {
    ticketId: string;
    ready: boolean;
    blockers: TicketBlocker[];
    tasks: {
      taskId: string;
      ready: boolean;
      blockers: TaskBlocker[];
    }[];
  }[];
};

export class WorkGraphService extends Service {
  public validate(feature: Feature): WorkGraphIssue[] {
    this.assertApplicationBooted();
    const issues: WorkGraphIssue[] = [];
    const tickets = new Map<string, GraphNode>();

    for (const ticket of feature.tickets) {
      if (tickets.has(ticket.id)) {
        issues.push({ code: "duplicate-ticket", ticketId: ticket.id });
      } else {
        tickets.set(ticket.id, ticket);
      }

      const tasks = new Map<string, GraphNode>();
      const deliveryTasks = ticket.tasks.filter(({ deliveryMerge }) => deliveryMerge !== undefined);
      if (
        (ticket.delivery === undefined && deliveryTasks.length > 0) ||
        (ticket.delivery !== undefined && deliveryTasks.length !== 1) ||
        (ticket.delivery !== undefined &&
          deliveryTasks[0]?.deliveryMerge?.originalBranch !== ticket.delivery.originalBranch) ||
        deliveryTasks.some(
          ({ deliveryMerge, state }) => state !== "Pending" && !deliveryMerge?.sourceCommit,
        )
      ) {
        issues.push({ code: "delivery-task-mismatch", ticketId: ticket.id });
      }
      for (const task of ticket.tasks) {
        if (tasks.has(task.id)) {
          issues.push({ code: "duplicate-task", ticketId: ticket.id, taskId: task.id });
        } else {
          tasks.set(task.id, task);
        }
        if (!task.id.startsWith(`${ticket.id}.`)) {
          issues.push({ code: "task-ticket-mismatch", ticketId: ticket.id, taskId: task.id });
        }
      }

      for (const task of ticket.tasks) {
        for (const dependencyId of task.dependencies) {
          if (!tasks.has(dependencyId)) {
            issues.push({ code: "unknown-task-dependency", taskId: task.id, dependencyId });
          }
        }
        if (WorkGraphService.dependsOn(tasks, task.id, task.id)) {
          issues.push({ code: "task-dependency-cycle", taskId: task.id });
        }
      }

      for (let i = 0; i < ticket.tasks.length; i++) {
        const task = ticket.tasks[i];
        for (let j = i + 1; j < ticket.tasks.length; j++) {
          const other = ticket.tasks[j];
          const paths = [
            ...new Set(task.writeScope.filter((path) => other.writeScope.includes(path))),
          ];
          if (
            paths.length > 0 &&
            !WorkGraphService.dependsOn(tasks, task.id, other.id) &&
            !WorkGraphService.dependsOn(tasks, other.id, task.id)
          ) {
            issues.push({
              code: "unordered-write-conflict",
              ticketId: ticket.id,
              taskId: task.id,
              conflictingTaskId: other.id,
              paths,
            });
          }
        }
      }
    }

    for (const ticket of feature.tickets) {
      for (const dependencyId of ticket.dependencies) {
        if (!tickets.has(dependencyId)) {
          issues.push({ code: "unknown-ticket-dependency", ticketId: ticket.id, dependencyId });
        }
      }
      if (WorkGraphService.dependsOn(tickets, ticket.id, ticket.id)) {
        issues.push({ code: "ticket-dependency-cycle", ticketId: ticket.id });
      }
    }
    return issues;
  }

  public readiness(feature: Feature): WorkGraphReadiness {
    const issues = this.validate(feature);
    if (issues.length > 0) {
      throw new Error(
        `Cannot determine readiness of an invalid work graph: ${JSON.stringify(issues)}`,
      );
    }

    const tickets = new Map(feature.tickets.map((ticket) => [ticket.id, ticket]));
    return {
      tickets: feature.tickets.map((ticket) => {
        const blockers: TicketBlocker[] = [];
        if (ticket.merged) blockers.push({ code: "merged" });
        if (ticket.tasks.length === 0) blockers.push({ code: "no-tasks" });
        for (const dependencyId of ticket.dependencies) {
          if (!tickets.get(dependencyId)?.merged) {
            blockers.push({ code: "dependency-not-merged", dependencyId });
          }
        }
        for (const task of ticket.tasks) {
          if (task.state !== "Pending") blockers.push({ code: "task-started", taskId: task.id });
        }

        const tasks = new Map(ticket.tasks.map((task) => [task.id, task]));
        const reviewInProgress = feature.reviewRounds.some(
          (round) =>
            round.target.type === "ticket" &&
            round.target.ticketId === ticket.id &&
            round.reviews.some((review) => review.result === undefined),
        );
        const ticketReviewIds = new Set(
          feature.reviewRounds
            .filter(
              (round) => round.target.type === "ticket" && round.target.ticketId === ticket.id,
            )
            .flatMap((round) => round.reviews.map((review) => review.id)),
        );
        const undecidedFindings = feature.findings.filter(
          (finding) =>
            finding.type === "review" &&
            ticketReviewIds.has(finding.reviewId) &&
            finding.decision.status === "open" &&
            !finding.fixWork,
        );
        const conflicts = feature.findings.filter(
          (finding) =>
            finding.type === "conflict" &&
            finding.ticketId === ticket.id &&
            finding.decision === "open",
        );
        for (const finding of undecidedFindings) {
          blockers.push({ code: "undecided-finding", findingId: finding.id });
        }
        for (const conflict of conflicts) {
          if (!conflict.fixWork) {
            blockers.push({ code: "undecided-finding", findingId: conflict.id });
          }
        }
        return {
          ticketId: ticket.id,
          ready: blockers.length === 0,
          blockers,
          tasks: ticket.tasks.map((task) => {
            const taskBlockers: TaskBlocker[] = [];
            if (ticket.merged) taskBlockers.push({ code: "ticket-merged" });
            if (!ticket.worktree) taskBlockers.push({ code: "no-worktree" });
            if (task.writeScope.length === 0 && !task.deliveryMerge)
              taskBlockers.push({ code: "no-write-scope" });
            if (task.deliveryMerge !== undefined) {
              const activeTask = ticket.tasks.find(
                ({ id, state }) => id !== task.id && state === "InProgress",
              );
              if (activeTask) {
                taskBlockers.push({ code: "worktree-in-use", taskId: activeTask.id });
              }
            } else {
              const mergeTask = ticket.tasks.find(
                ({ deliveryMerge, state }) => deliveryMerge !== undefined && state === "InProgress",
              );
              if (mergeTask) taskBlockers.push({ code: "worktree-in-use", taskId: mergeTask.id });
            }
            for (const dependencyId of ticket.dependencies) {
              if (!tickets.get(dependencyId)?.merged) {
                taskBlockers.push({ code: "ticket-dependency-not-merged", dependencyId });
              }
            }
            if (task.state === "InProgress") taskBlockers.push({ code: "in-progress" });
            if (task.state === "Done") taskBlockers.push({ code: "done" });
            if (reviewInProgress) taskBlockers.push({ code: "review-in-progress" });
            for (const finding of undecidedFindings) {
              taskBlockers.push({ code: "undecided-finding", findingId: finding.id });
            }
            for (const conflict of conflicts) {
              if (conflict.fixWork?.type !== "task" || conflict.fixWork.taskId !== task.id) {
                taskBlockers.push({ code: "unresolved-conflict", findingId: conflict.id });
              } else {
                for (const other of ticket.tasks) {
                  if (other.id !== task.id && other.state === "InProgress") {
                    taskBlockers.push({ code: "worktree-in-use", taskId: other.id });
                  }
                }
              }
            }
            for (const dependencyId of task.dependencies) {
              if (tasks.get(dependencyId)?.state !== "Done") {
                taskBlockers.push({ code: "dependency-not-done", dependencyId });
              }
            }
            return { taskId: task.id, ready: taskBlockers.length === 0, blockers: taskBlockers };
          }),
        };
      }),
    };
  }

  private static dependsOn(nodes: Map<string, GraphNode>, from: string, target: string): boolean {
    const pending = [...(nodes.get(from)?.dependencies ?? [])];
    const visited = new Set<string>();
    while (pending.length > 0) {
      const id = pending.pop();
      if (id === undefined) break;
      if (id === target) return true;
      if (visited.has(id)) continue;
      visited.add(id);
      const node = nodes.get(id);
      if (node) pending.push(...node.dependencies);
    }
    return false;
  }
}
