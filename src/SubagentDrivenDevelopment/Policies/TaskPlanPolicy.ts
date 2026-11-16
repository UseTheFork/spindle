import type { TicketProgress } from "@spindle/SubagentDrivenDevelopment/Models/Workflow";

export class TaskPlanPolicy {
  public static assertDefined(progress: TicketProgress): void {
    if (progress.tasks.length === 0) {
      throw new Error(
        `Ticket ${progress.id} needs a task plan before implementation starts; define tasks first.`,
      );
    }
  }

  public static acceptanceBlockers(progress: TicketProgress): string[] {
    if (progress.tasks.length === 0) {
      return [`Ticket ${progress.id} has no task plan; define tasks before ticket completion.`];
    }
    return progress.tasks
      .filter((task) => task.status !== "accepted")
      .map((task) => `Task ${task.id} is ${task.status}, not accepted.`);
  }

  public static assertAllAccepted(progress: TicketProgress): void {
    const blockers = TaskPlanPolicy.acceptanceBlockers(progress);
    if (blockers.length > 0) {
      throw new Error(
        `Ticket ${progress.id} cannot submit implementation:\n${blockers.join("\n")}`,
      );
    }
  }

  public static assertEditable(progress: TicketProgress): void {
    if (progress.assignment) {
      throw new Error(
        `Ticket ${progress.id} task plan is frozen after implementation is assigned (${progress.assignment.status}).`,
      );
    }
  }
}
