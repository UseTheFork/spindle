import { randomUUID } from "node:crypto";
import { join } from "node:path";

import type { Application } from "@spindle/Foundation/Application";
import { Service } from "@spindle/Foundation/Service";
import { ReportEvidence } from "@spindle/SubagentDrivenDevelopment/Evidence/ReportEvidence";
import type {
  TaskAcceptOptions,
  TaskAssignOptions,
  TaskCreateOptions,
  TaskInstructionsOptions,
  TaskRequestChangesOptions,
  TaskSubmitOptions,
  TaskUpdateOptions,
} from "@spindle/SubagentDrivenDevelopment/Models/Options";
import { TASK_ID } from "@spindle/SubagentDrivenDevelopment/Models/Tasks";
import type {
  TaskAssignment,
  TaskDefinition,
  TaskHandoff,
  TaskReview,
} from "@spindle/SubagentDrivenDevelopment/Models/Tasks";
import type {
  FeatureLedger,
  FeaturePaths,
  TicketDocument,
  TicketProgress,
} from "@spindle/SubagentDrivenDevelopment/Models/Workflow";
import { LedgerRepository } from "@spindle/SubagentDrivenDevelopment/Persistence/LedgerRepository";
import { TaskSchema } from "@spindle/SubagentDrivenDevelopment/Persistence/TaskSchema";
import { TicketRepository } from "@spindle/SubagentDrivenDevelopment/Persistence/TicketRepository";
import { WorkspaceTransaction } from "@spindle/SubagentDrivenDevelopment/Persistence/WorkspaceTransaction";
import { InputValidation } from "@spindle/SubagentDrivenDevelopment/Policies/InputValidation";
import { WorkflowPolicy } from "@spindle/SubagentDrivenDevelopment/Policies/WorkflowPolicy";
import { FeatureInspectionService } from "@spindle/SubagentDrivenDevelopment/Services/FeatureInspectionService";

export class TaskService extends Service {
  public constructor(
    app: Application,
    private readonly tickets: TicketRepository,
    private readonly ledger: LedgerRepository,
    private readonly transaction: WorkspaceTransaction,
    private readonly features: FeatureInspectionService,
    private readonly reports: ReportEvidence,
  ) {
    super(app);
  }

  public create(options: TaskCreateOptions): { ticket: string; task: string } {
    InputValidation.validateTicketId(options.ticket);
    InputValidation.validateAuthor(options.author);
    const feature = this.features.resolveFeature(options.spec);
    return this.transaction.run(feature.workspace, () => {
      const ledger = this.ledger.readLedger(feature);
      this.tickets.requireTicket(this.tickets.readTickets(feature.workspace), options.ticket);
      const ticket = ledger.tickets.find((item) => item.id === options.ticket);
      if (!ticket) throw new Error(`Ticket ${options.ticket} has no ledger record.`);
      const recovered = this.recoveredTask(feature, ledger, options);
      if (recovered) return recovered;
      const tasks = ticket.tasks ?? [];
      let highest = 0n;
      for (const task of tasks) {
        const number = BigInt(TASK_ID.exec(task.id)![1]!);
        if (number > highest) highest = number;
      }
      const id = `TASK-${String(highest + 1n).padStart(4, "0")}`;
      const task: TaskDefinition = {
        id,
        title: options.title,
        instructions: options.instructions,
        acceptanceCriteria: options.acceptanceCriteria,
        editPaths: options.editPaths,
        createPaths: options.createPaths,
        referencePaths: options.referencePaths,
        dependencies: options.dependencies,
        status: "unassigned",
      };
      const candidate = [...tasks, task];
      TaskSchema.validate(candidate);
      ticket.tasks = candidate;
      this.transaction.writeLedger(feature, ledger);
      return { ticket: ticket.id, task: id };
    });
  }

  private recoveredTask(
    feature: FeaturePaths,
    ledger: FeatureLedger,
    options: TaskCreateOptions,
  ): { ticket: string; task: string } | undefined {
    const ticket = ledger.tickets.find((item) => item.id === options.ticket);
    if (!ticket) return undefined;
    const tasks = ticket.tasks ?? [];
    for (const write of this.transaction.recoveredWrites(feature.workspace)) {
      if (write.path !== "sdd.json" || write.before === null) continue;
      const previous = this.ledger.validateLedger(
        JSON.parse(write.before) as unknown,
        feature.feature,
      );
      const previousTasks =
        previous.tickets.find((item) => item.id === options.ticket)?.tasks ?? [];
      const previousIds = new Set(previousTasks.map((task) => task.id));
      const matches = tasks.filter(
        (task) =>
          !previousIds.has(task.id) &&
          task.status === "unassigned" &&
          task.title === options.title &&
          task.instructions === options.instructions &&
          this.sameValues(task.acceptanceCriteria, options.acceptanceCriteria) &&
          this.sameValues(task.editPaths, options.editPaths) &&
          this.sameValues(task.createPaths, options.createPaths) &&
          this.sameValues(task.referencePaths, options.referencePaths) &&
          this.sameValues(task.dependencies, options.dependencies),
      );
      if (matches.length === 1) return { ticket: ticket.id, task: matches[0]!.id };
    }
    return undefined;
  }

  private sameValues(left: readonly string[], right: readonly string[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }

  public update(options: TaskUpdateOptions): { ticket: string; task: string } {
    InputValidation.validateTicketId(options.ticket);
    InputValidation.validateAuthor(options.author);
    if (!TASK_ID.test(options.task)) throw new Error("Invalid task ID.");
    const fields = [
      "title",
      "instructions",
      "acceptanceCriteria",
      "editPaths",
      "createPaths",
      "referencePaths",
      "dependencies",
    ] as const;
    if (!fields.some((field) => options[field] !== undefined)) {
      throw new Error("Provide task fields to update.");
    }
    const feature = this.features.resolveFeature(options.spec);
    return this.transaction.run(feature.workspace, () => {
      const ledger = this.ledger.readLedger(feature);
      this.tickets.requireTicket(this.tickets.readTickets(feature.workspace), options.ticket);
      const ticket = ledger.tickets.find((item) => item.id === options.ticket);
      if (!ticket) throw new Error(`Ticket ${options.ticket} has no ledger record.`);
      const tasks = ticket.tasks ?? [];
      const current = tasks.find((task) => task.id === options.task);
      if (!current)
        throw new Error(`Task ${options.task} does not exist in ticket ${options.ticket}.`);
      const updated = { ...current };
      for (const field of fields) {
        const value = options[field];
        if (value !== undefined) Object.assign(updated, { [field]: value });
      }
      const candidate = tasks.map((task) => (task.id === options.task ? updated : task));
      TaskSchema.validate(candidate);
      ticket.tasks = candidate;
      this.transaction.writeLedger(feature, ledger);
      return { ticket: ticket.id, task: options.task };
    });
  }

  public assign(options: TaskAssignOptions): TaskHandoff {
    this.validateTaskSelection(options.ticket, options.task);
    InputValidation.validateAuthor(options.author);
    InputValidation.validateAuthor(options.worker);
    if (options.author.trim() === options.worker.trim()) {
      throw new Error("The controller and task worker must be different identities.");
    }
    const feature = this.features.resolveFeature(options.spec);
    this.assertController(feature, options.ticket, options.author);
    return this.transaction.run(feature.workspace, () => {
      const ledger = this.ledger.readLedger(feature);
      const progress = this.assertController(feature, options.ticket, options.author, ledger);
      const tickets = this.tickets.readTickets(feature.workspace);
      const ticket = this.tickets.requireTicket(tickets, options.ticket);
      const current = this.requireTask(ledger, options.ticket, options.task);
      if (current.status !== "unassigned" && current.status !== "changes-requested") {
        throw new Error(`Task ${options.task} cannot be assigned from ${current.status}.`);
      }
      this.assertReadyToAssign(current, this.tasksFor(ledger, options.ticket));
      const worktree = progress.worktree?.workspace;
      if (!worktree) {
        throw new Error(`Ticket ${options.ticket} has no shared implementation worktree.`);
      }
      const assignmentId = randomUUID();
      const report = join(
        feature.workspace,
        "reports",
        `${options.ticket}-${options.task}-${assignmentId}.md`,
      );
      this.reports.assertReportPath(feature, report, false);
      if (this.reports.reportExists(feature, report)) {
        throw new Error(`Task report destination already exists: ${report}.`);
      }
      if (current.assignment) {
        current.assignmentHistory ??= [];
        current.assignmentHistory.push(current.assignment);
      }
      if (current.review) {
        current.reviewHistory ??= [];
        current.reviewHistory.push(current.review);
        delete current.review;
      }
      const assignment: TaskAssignment = {
        id: assignmentId,
        controller: options.author.trim(),
        worker: options.worker.trim(),
        worktree,
        report,
        assignedAt: new Date().toISOString(),
      };
      current.assignment = assignment;
      current.status = "assigned";
      const tasks = this.tasksFor(ledger, options.ticket);
      TaskSchema.validate(tasks);
      this.transaction.writeLedger(feature, ledger);
      return this.handoff(ticket, current);
    });
  }

  public instructions(options: TaskInstructionsOptions): TaskHandoff {
    this.validateTaskSelection(options.ticket, options.task);
    const feature = this.features.resolveFeature(options.spec);
    const ledger = this.ledger.readLedger(feature);
    const ticket = this.tickets.requireTicket(
      this.tickets.readTickets(feature.workspace),
      options.ticket,
    );
    return this.handoff(ticket, this.requireTask(ledger, options.ticket, options.task));
  }

  public submit(options: TaskSubmitOptions): {
    ticket: string;
    task: string;
    status: "submitted" | "accepted";
    assignment: TaskAssignment;
    reportSha256: string;
    idempotent?: boolean;
  } {
    this.validateTaskSelection(options.ticket, options.task);
    InputValidation.validateAuthor(options.author);
    if (!options.assignment.trim()) throw new Error("--assignment must not be empty.");
    const feature = this.features.resolveFeature(options.spec);
    this.assertController(feature, options.ticket, options.author);
    return this.transaction.run(feature.workspace, () => {
      const ledger = this.ledger.readLedger(feature);
      this.assertController(feature, options.ticket, options.author, ledger);
      const current = this.requireTask(ledger, options.ticket, options.task);
      const assignment = this.requireAssignment(current, options.assignment);
      if (current.status === "submitted" || current.status === "accepted") {
        const reportSha256 = this.currentReportDigest(feature, assignment);
        return {
          ticket: options.ticket,
          task: options.task,
          status: current.status,
          assignment,
          reportSha256,
          idempotent: true,
        };
      }
      if (current.status !== "assigned") {
        throw new Error(`Task ${options.task} cannot submit a report from ${current.status}.`);
      }
      const reportSha256 = this.reportDigest(feature, assignment);
      assignment.submittedAt = new Date().toISOString();
      assignment.submittedBy = options.author.trim();
      assignment.reportSha256 = reportSha256;
      current.status = "submitted";
      TaskSchema.validate(this.tasksFor(ledger, options.ticket));
      this.transaction.writeLedger(feature, ledger);
      return {
        ticket: options.ticket,
        task: options.task,
        status: "submitted",
        assignment,
        reportSha256,
      };
    });
  }

  public accept(options: TaskAcceptOptions): {
    ticket: string;
    task: string;
    status: "accepted";
    assignment: TaskAssignment;
  } {
    this.validateTaskSelection(options.ticket, options.task);
    InputValidation.validateAuthor(options.author);
    if (!options.assignment.trim()) throw new Error("--assignment must not be empty.");
    if (options.details !== undefined && !options.details.trim()) {
      throw new Error("--details must not be empty.");
    }
    const feature = this.features.resolveFeature(options.spec);
    this.assertController(feature, options.ticket, options.author);
    return this.transaction.run(feature.workspace, () => {
      const ledger = this.ledger.readLedger(feature);
      this.assertController(feature, options.ticket, options.author, ledger);
      const current = this.requireTask(ledger, options.ticket, options.task);
      const assignment = this.requireAssignment(current, options.assignment);
      if (current.status !== "submitted") {
        throw new Error(`Task ${options.task} cannot be accepted from ${current.status}.`);
      }
      this.assertCurrentReport(feature, assignment);
      current.status = "accepted";
      current.review = this.reviewRecord(
        options.assignment,
        "accepted",
        options.details?.trim() || "Task accepted.",
        options.author,
      );
      TaskSchema.validate(this.tasksFor(ledger, options.ticket));
      this.transaction.writeLedger(feature, ledger);
      return { ticket: options.ticket, task: options.task, status: "accepted", assignment };
    });
  }

  public requestChanges(options: TaskRequestChangesOptions): {
    ticket: string;
    task: string;
    status: "changes-requested";
    assignment: TaskAssignment;
  } {
    this.validateTaskSelection(options.ticket, options.task);
    InputValidation.validateAuthor(options.author);
    if (!options.assignment.trim()) throw new Error("--assignment must not be empty.");
    if (!options.details.trim()) throw new Error("--details must not be empty.");
    const feature = this.features.resolveFeature(options.spec);
    this.assertController(feature, options.ticket, options.author);
    return this.transaction.run(feature.workspace, () => {
      const ledger = this.ledger.readLedger(feature);
      this.assertController(feature, options.ticket, options.author, ledger);
      const current = this.requireTask(ledger, options.ticket, options.task);
      const assignment = this.requireAssignment(current, options.assignment);
      if (current.status !== "submitted") {
        throw new Error(`Task ${options.task} cannot request changes from ${current.status}.`);
      }
      this.assertCurrentReport(feature, assignment);
      current.status = "changes-requested";
      current.review = this.reviewRecord(
        options.assignment,
        "changes-requested",
        options.details.trim(),
        options.author,
      );
      TaskSchema.validate(this.tasksFor(ledger, options.ticket));
      this.transaction.writeLedger(feature, ledger);
      return {
        ticket: options.ticket,
        task: options.task,
        status: "changes-requested",
        assignment,
      };
    });
  }

  private validateTaskSelection(ticket: string, task: string): void {
    InputValidation.validateTicketId(ticket);
    if (!TASK_ID.test(task)) throw new Error("Invalid task ID.");
  }

  private tasksFor(ledger: FeatureLedger, ticketId: string): TaskDefinition[] {
    const ticket = ledger.tickets.find((item) => item.id === ticketId);
    if (!ticket) throw new Error(`Ticket ${ticketId} has no ledger record.`);
    return ticket.tasks ?? [];
  }

  private assertReadyToAssign(task: TaskDefinition, tasks: readonly TaskDefinition[]): void {
    for (const dependencyId of task.dependencies) {
      const dependency = tasks.find((candidate) => candidate.id === dependencyId);
      if (!dependency || dependency.status !== "accepted") {
        const status = dependency?.status ?? "missing";
        throw new Error(
          `Task ${task.id} is unavailable for assignment: dependency ${dependencyId} is ${status}, not accepted.`,
        );
      }
    }

    const writePaths = [...task.editPaths, ...task.createPaths];
    for (const other of tasks) {
      if (
        other.id === task.id ||
        (other.status !== "assigned" &&
          other.status !== "submitted" &&
          other.status !== "changes-requested")
      ) {
        continue;
      }
      const reservedPaths = new Set([...other.editPaths, ...other.createPaths]);
      for (const path of writePaths) {
        if (reservedPaths.has(path)) {
          throw new Error(
            `Task ${task.id} cannot be assigned: path "${path}" is reserved by active task ${other.id}.`,
          );
        }
      }
    }
  }

  private requireTask(ledger: FeatureLedger, ticket: string, taskId: string): TaskDefinition {
    const task = this.tasksFor(ledger, ticket).find((item) => item.id === taskId);
    if (!task) throw new Error(`Task ${taskId} does not exist in ticket ${ticket}.`);
    return task;
  }

  private requireAssignment(task: TaskDefinition, assignmentId: string): TaskAssignment {
    if (!task.assignment || task.assignment.id !== assignmentId) {
      throw new Error(`No current assignment matches ${assignmentId} for task ${task.id}.`);
    }
    return task.assignment;
  }

  private assertController(
    feature: FeaturePaths,
    ticketId: string,
    actor: string,
    existingLedger?: FeatureLedger,
  ): TicketProgress {
    const ledger = existingLedger ?? this.ledger.readLedger(feature);
    const progress = ledger.tickets.find((item) => item.id === ticketId);
    if (!progress) throw new Error(`Ticket ${ticketId} has no ledger record.`);
    const identity = actor.trim();
    const assignedWorkers = (progress.tasks ?? []).flatMap((task) => [
      ...(task.assignment ? [task.assignment.worker] : []),
      ...(task.assignmentHistory ?? []).map((assignment) => assignment.worker),
    ]);
    if (assignedWorkers.includes(identity)) {
      throw new Error("Worker identities cannot change task workflow state.");
    }
    if (progress.execution !== "implementing") {
      throw new Error(`Ticket ${ticketId} is not in implementation.`);
    }
    WorkflowPolicy.assertTicketOwner(progress.owner, actor, feature.feature, ticketId);
    if (!progress.worktree?.workspace) {
      throw new Error(`Ticket ${ticketId} has no shared implementation worktree.`);
    }
    return progress;
  }

  private handoff(ticket: TicketDocument, task: TaskDefinition): TaskHandoff {
    const assignment = task.assignment;
    if (!assignment || task.status === "unassigned") {
      throw new Error(`Task ${task.id} is unassigned and has no current handoff.`);
    }
    return {
      ticket: ticket.id,
      ticketTitle: ticket.title,
      task: task.id,
      taskTitle: task.title,
      objective: task.instructions,
      acceptanceCriteria: [...task.acceptanceCriteria],
      parentTicket: {
        requirements: this.markdownSection(ticket.body, "Requirements"),
        acceptanceCriteria: this.markdownSection(ticket.body, "Acceptance Criteria"),
      },
      editPaths: [...task.editPaths],
      createPaths: [...task.createPaths],
      referencePaths: [...task.referencePaths],
      sharedTicketWorktree: assignment.worktree,
      reportDestination: assignment.report,
      assignment: { ...assignment },
    };
  }

  private markdownSection(body: string, title: string): string {
    const heading = new RegExp(`^##[ \\t]+${title}[ \\t]*$`, "m").exec(body);
    if (!heading) throw new Error(`Parent ticket is missing its ## ${title} section.`);
    const start = heading.index + heading[0].length;
    const nextHeading = /^##[ \t]+/m.exec(body.slice(start));
    const section = body.slice(start, nextHeading ? start + nextHeading.index : body.length).trim();
    if (!section) throw new Error(`Parent ticket ## ${title} section is empty.`);
    return section;
  }

  private reportDigest(feature: FeaturePaths, assignment: TaskAssignment): string {
    try {
      return this.reports.readReportDigest(feature, assignment.report);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        throw new Error(
          `Task report is missing at ${assignment.report}; the task remains assigned.`,
        );
      }
      throw error;
    }
  }

  private currentReportDigest(feature: FeaturePaths, assignment: TaskAssignment): string {
    const digest = this.reportDigest(feature, assignment);
    if (!assignment.reportSha256 || digest !== assignment.reportSha256) {
      throw new Error("The registered task report changed after submission.");
    }
    return digest;
  }

  private assertCurrentReport(feature: FeaturePaths, assignment: TaskAssignment): void {
    this.currentReportDigest(feature, assignment);
  }

  private reviewRecord(
    assignment: string,
    result: TaskReview["result"],
    details: string,
    controller: string,
  ): TaskReview {
    return {
      assignment,
      result,
      details,
      controller: controller.trim(),
      recordedAt: new Date().toISOString(),
    };
  }
}
