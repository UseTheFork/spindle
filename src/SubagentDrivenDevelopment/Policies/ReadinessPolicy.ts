import type { Application } from "@/Foundation/Application";
import { Service } from "@/Foundation/Service";
import type { TicketDocument } from "@/SubagentDrivenDevelopment/Models/Workflow";
import { TicketRepository } from "@/SubagentDrivenDevelopment/Persistence/TicketRepository";

export class ReadinessPolicy extends Service {
  public constructor(
    app: Application,
    private readonly ticketRepository: TicketRepository,
  ) {
    super(app);
  }
  public evaluate(tickets: TicketDocument[]) {
    this.ticketRepository.validateDependencyGraph(tickets);
    const byId = new Map(tickets.map((item) => [item.id, item]));
    const eligible = tickets.filter((item) => item.status === "open" && !item.blocker);
    const ready: string[] = [];
    const unready: { ticket: string; blockedBy: string[] }[] = [];
    for (const item of eligible) {
      const pending = item.blocked_by.filter((id) => {
        const dependencyTicket = byId.get(id);
        return (
          !dependencyTicket || dependencyTicket.status !== "closed" || !!dependencyTicket.blocker
        );
      });
      if (pending.length === 0) ready.push(item.id);
      else unready.push({ ticket: item.id, blockedBy: pending });
    }
    return { ready, unready };
  }
}
