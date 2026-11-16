import type { Application } from "@spindle/Foundation/Application";
import { Service } from "@spindle/Foundation/Service";
import type {
  TaskCreateOptions,
  TaskUpdateOptions,
} from "@spindle/SubagentDrivenDevelopment/Models/Options";
import { TASK_ID } from "@spindle/SubagentDrivenDevelopment/Models/Tasks";
import type { TaskDefinition } from "@spindle/SubagentDrivenDevelopment/Models/Tasks";
import { LedgerRepository } from "@spindle/SubagentDrivenDevelopment/Persistence/LedgerRepository";
import { TaskSchema } from "@spindle/SubagentDrivenDevelopment/Persistence/TaskSchema";
import { TicketRepository } from "@spindle/SubagentDrivenDevelopment/Persistence/TicketRepository";
import { WorkspaceTransaction } from "@spindle/SubagentDrivenDevelopment/Persistence/WorkspaceTransaction";
import { InputValidation } from "@spindle/SubagentDrivenDevelopment/Policies/InputValidation";
import { FeatureInspectionService } from "@spindle/SubagentDrivenDevelopment/Services/FeatureInspectionService";

export class TaskService extends Service {
  public constructor(
    app: Application,
    private readonly tickets: TicketRepository,
    private readonly ledger: LedgerRepository,
    private readonly transaction: WorkspaceTransaction,
    private readonly features: FeatureInspectionService,
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
}
