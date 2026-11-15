import type { Application } from "@spindle/Foundation/Application";
import { Service } from "@spindle/Foundation/Service";
import { GitEvidence } from "@spindle/SubagentDrivenDevelopment/Evidence/GitEvidence";
import { ReportEvidence } from "@spindle/SubagentDrivenDevelopment/Evidence/ReportEvidence";
import type {
  ImplementationAssignment,
  ReviewResult,
  ReviewAssignment,
} from "@spindle/SubagentDrivenDevelopment/Models/Assignments";
import type { SubmitOptions } from "@spindle/SubagentDrivenDevelopment/Models/Options";
import type { ExecutionState } from "@spindle/SubagentDrivenDevelopment/Models/Workflow";
import { LedgerRepository } from "@spindle/SubagentDrivenDevelopment/Persistence/LedgerRepository";
import { TicketRepository } from "@spindle/SubagentDrivenDevelopment/Persistence/TicketRepository";
import { WorkspaceTransaction } from "@spindle/SubagentDrivenDevelopment/Persistence/WorkspaceTransaction";
import { CheckPolicy } from "@spindle/SubagentDrivenDevelopment/Policies/CheckPolicy";
import { InputValidation } from "@spindle/SubagentDrivenDevelopment/Policies/InputValidation";
import { ReviewBatch } from "@spindle/SubagentDrivenDevelopment/Policies/ReviewBatch";
import { ReviewPolicy } from "@spindle/SubagentDrivenDevelopment/Policies/ReviewPolicy";
import { WorkflowPolicy } from "@spindle/SubagentDrivenDevelopment/Policies/WorkflowPolicy";
import { FeatureInspectionService } from "@spindle/SubagentDrivenDevelopment/Services/FeatureInspectionService";

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
    if (options.result !== undefined && options.result !== "unavailable") {
      throw new Error("Implementation submission only accepts --result unavailable.");
    }
    const unavailable = options.result === "unavailable";
    if (unavailable && !options.details?.trim()) {
      throw new Error(
        "--details is required when the delivery implementation report is unavailable.",
      );
    }
    if (!unavailable && options.details !== undefined) {
      throw new Error("--details is only valid with --result unavailable.");
    }
    InputValidation.validateAuthor(options.author);
    const feature = this.featureInspectionService.resolveFeature(options.spec);
    return this.workspaceTransaction.run(feature.workspace, () => {
      const ledger = this.ledgerRepository.readLedger(feature);
      const delivery = ledger.delivery;
      WorkflowPolicy.assertDeliveryOwner(delivery.owner, options.author, feature.feature);
      const assignment = delivery.assignment;
      if (
        !assignment ||
        assignment.id !== options.assignment ||
        assignment.action !== "correct" ||
        assignment.role !== "implementation"
      ) {
        throw new Error("No matching delivery correction implementation assignment is pending.");
      }
      if (assignment.controller !== options.author.trim()) {
        throw new Error(
          `Delivery owner ${delivery.owner} does not match assignment controller ${assignment.controller}. Inspect the recorded assignment and handoff before submitting.`,
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
      if (unavailable) {
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
      if (assignment.status === "submitted") {
        const digest = this.reportEvidence.readReportDigest(
          feature,
          this.reportEvidence.submissionReportPath(feature, assignment),
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
      const report = this.reportEvidence.submissionReportPath(feature, assignment);
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
    const assignmentId = options.assignment.trim();
    if (!assignmentId) throw new Error("--assignment must not be empty.");
    if (!options.result) throw new Error("Review submission requires explicit --result.");
    if (!["passed", "failed", "unavailable"].includes(options.result)) {
      throw new Error(`Invalid review result: ${options.result}.`);
    }
    if (options.result === "passed" && options.details !== undefined) {
      throw new Error("--details is only valid for failed or unavailable review results.");
    }
    if (options.result !== "passed" && !options.details?.trim()) {
      throw new Error("--details is required for failed or unavailable reviews.");
    }
    InputValidation.validateAuthor(options.author);
    const feature = this.featureInspectionService.resolveFeature(options.spec);
    return this.workspaceTransaction.run(feature.workspace, () => {
      const ledger = this.ledgerRepository.readLedger(feature);
      const delivery = ledger.delivery;
      WorkflowPolicy.assertDeliveryOwner(delivery.owner, options.author, feature.feature);
      const assignment = delivery.reviewAssignments?.find(
        (candidate) => candidate.id === assignmentId,
      );
      if (!assignment || assignment.scope !== "delivery") {
        throw new Error(`No delivery review assignment matches ID ${assignmentId}.`);
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
      const report = this.reportEvidence.submissionReportPath(feature, assignment);
      const reportSha256 = this.reportEvidence.readReportDigest(feature, report);
      const reported = (delivery.findings ?? [])
        .filter((finding) =>
          finding.provenance.some(
            (source) =>
              source.report === assignment.report && source.headSha === assignment.headSha,
          ),
        )
        .map((finding) => finding.id);
      if (assignment.status === "submitted") {
        if (
          assignment.result === options.result &&
          JSON.stringify(assignment.findingIds ?? []) === JSON.stringify(reported) &&
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
      if (options.result === "failed" && reported.length === 0) {
        throw new Error(ReviewBatch.failedReviewWithoutFindings(assignmentId, "--scope delivery"));
      }
      if (
        JSON.stringify(this.gitEvidence.changedPaths(delivery.baseSha!)) !==
        JSON.stringify(assignment.inventory)
      ) {
        throw new Error("Aggregate review inventory changed while submitting the report.");
      }
      assignment.status = "submitted";
      assignment.result = options.result as ReviewResult;
      assignment.findingIds = reported;
      assignment.reportSha256 = reportSha256;
      assignment.submittedAt = new Date().toISOString();
      assignment.submittedBy = options.author.trim();
      if (options.details?.trim()) assignment.details = options.details.trim();
      const batch = delivery.reviewAssignments ?? [];
      if (ReviewBatch.reviewBatchRequestsChanges(batch, delivery.findings ?? [])) {
        delivery.execution = "changes-requested";
      }
      delivery.history.push({
        at: new Date().toISOString(),
        author: options.author.trim(),
        action: `aggregate-review-submitted:${assignment.id}:${assignment.result}`,
      });
      if (ReviewBatch.reviewBatchComplete(batch)) {
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
