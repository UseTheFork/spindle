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
import { TaskPlanPolicy } from "@spindle/SubagentDrivenDevelopment/Policies/TaskPlanPolicy";
import { WorkflowPolicy } from "@spindle/SubagentDrivenDevelopment/Policies/WorkflowPolicy";
import { DeliverySubmissionService } from "@spindle/SubagentDrivenDevelopment/Services/DeliverySubmissionService";
import { FeatureInspectionService } from "@spindle/SubagentDrivenDevelopment/Services/FeatureInspectionService";
import matter from "gray-matter";

export class SubmissionService extends Service {
  public constructor(
    app: Application,
    private readonly gitEvidence: GitEvidence,
    private readonly reportEvidence: ReportEvidence,
    private readonly ticketRepository: TicketRepository,
    private readonly ledgerRepository: LedgerRepository,
    private readonly workspaceTransaction: WorkspaceTransaction,
    private readonly checkPolicy: CheckPolicy,
    private readonly reviewPolicy: ReviewPolicy,
    private readonly workflowPolicy: WorkflowPolicy,
    private readonly deliverySubmissionService: DeliverySubmissionService,
    private readonly featureInspectionService: FeatureInspectionService,
  ) {
    super(app);
  }

  public submit(options: SubmitOptions): {
    ticket?: string;
    scope?: "delivery";
    execution: ExecutionState;
    assignment: ImplementationAssignment | ReviewAssignment;
    report?: string;
    reportSha256?: string;
    unavailable?: boolean;
    idempotent?: boolean;
    headSha: string;
  } {
    if (options.scope === "delivery") {
      if (options.ticket) throw new Error("--ticket and --scope delivery are mutually exclusive.");
      InputValidation.validateAuthor(options.author);
      if (!options.assignment.trim()) throw new Error("--assignment must not be empty.");
      const feature = this.featureInspectionService.resolveFeature(options.spec);
      const delivery = this.ledgerRepository.readLedger(feature).delivery;
      if (delivery.assignment?.id === options.assignment) {
        return this.deliverySubmissionService.submitDeliveryImplementation(options);
      }
      if (delivery.reviewAssignments?.some((assignment) => assignment.id === options.assignment)) {
        return this.deliverySubmissionService.submitDeliveryReview(options);
      }
      throw new Error(`No delivery assignment matches ID ${options.assignment}.`);
    }
    if (options.scope !== undefined) throw new Error("--scope must be 'delivery'.");
    const ticketId = options.ticket;
    if (!ticketId) throw new Error("Submit requires --ticket or --scope delivery.");
    InputValidation.validateTicketId(ticketId);
    InputValidation.validateAuthor(options.author);
    if (!options.assignment.trim()) throw new Error("--assignment must not be empty.");
    const feature = this.featureInspectionService.resolveFeature(options.spec);
    const ledger = this.ledgerRepository.readLedger(feature);
    const progress = this.workflowPolicy.requireProgress(ledger, ticketId);
    const reviewAssignments = [
      ...(progress.reviewAssignments ?? []),
      ...(progress.correctionAttempts ?? []).flatMap((attempt) => attempt.reviewAssignments ?? []),
    ];
    if (reviewAssignments.some((assignment) => assignment.id === options.assignment)) {
      return this.submitReview(options);
    }
    if (progress.assignment?.id !== options.assignment) {
      throw new Error(`No assignment matches ID ${options.assignment} for ticket ${ticketId}.`);
    }
    if (options.result !== undefined && options.result !== "unavailable") {
      throw new Error("Implementation submission only accepts --result unavailable.");
    }
    const unavailable = options.result === "unavailable";
    if (unavailable && !options.details?.trim()) {
      throw new Error("--details is required when the implementation report is unavailable.");
    }
    if (!unavailable && options.details !== undefined) {
      throw new Error("--details is only valid with --result unavailable.");
    }
    return this.workspaceTransaction.run(feature.workspace, () => {
      const ledger = this.ledgerRepository.readLedger(feature);
      const ticket = this.ticketRepository.requireTicket(
        this.ticketRepository.readTickets(feature.workspace),
        ticketId,
      );
      const progress = this.workflowPolicy.requireProgress(ledger, ticketId);
      const identity = this.gitEvidence.commitIdentity(feature, ticket, progress.baseSha);
      const assignment = progress.assignment;
      if (!assignment || assignment.id !== options.assignment) {
        throw new Error("No matching implementation assignment is pending for this ticket.");
      }
      WorkflowPolicy.assertTicketOwner(progress.owner, options.author, feature.feature, ticketId);
      if (assignment.controller !== options.author.trim()) {
        throw new Error(
          `Ticket ${ticketId} owner ${progress.owner} does not match assignment controller ${assignment.controller}. Inspect the recorded assignment and handoff before submitting.`,
        );
      }
      TaskPlanPolicy.assertAllAccepted(progress, feature);
      if (unavailable) {
        const details = options.details!.trim();
        if (assignment.status === "unavailable" && assignment.unavailableDetails === details) {
          return {
            ticket: ticketId,
            execution: progress.execution,
            assignment,
            unavailable: true,
            idempotent: true,
            ...identity,
          };
        }
        if (assignment.status !== "pending" || progress.execution !== "implementing") {
          throw new Error("The implementation assignment is no longer awaiting a report.");
        }
        assignment.status = "unavailable";
        assignment.unavailableDetails = details;
        const afterTicket = matter.stringify(
          this.ticketRepository.appendAudit(
            ticket.body,
            options.author,
            `Implementation report unavailable for assignment ${assignment.id}: ${details}. Work remains pending.`,
          ),
          this.ticketRepository.metadata(ticket),
        );
        this.workspaceTransaction.writeWorkflowState(feature, ticket, afterTicket, ledger);
        return {
          ticket: ticketId,
          execution: progress.execution,
          assignment,
          unavailable: true,
          ...identity,
        };
      }
      if (assignment.status === "submitted") {
        const currentPath = this.reportEvidence.submissionReportPath(feature, assignment);
        const digest = this.reportEvidence.readReportDigest(feature, currentPath);
        if (digest !== assignment.reportSha256) {
          throw new Error("The registered implementation report changed after submission.");
        }
        return {
          ticket: ticketId,
          execution: progress.execution,
          assignment,
          report: assignment.report,
          reportSha256: digest,
          idempotent: true,
          ...identity,
        };
      }
      if (
        (assignment.status !== "pending" && assignment.status !== "unavailable") ||
        progress.execution !== "implementing"
      ) {
        throw new Error("The implementation assignment is not awaiting a report.");
      }
      const reportPath = this.reportEvidence.submissionReportPath(feature, assignment);
      let reportSha256: string;
      try {
        reportSha256 = this.reportEvidence.readReportDigest(feature, reportPath);
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "ENOENT"
        ) {
          throw new Error(
            `Implementation report is missing or unavailable at ${assignment.report}; the assignment remains pending.`,
          );
        }
        throw error;
      }
      const startingHeadSha =
        assignment.startingHeadSha ??
        (assignment.action === "implement"
          ? (progress.baseSha ?? progress.worktree?.baseSha)
          : undefined);
      if (!startingHeadSha) {
        const recovery =
          assignment.action === "correct"
            ? "Rerun the same sdd correct command to record the current starting commit, then commit the correction and submit again."
            : "Inspect the ticket ledger and worktree before submitting.";
        throw new Error(
          `Ticket ${ticketId} assignment ${assignment.id} has no recorded starting commit. ${recovery}`,
        );
      }
      this.gitEvidence.assertTicketCommitSince(progress, startingHeadSha, identity.headSha);
      assignment.status = "submitted";
      assignment.reportSha256 = reportSha256;
      assignment.submittedAt = new Date().toISOString();
      assignment.submittedBy = options.author.trim();
      delete assignment.unavailableDetails;
      if (assignment.action === "correct") {
        const attempt = progress.correctionAttempts?.find(
          (candidate) => candidate.number === assignment.attempt,
        );
        if (!attempt || attempt.assignmentId !== assignment.id) {
          throw new Error("Corrective assignment has no matching persisted attempt.");
        }
        attempt.assignment = assignment;
      }
      progress.execution = "reviewing";
      const afterTicket = matter.stringify(
        this.ticketRepository.appendAudit(
          ticket.body,
          options.author,
          `Implementation report submitted for assignment ${assignment.id}: ${assignment.report} (sha256 ${reportSha256}).`,
        ),
        this.ticketRepository.metadata(ticket),
      );
      this.workspaceTransaction.writeWorkflowState(feature, ticket, afterTicket, ledger);
      return {
        ticket: ticketId,
        execution: progress.execution,
        assignment,
        report: assignment.report,
        reportSha256,
        ...identity,
      };
    });
  }

  public submitReview(options: SubmitOptions): {
    ticket: string;
    execution: ExecutionState;
    assignment: ReviewAssignment;
    report: string;
    reportSha256: string;
    idempotent?: boolean;
    headSha: string;
  } {
    const ticketId = options.ticket;
    if (!ticketId) throw new Error("Review submission requires --ticket.");
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

    const feature = this.featureInspectionService.resolveFeature(options.spec);
    return this.workspaceTransaction.run(feature.workspace, () => {
      const ledger = this.ledgerRepository.readLedger(feature);
      const ticket = this.ticketRepository.requireTicket(
        this.ticketRepository.readTickets(feature.workspace),
        ticketId,
      );
      const progress = this.workflowPolicy.requireProgress(ledger, ticketId);
      if (!["reviewing", "changes-requested"].includes(progress.execution) || !progress.owner) {
        throw new Error(`Ticket ${ticketId} is not awaiting review submission.`);
      }
      WorkflowPolicy.assertTicketOwner(progress.owner, options.author, feature.feature, ticketId);
      const correctionAttempt = progress.correctionAttempts?.find((attempt) =>
        attempt.reviewAssignments?.some((candidate) => candidate.id === assignmentId),
      );
      const assignment =
        correctionAttempt?.reviewAssignments?.find((candidate) => candidate.id === assignmentId) ??
        progress.reviewAssignments?.find((candidate) => candidate.id === assignmentId);
      if (!assignment || assignment.role !== "review") {
        throw new Error(`No review assignment matches ID ${assignmentId}.`);
      }
      if (!progress.baseSha) throw new Error("Review assignment has no recorded Git baseline.");
      this.gitEvidence.assertTicketCodeCommitted(progress);
      const identity = this.gitEvidence.commitIdentity(feature, ticket, progress.baseSha);
      const checkBlockers = this.checkPolicy.reviewCheckBlockers(
        feature,
        ticket,
        progress,
        identity,
      );
      if (checkBlockers.length > 0) throw new Error(checkBlockers.join("\n"));
      const commitBlocker = this.reviewPolicy.reviewCommitBlocker(
        feature,
        progress,
        assignment,
        identity,
      );
      if (commitBlocker) throw new Error(commitBlocker);
      const reportPath = this.reportEvidence.submissionReportPath(feature, assignment);
      const reportSha256 = this.reportEvidence.readReportDigest(feature, reportPath);
      const registeredFromReport = (progress.findings ?? [])
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
          JSON.stringify(assignment.findingIds ?? []) === JSON.stringify(registeredFromReport) &&
          assignment.submittedBy === options.author.trim() &&
          assignment.details === options.details?.trim()
        ) {
          return {
            ticket: ticketId,
            execution: progress.execution,
            assignment,
            report: assignment.report,
            reportSha256,
            idempotent: true,
            ...identity,
          };
        }
        throw new Error("The review assignment already has a different submitted result.");
      }
      if (options.result === "failed" && registeredFromReport.length === 0) {
        throw new Error(
          ReviewBatch.failedReviewWithoutFindings(assignmentId, `--ticket ${ticketId}`),
        );
      }

      const confirmedTicket = this.ticketRepository.requireTicket(
        this.ticketRepository.readTickets(feature.workspace),
        ticketId,
      );
      const confirmedIdentity = this.gitEvidence.commitIdentity(
        feature,
        confirmedTicket,
        progress.baseSha,
      );
      this.gitEvidence.assertTicketCodeCommitted(progress);
      const confirmedInventory = this.gitEvidence.changedPaths(
        progress.baseSha,
        this.gitEvidence.ticketWorkspace(progress),
      );
      const confirmedReportDigest = this.reportEvidence.readReportDigest(feature, reportPath);
      if (
        confirmedIdentity.headSha !== identity.headSha ||
        (progress.worktree && confirmedIdentity.headSha !== identity.headSha) ||
        JSON.stringify(confirmedInventory) !== JSON.stringify(assignment.inventory) ||
        confirmedReportDigest !== reportSha256
      ) {
        throw new Error(
          "Review commit or inputs changed while submitting; retry against the frozen assignment.",
        );
      }

      assignment.status = "submitted";
      assignment.result = options.result as ReviewResult;
      assignment.findingIds = registeredFromReport;
      assignment.reportSha256 = reportSha256;
      assignment.submittedAt = new Date().toISOString();
      assignment.submittedBy = options.author.trim();
      if (options.details?.trim()) assignment.details = options.details.trim();
      const batch = correctionAttempt?.reviewAssignments ?? progress.reviewAssignments ?? [];
      if (ReviewBatch.reviewBatchRequestsChanges(batch, progress.findings ?? [])) {
        progress.execution = "changes-requested";
      }
      const afterTicket = matter.stringify(
        this.ticketRepository.appendAudit(
          ticket.body,
          options.author,
          `Review report submitted for assignment ${assignment.id}: result=${assignment.result}; findings=${registeredFromReport.join(",") || "none"}; report=${assignment.report} (sha256 ${reportSha256}).`,
        ),
        this.ticketRepository.metadata(ticket),
      );
      this.workspaceTransaction.writeWorkflowState(feature, ticket, afterTicket, ledger);
      return {
        ticket: ticketId,
        execution: progress.execution,
        assignment,
        report: assignment.report,
        reportSha256,
        ...identity,
      };
    });
  }
}
