import type { Application } from "@/Foundation/Application";
import { Service } from "@/Foundation/Service";
import { GitEvidence } from "@/SubagentDrivenDevelopment/Evidence/GitEvidence";
import { ReportEvidence } from "@/SubagentDrivenDevelopment/Evidence/ReportEvidence";
import type {
  ImplementationAssignment,
  ReviewResult,
  ReviewAssignment,
} from "@/SubagentDrivenDevelopment/Models/Assignments";
import type { SubmitOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import type { ExecutionState } from "@/SubagentDrivenDevelopment/Models/Workflow";
import { LedgerRepository } from "@/SubagentDrivenDevelopment/Persistence/LedgerRepository";
import { TicketRepository } from "@/SubagentDrivenDevelopment/Persistence/TicketRepository";
import { WorkspaceTransaction } from "@/SubagentDrivenDevelopment/Persistence/WorkspaceTransaction";
import { CheckPolicy } from "@/SubagentDrivenDevelopment/Policies/CheckPolicy";
import { validateAuthor } from "@/SubagentDrivenDevelopment/Policies/InputValidation";
import { ReviewPolicy } from "@/SubagentDrivenDevelopment/Policies/ReviewPolicy";
import { FeatureInspectionService } from "@/SubagentDrivenDevelopment/Services/FeatureInspectionService";

export class DeliverySubmissionService extends Service {
  public constructor(
    app: Application,
    private readonly gitEvidence: GitEvidence,
    private readonly reportEvidence: ReportEvidence,
    private readonly ticketRepository: TicketRepository,
    private readonly ledgerRepository: LedgerRepository,
    private readonly workspaceTransaction: WorkspaceTransaction,
    private readonly checkPolicy: CheckPolicy,
    private readonly reviewPolicy: ReviewPolicy,
    private readonly featureInspectionService: FeatureInspectionService,
  ) {
    super(app);
  }

  public submitDeliveryImplementation(options: SubmitOptions): {
    scope: "delivery";
    execution: ExecutionState;
    assignment: ImplementationAssignment;
    report?: string;
    reportSha256?: string;
    unavailable?: boolean;
    idempotent?: boolean;
    headSha: string;
  } {
    if (
      options.assignment !== undefined ||
      options.result !== undefined ||
      options.noFindings ||
      options.findings !== undefined
    ) {
      throw new Error("Review assignment, result, and findings options require role review.");
    }
    if (options.unavailable && !options.details?.trim()) {
      throw new Error(
        "--details is required when the delivery implementation report is unavailable.",
      );
    }
    if (options.unavailable && options.report !== undefined) {
      throw new Error("--report cannot be combined with --unavailable.");
    }
    if (!options.unavailable && options.details !== undefined) {
      throw new Error("--details is only valid with --unavailable.");
    }
    validateAuthor(options.author);
    const feature = this.featureInspectionService.resolveFeature(options.spec);
    return this.workspaceTransaction.run(feature.workspace, () => {
      const ledger = this.ledgerRepository.readLedger(feature);
      const delivery = ledger.delivery;
      const assignment = delivery.assignment;
      if (!assignment || assignment.action !== "correct" || assignment.role !== "implementation") {
        throw new Error("No matching delivery correction implementation assignment is pending.");
      }
      if (
        delivery.owner !== options.author.trim() ||
        assignment.controller !== options.author.trim()
      ) {
        throw new Error(
          "Only the current delivery controller may submit this implementation report.",
        );
      }
      const attempt = delivery.correctionAttempts?.find(
        (candidate) => candidate.number === assignment.attempt,
      );
      if (!attempt || attempt.assignmentId !== assignment.id) {
        throw new Error("Delivery correction assignment has no matching persisted attempt.");
      }
      const identity = this.gitEvidence.deliveryCommitIdentity(
        feature,
        ledger,
        this.ticketRepository.readTickets(feature.workspace),
      );
      if (options.unavailable) {
        const details = options.details!.trim();
        if (assignment.status === "unavailable" && assignment.unavailableDetails === details) {
          return {
            scope: "delivery",
            execution: delivery.execution,
            assignment,
            unavailable: true,
            idempotent: true,
            ...identity,
          };
        }
        if (!["pending", "unavailable"].includes(assignment.status)) {
          throw new Error("The delivery implementation assignment is no longer awaiting a report.");
        }
        assignment.status = "unavailable";
        assignment.unavailableDetails = details;
        this.workspaceTransaction.writeLedger(feature, ledger);
        return {
          scope: "delivery",
          execution: delivery.execution,
          assignment,
          unavailable: true,
          ...identity,
        };
      }
      if (!options.report) throw new Error("Delivery implementation submission requires --report.");
      if (assignment.status === "submitted") {
        const digest = this.reportEvidence.readReportDigest(
          feature,
          this.reportEvidence.submissionReportPath(feature, assignment, options.report),
        );
        if (digest !== assignment.reportSha256) {
          throw new Error(
            "The registered delivery implementation report changed after submission.",
          );
        }
        return {
          scope: "delivery",
          execution: delivery.execution,
          assignment,
          report: assignment.report,
          reportSha256: digest,
          idempotent: true,
          ...identity,
        };
      }
      if (!["pending", "unavailable"].includes(assignment.status)) {
        throw new Error("The delivery implementation assignment is not awaiting a report.");
      }
      const report = this.reportEvidence.submissionReportPath(feature, assignment, options.report);
      const reportSha256 = this.reportEvidence.readReportDigest(feature, report);
      assignment.status = "submitted";
      assignment.reportSha256 = reportSha256;
      assignment.submittedAt = new Date().toISOString();
      assignment.submittedBy = options.author.trim();
      delete assignment.unavailableDetails;
      attempt.assignment = assignment;
      delivery.execution = "reviewing";
      delivery.history.push({
        at: assignment.submittedAt,
        author: options.author.trim(),
        action: `correction-report-submitted:${assignment.id}`,
      });
      this.workspaceTransaction.writeLedger(feature, ledger);
      return {
        scope: "delivery",
        execution: delivery.execution,
        assignment,
        report: assignment.report,
        reportSha256,
        ...identity,
      };
    });
  }

  public submitDeliveryReview(options: SubmitOptions): {
    scope: "delivery";
    execution: ExecutionState;
    assignment: ReviewAssignment;
    report: string;
    reportSha256: string;
    idempotent?: boolean;
    headSha: string;
  } {
    if (options.role !== "review") {
      throw new Error(
        "Delivery implementation submissions require an active corrective assignment.",
      );
    }
    if (!options.assignment?.trim()) throw new Error("Review submission requires --assignment.");
    if (!options.report) throw new Error("Review submission requires --report.");
    if (!options.result) throw new Error("Review submission requires explicit --result.");
    if (!["passed", "failed", "unavailable"].includes(options.result)) {
      throw new Error(`Invalid review result: ${options.result}.`);
    }
    const findingIds = options.findingIds?.map((id) => id.trim());
    if (options.noFindings === true && findingIds !== undefined) {
      throw new Error("--findings and --no-findings cannot be combined.");
    }
    if (
      findingIds !== undefined &&
      (findingIds.length === 0 ||
        findingIds.some((id) => !/^F-\d{4,}$/.test(id)) ||
        new Set(findingIds).size !== findingIds.length)
    ) {
      throw new Error("--findings must contain unique canonical finding IDs.");
    }
    if (options.noFindings !== true && findingIds === undefined) {
      throw new Error("Review submission requires either --findings or exclusive --no-findings.");
    }
    if (options.result === "passed" && options.details !== undefined) {
      throw new Error("--details is only valid for failed or unavailable review results.");
    }
    if (options.result !== "passed" && !options.details?.trim()) {
      throw new Error("--details is required for failed or unavailable reviews.");
    }
    validateAuthor(options.author);
    const feature = this.featureInspectionService.resolveFeature(options.spec);
    return this.workspaceTransaction.run(feature.workspace, () => {
      const ledger = this.ledgerRepository.readLedger(feature);
      const delivery = ledger.delivery;
      if (!delivery.owner || delivery.owner !== options.author.trim()) {
        throw new Error("Only the current delivery controller may submit aggregate review.");
      }
      const assignment = delivery.reviewAssignments?.find(
        (candidate) => candidate.id === options.assignment,
      );
      if (!assignment || assignment.scope !== "delivery") {
        throw new Error(`No delivery review assignment matches ID ${options.assignment}.`);
      }
      const identity = this.gitEvidence.deliveryCommitIdentity(
        feature,
        ledger,
        this.ticketRepository.readTickets(feature.workspace),
      );
      const blockers = this.checkPolicy.deliveryCheckBlockers(
        feature,
        this.ticketRepository.readTickets(feature.workspace),
        delivery,
        identity,
      );
      if (blockers.length > 0) throw new Error(blockers.join("\n"));
      const commitBlocker = this.reviewPolicy.reviewCommitBlocker(
        feature,
        delivery,
        assignment,
        identity,
      );
      if (commitBlocker) throw new Error(commitBlocker);
      const report = this.reportEvidence.submissionReportPath(feature, assignment, options.report);
      const reportSha256 = this.reportEvidence.readReportDigest(feature, report);
      const reported = (delivery.findings ?? [])
        .filter((finding) =>
          finding.provenance.some(
            (source) =>
              source.report === assignment.report && source.headSha === assignment.headSha,
          ),
        )
        .map((finding) => finding.id);
      if (options.noFindings === true && reported.length > 0) {
        throw new Error(
          `Review report has registered findings and cannot declare --no-findings: ${reported.join(", ")}.`,
        );
      }
      if (findingIds !== undefined) {
        const missing = reported.filter((id) => !findingIds.includes(id));
        const unknown = findingIds.filter((id) => !reported.includes(id));
        if (missing.length > 0 || unknown.length > 0) {
          throw new Error(
            `--findings must exactly list canonical findings registered from this delivery report and commit; missing=${missing.join(",") || "none"}; invalid provenance=${unknown.join(",") || "none"}.`,
          );
        }
      }
      if (assignment.status === "submitted") {
        if (
          assignment.result === options.result &&
          assignment.noFindings === (options.noFindings === true ? true : undefined) &&
          JSON.stringify(assignment.findingIds) === JSON.stringify(findingIds) &&
          assignment.submittedBy === options.author.trim() &&
          assignment.details === options.details?.trim() &&
          assignment.reportSha256 === reportSha256
        ) {
          return {
            scope: "delivery",
            execution: delivery.execution,
            assignment,
            report: assignment.report,
            reportSha256,
            idempotent: true,
            ...identity,
          };
        }
        throw new Error("The delivery review assignment already has a different submitted result.");
      }
      if (assignment.status !== "pending") {
        throw new Error("The delivery review assignment is not awaiting a report.");
      }
      if (
        JSON.stringify(this.gitEvidence.changedPaths(delivery.baseSha!)) !==
        JSON.stringify(assignment.inventory)
      ) {
        throw new Error("Aggregate review inventory changed while submitting the report.");
      }
      assignment.status = "submitted";
      assignment.result = options.result as ReviewResult;
      if (options.noFindings === true) assignment.noFindings = true;
      else delete assignment.noFindings;
      if (findingIds !== undefined) assignment.findingIds = findingIds;
      else delete assignment.findingIds;
      assignment.reportSha256 = reportSha256;
      assignment.submittedAt = new Date().toISOString();
      assignment.submittedBy = options.author.trim();
      if (options.details?.trim()) assignment.details = options.details.trim();
      const unresolvedBlocking = (assignment.findingIds ?? []).some((id) =>
        delivery.findings?.some(
          (finding) =>
            finding.id === id &&
            finding.blocking &&
            finding.status !== "fixed" &&
            finding.status !== "dismissed",
        ),
      );
      if (assignment.result !== "passed" || unresolvedBlocking) {
        delivery.execution = "changes-requested";
      }
      delivery.history.push({
        at: new Date().toISOString(),
        author: options.author.trim(),
        action: `aggregate-review-submitted:${assignment.id}:${assignment.result}`,
      });
      if (delivery.reviewAssignments?.every((item) => item.status === "submitted")) {
        for (const finding of delivery.findings ?? []) {
          if (
            !finding.blocking ||
            !finding.relatedTicket ||
            finding.status === "fixed" ||
            finding.status === "dismissed"
          ) {
            continue;
          }
          const ticket = ledger.tickets.find((item) => item.id === finding.relatedTicket);
          if (!ticket) throw new Error(`Related ticket not found: ${finding.relatedTicket}.`);
          ticket.status = "open";
          delete ticket.blocker;
        }
      }
      this.workspaceTransaction.writeLedger(feature, ledger);
      return {
        scope: "delivery",
        execution: delivery.execution,
        assignment,
        report: assignment.report,
        reportSha256,
        ...identity,
      };
    });
  }
}
