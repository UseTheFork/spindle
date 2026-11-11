import type { Application } from "@/Foundation/Application";
import { Service } from "@/Foundation/Service";
import type {
  TicketProgress,
  FeatureLedger,
  DeliveryProgress,
} from "@/SubagentDrivenDevelopment/Models/Workflow";

export class WorkflowPolicy extends Service {
  public constructor(app: Application) {
    super(app);
  }

  public nextAction(progress: TicketProgress, blocker?: string): string {
    if (progress.adjudication?.status === "pending") return "adjudicate";
    if (progress.execution === "unstarted") return "implement";
    if (progress.execution === "implementing") {
      if (!progress.assignment) return "resolve-assignment-blocker";
      if (progress.assignment.status === "submitted") {
        if (blocker?.startsWith("Required check ")) return "record-current-checks";
        return blocker ? "restore-implementation-report" : "review";
      }
      return "await-implementation-report";
    }
    if (progress.execution === "reviewing") {
      if (blocker?.startsWith("Finding ")) return "resolve-findings";
      if (blocker?.startsWith("Required check ")) return "record-current-checks";
      const reviews = progress.reviewAssignments ?? [];
      if (reviews.length > 0) {
        if (blocker?.startsWith("The registered review report")) return "restore-review-report";
        if (blocker) return "resolve-review-blocker";
        if (reviews.some((assignment) => assignment.status === "pending")) {
          return "await-review-report";
        }
        if (reviews.some((assignment) => assignment.result !== "passed")) {
          return "resolve-review-result";
        }
        return "integrate";
      }
      return blocker ? "restore-implementation-report" : "review";
    }
    if (progress.execution === "changes-requested") {
      if ((progress.findings ?? []).some((finding) => finding.status === "confirmed")) {
        return "correct";
      }
      if (blocker?.startsWith("Finding ")) return "adjudicate-findings";
      return (progress.correctionAttempts?.length ?? 0) > 0
        ? "correct"
        : "controller-correction-decision";
    }
    if (progress.execution === "integrated") {
      if (progress.integration?.postMerge?.status !== "passed") return "post-merge-checks";
      if (progress.status !== "closed") return "verify-ticket-closure";
      return blocker ? "resolve-check-blocker" : "complete";
    }
    return "resolve-blocker";
  }

  public requireProgress(ledger: FeatureLedger, ticket: string): TicketProgress {
    const progress = ledger.tickets.find((item) => item.id === ticket);
    if (!progress) throw new Error(`Ticket ${ticket} has no ledger execution record.`);
    return progress;
  }

  public acceptedInventory(progress: TicketProgress, ticketId: string): string[] {
    const corrective = progress.correctionAttempts?.at(-1)?.reviewAssignments ?? [];
    const assignments = corrective.length > 0 ? corrective : (progress.reviewAssignments ?? []);
    if (
      assignments.length === 0 ||
      assignments.some((assignment) => assignment.status !== "submitted")
    ) {
      throw new Error(`Ticket ${ticketId} has no complete frozen review inventory.`);
    }
    const inventory = assignments[0]!.inventory;
    if (
      assignments.some(
        (assignment) => JSON.stringify(assignment.inventory) !== JSON.stringify(inventory),
      )
    ) {
      throw new Error(`Ticket ${ticketId} review assignments disagree on the accepted inventory.`);
    }
    return [...inventory];
  }

  public assertDeliveryOpen(delivery: DeliveryProgress): void {
    if (delivery.finished) {
      throw new Error("Delivery is finished; final checks cannot be changed.");
    }
  }
}
