import type { Application } from "@/Foundation/Application";
import { Service } from "@/Foundation/Service";
import type { FeatureLedger, TicketDocument } from "@/SubagentDrivenDevelopment/Models/Workflow";
import { TicketRepository } from "@/SubagentDrivenDevelopment/Persistence/TicketRepository";

export class ReadinessPolicy extends Service {
  public constructor(
    app: Application,
    private readonly ticketRepository: TicketRepository,
  ) {
    super(app);
  }
  public static unmetDependencies(
    ticket: TicketDocument,
    tickets: TicketDocument[],
    ledger: FeatureLedger,
  ): string[] {
    const byId = new Map(tickets.map((item) => [item.id, item]));
    const progressById = new Map(ledger.tickets.map((item) => [item.id, item]));
    return ticket.blocked_by.filter((id) => {
      const dependencyTicket = byId.get(id);
      const progress = progressById.get(id);
      return (
        !dependencyTicket ||
        dependencyTicket.status !== "closed" ||
        !!dependencyTicket.blocker ||
        progress?.status !== "closed" ||
        progress.execution !== "integrated" ||
        progress.integration?.postMerge?.status !== "passed"
      );
    });
  }

  public evaluate(tickets: TicketDocument[], ledger: FeatureLedger) {
    this.ticketRepository.validateDependencyGraph(tickets);
    const eligible = tickets.filter((item) => item.status === "open" && !item.blocker);
    const ready: string[] = [];
    const unready: { ticket: string; blockedBy: string[] }[] = [];
    for (const item of eligible) {
      const pending = ReadinessPolicy.unmetDependencies(item, tickets, ledger);
      if (pending.length === 0) ready.push(item.id);
      else unready.push({ ticket: item.id, blockedBy: pending });
    }
    return { ready, unready };
  }
}
