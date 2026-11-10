import { readFileSync } from "node:fs";

import type { Application } from "@/Foundation/Application";
import { Service } from "@/Foundation/Service";
import type {
  FeaturePaths,
  FeatureLedger,
  TicketDocument,
} from "@/SubagentDrivenDevelopment/Models/Workflow";
import { LedgerRepository } from "@/SubagentDrivenDevelopment/Persistence/LedgerRepository";
import { PathSafety } from "@/SubagentDrivenDevelopment/Persistence/PathSafety";
import { TicketRepository } from "@/SubagentDrivenDevelopment/Persistence/TicketRepository";

export class ReadinessReader extends Service {
  public constructor(
    app: Application,
    private readonly ticketRepository: TicketRepository,
    private readonly ledgerRepository: LedgerRepository,
    private readonly pathSafety: PathSafety,
  ) {
    super(app);
  }
  public read(feature: FeaturePaths): { ledger: FeatureLedger; tickets: TicketDocument[] } {
    let ledger: FeatureLedger | undefined;
    let tickets: TicketDocument[] | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      this.pathSafety.assertReadyReadable(feature.workspace);
      const ledgerRaw = readFileSync(feature.ledger, "utf8");
      this.ledgerRepository.validateLedger(JSON.parse(ledgerRaw) as unknown, feature.feature);
      const observedTickets = this.ticketRepository.readTickets(feature.workspace);
      this.pathSafety.assertReadyReadable(feature.workspace);

      const confirmedLedgerRaw = readFileSync(feature.ledger, "utf8");
      const confirmedLedger = this.ledgerRepository.validateLedger(
        JSON.parse(confirmedLedgerRaw) as unknown,
        feature.feature,
      );
      const confirmedTickets = this.ticketRepository.readTickets(feature.workspace);
      this.pathSafety.assertReadyReadable(feature.workspace);
      const observedTicketContents = new Map(
        observedTickets.map((ticket) => [ticket.id, ticket.raw]),
      );
      const ticketsMatch =
        observedTicketContents.size === confirmedTickets.length &&
        confirmedTickets.every((ticket) => observedTicketContents.get(ticket.id) === ticket.raw);
      if (ledgerRaw === confirmedLedgerRaw && ticketsMatch) {
        ledger = confirmedLedger;
        tickets = confirmedTickets;
        break;
      }
    }
    if (!ledger || !tickets) {
      throw new Error("Ticket data changed while reading the ready queue; retry ready.");
    }
    return { ledger, tickets };
  }
}
