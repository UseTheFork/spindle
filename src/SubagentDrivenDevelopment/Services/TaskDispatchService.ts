import { isAbsolute, join } from "node:path";

import { Service } from "@spindle/Foundation/Service";
import type { Feature } from "@spindle/SubagentDrivenDevelopment/Models/Feature";
import { FeatureWorkspaceService } from "@spindle/SubagentDrivenDevelopment/Services/FeatureWorkspaceService";
import { WorkGraphService } from "@spindle/SubagentDrivenDevelopment/Services/WorkGraphService";

export class TaskDispatchService extends Service {
  public async dispatch(reference: string, taskId: string, stoppedAttempt?: number) {
    this.assertApplicationBooted();
    const workspace = await this.app.make(FeatureWorkspaceService);
    const graph = await this.app.make(WorkGraphService);
    return workspace.withLedgerTransaction(reference, async (feature, ledger, publish) => {
      if (feature.pendingStart)
        throw new Error("Resume the pending start before dispatching tasks.");
      const { ticket, task } = this.findTask(ledger.tickets, taskId);
      if (stoppedAttempt !== undefined) {
        this.requireAttempt(stoppedAttempt);
        if (task.state !== "InProgress" || task.attempt !== stoppedAttempt) {
          throw new Error(
            `Stopped attempt ${stoppedAttempt} is not the active attempt for '${taskId}'.`,
          );
        }
      } else if (task.state === "InProgress") {
        throw new Error(`Task '${taskId}' already has active attempt ${task.attempt}.`);
      }

      const readiness = graph
        .readiness(feature)
        .tickets.find(({ ticketId }) => ticketId === ticket.id)
        ?.tasks.find((item) => item.taskId === taskId);
      if (!readiness) throw new Error(`Missing readiness for '${taskId}'.`);
      const blockers = readiness.blockers.filter(
        ({ code }) => stoppedAttempt === undefined || code !== "in-progress",
      );
      if (blockers.length > 0) {
        throw new Error(`Task '${taskId}' is not ready: ${JSON.stringify(blockers)}`);
      }

      const attempt = task.attempt + 1;
      this.requireAttempt(attempt);
      const featurePath = this.featurePath(feature.name);
      const assignmentCommand = `spindle sdd assignment --feature ${this.shellArgument(featurePath)} --task ${this.shellArgument(task.id)} --attempt ${attempt} --json`;
      task.state = "InProgress";
      task.attempt = attempt;
      await publish(ledger);
      return {
        feature: feature.name,
        ticket: ticket.id,
        task: task.id,
        attempt,
        assignmentCommand,
      };
    });
  }

  public async assignment(reference: string, taskId: string, attempt: number) {
    this.assertApplicationBooted();
    if (!isAbsolute(reference)) throw new Error("Assignment requires an absolute --feature path.");
    this.requireAttempt(attempt);
    const feature = await (await this.app.make(FeatureWorkspaceService)).load(reference);
    const { ticket, task } = this.findTask(feature.tickets, taskId);
    if (task.state !== "InProgress" || task.attempt !== attempt) {
      throw new Error(`Attempt ${attempt} is not the active assignment for '${taskId}'.`);
    }
    if (!ticket.worktree || ticket.merged)
      throw new Error(`Ticket '${ticket.id}' has no active worktree.`);
    const finding =
      task.discoveredFrom === undefined
        ? feature.findings.find(
            (item) =>
              item.type === "conflict" &&
              item.ticketId === ticket.id &&
              item.fixWork?.type === "task" &&
              item.fixWork.taskId === task.id,
          )
        : feature.findings.find(({ id }) => id === task.discoveredFrom);
    if (task.discoveredFrom !== undefined && !finding) {
      throw new Error(`Originating finding '${task.discoveredFrom}' was not found.`);
    }
    const merge =
      finding?.type === "conflict" &&
      finding.ticketId === ticket.id &&
      finding.decision === "open" &&
      finding.fixWork?.type === "task" &&
      finding.fixWork.taskId === task.id;

    return {
      role: merge ? "merge-agent" : "worker",
      feature: feature.name,
      ticket: ticket.id,
      task: task.id,
      attempt,
      worktree: ticket.worktree,
      instructions: task.instructions,
      writeScope: task.writeScope,
      context: task.context ?? [],
      requirements: ticket.requirements,
      acceptanceCriteria: ticket.acceptanceCriteria,
      ...(finding === undefined ? {} : { finding }),
      reportPath: join(
        this.featurePath(feature.name),
        "reports",
        `${task.id}-attempt-${attempt}.md`,
      ),
      workerRules: [
        "Work in the assigned ticket worktree and change only files in the write scope.",
        "You may read other files and run focused tests. Other workers may be editing outside your scope.",
        "Do not change workflow records or run other SDD commands.",
        merge
          ? "Resolve only the assigned merge; stage those resolutions and create its merge commit."
          : "Do not stage or commit changes.",
      ],
      reportInstructions:
        "Write only to the assigned report path. Summarize changes, test results, and blockers, then notify the controller.",
    };
  }

  private findTask<T extends Pick<Feature["tickets"][number], "id" | "tasks">>(
    tickets: readonly T[],
    taskId: string,
  ) {
    const ticket = tickets.find(({ tasks }) => tasks.some(({ id }) => id === taskId));
    const task = ticket?.tasks.find(({ id }) => id === taskId);
    if (!ticket || !task) throw new Error(`Unknown task '${taskId}'.`);
    return { ticket, task };
  }

  private featurePath(name: string): string {
    return this.app.workspacePath(join(".spindle", "features", name));
  }

  private requireAttempt(attempt: number): void {
    if (!Number.isSafeInteger(attempt) || attempt < 1)
      throw new Error("Attempt must be a positive safe integer.");
  }

  private shellArgument(value: string): string {
    return /^[a-zA-Z0-9_./-]+$/.test(value) && value === value.trim()
      ? value
      : `'${value.replaceAll("'", "'\\''")}'`;
  }
}
