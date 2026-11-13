import matter from "gray-matter";

import type { Application } from "@/Foundation/Application";
import { Service } from "@/Foundation/Service";
import { GitEvidence } from "@/SubagentDrivenDevelopment/Evidence/GitEvidence";
import { ReportEvidence } from "@/SubagentDrivenDevelopment/Evidence/ReportEvidence";
import type {
  ImplementationAssignment,
  ReviewResult,
  ReviewAssignment,
} from "@/SubagentDrivenDevelopment/Models/Assignments";
import type { ReviewFinding } from "@/SubagentDrivenDevelopment/Models/Findings";
import type { SubmitOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import type { ExecutionState } from "@/SubagentDrivenDevelopment/Models/Workflow";
import { LedgerRepository } from "@/SubagentDrivenDevelopment/Persistence/LedgerRepository";
import { TicketRepository } from "@/SubagentDrivenDevelopment/Persistence/TicketRepository";
import { WorkspaceTransaction } from "@/SubagentDrivenDevelopment/Persistence/WorkspaceTransaction";
import { CheckPolicy } from "@/SubagentDrivenDevelopment/Policies/CheckPolicy";
import {
  validateAuthor,
  validateTicketId,
} from "@/SubagentDrivenDevelopment/Policies/InputValidation";
import { ReviewPolicy } from "@/SubagentDrivenDevelopment/Policies/ReviewPolicy";
import { WorkflowPolicy } from "@/SubagentDrivenDevelopment/Policies/WorkflowPolicy";
import { DeliverySubmissionService } from "@/SubagentDrivenDevelopment/Services/DeliverySubmissionService";
import { FeatureInspectionService } from "@/SubagentDrivenDevelopment/Services/FeatureInspectionService";

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
      if (options.role === "implementation")
        return this.deliverySubmissionService.submitDeliveryImplementation(options);
      return this.deliverySubmissionService.submitDeliveryReview(options);
    }
    if (options.scope !== undefined) throw new Error("--scope must be 'delivery'.");
    if (!options.ticket) throw new Error("Submit requires --ticket or --scope delivery.");
    validateTicketId(options.ticket);
    validateAuthor(options.author);
    if (options.role === "review") return this.submitReview(options);
    if (options.role !== "implementation") {
      throw new Error("Submit role must be implementation or review.");
    }
    if (
      options.assignment !== undefined ||
      options.result !== undefined ||
      options.noFindings ||
      options.findings !== undefined
    ) {
      throw new Error("Review assignment, result, and no-findings options require role review.");
    }
    if (options.unavailable && !options.details?.trim()) {
      throw new Error("--details is required when the implementation report is unavailable.");
    }
    if (options.unavailable && options.report !== undefined) {
      throw new Error("--report cannot be combined with --unavailable.");
    }
    if (!options.unavailable && options.details !== undefined) {
      throw new Error("--details is only valid with --unavailable.");
    }
    const feature = this.featureInspectionService.resolveFeature(options.spec);
    return this.workspaceTransaction.run(feature.workspace, () => {
      const ledger = this.ledgerRepository.readLedger(feature);
      const ticket = this.ticketRepository.requireTicket(
        this.ticketRepository.readTickets(feature.workspace),
        options.ticket,
      );
      const progress = this.workflowPolicy.requireProgress(ledger, options.ticket);
      const identity = this.gitEvidence.commitIdentity(feature, ticket, progress.baseSha);
      const assignment = progress.assignment;
      if (!assignment || assignment.role !== options.role) {
        throw new Error("No matching implementation assignment is pending for this ticket.");
      }
      if (
        progress.owner !== options.author.trim() ||
        assignment.controller !== options.author.trim()
      ) {
        throw new Error("Only the current controller may submit this implementation report.");
      }
      if (options.unavailable) {
        const details = options.details!.trim();
        if (assignment.status === "unavailable" && assignment.unavailableDetails === details) {
          return {
            ticket: options.ticket,
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
          ticket: options.ticket,
          execution: progress.execution,
          assignment,
          unavailable: true,
          ...identity,
        };
      }
      if (assignment.status === "submitted") {
        const currentPath = this.reportEvidence.submissionReportPath(
          feature,
          assignment,
          options.report,
        );
        const digest = this.reportEvidence.readReportDigest(feature, currentPath);
        if (digest !== assignment.reportSha256) {
          throw new Error("The registered implementation report changed after submission.");
        }
        return {
          ticket: options.ticket,
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
      const reportPath = this.reportEvidence.submissionReportPath(
        feature,
        assignment,
        options.report,
      );
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
        ticket: options.ticket,
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
    if (!options.assignment?.trim()) {
      throw new Error("Review submission requires --assignment.");
    }
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
    if (options.unavailable) {
      throw new Error("Use --result unavailable, not --unavailable, for review submissions.");
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
        options.ticket,
      );
      const progress = this.workflowPolicy.requireProgress(ledger, options.ticket);
      if (!["reviewing", "changes-requested"].includes(progress.execution) || !progress.owner) {
        throw new Error(`Ticket ${options.ticket} is not awaiting review submission.`);
      }
      if (progress.owner !== options.author.trim()) {
        throw new Error("Only the current controller may submit a review result.");
      }
      const correctionAttempt = progress.correctionAttempts?.find((attempt) =>
        attempt.reviewAssignments?.some((candidate) => candidate.id === options.assignment),
      );
      const assignment =
        correctionAttempt?.reviewAssignments?.find(
          (candidate) => candidate.id === options.assignment,
        ) ?? progress.reviewAssignments?.find((candidate) => candidate.id === options.assignment);
      if (!assignment || assignment.role !== "review") {
        throw new Error(`No review assignment matches ID ${options.assignment}.`);
      }
      if (progress.execution === "changes-requested" && assignment.status !== "submitted") {
        throw new Error(`Ticket ${options.ticket} is awaiting a controller correction decision.`);
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
      const reportPath = this.reportEvidence.submissionReportPath(
        feature,
        assignment,
        options.report,
      );
      const reportSha256 = this.reportEvidence.readReportDigest(feature, reportPath);
      const registeredFromReport = (progress.findings ?? [])
        .filter((finding) =>
          finding.provenance.some(
            (source) =>
              source.report === assignment.report && source.headSha === assignment.headSha,
          ),
        )
        .map((finding) => finding.id);
      if (options.noFindings === true && registeredFromReport.length > 0) {
        throw new Error(
          `Review report has registered findings and cannot declare --no-findings: ${registeredFromReport.join(", ")}.`,
        );
      }
      if (findingIds !== undefined) {
        const missing = registeredFromReport.filter((id) => !findingIds.includes(id));
        const unknown = findingIds.filter((id) => !registeredFromReport.includes(id));
        if (missing.length > 0 || unknown.length > 0) {
          throw new Error(
            `--findings must exactly list canonical findings registered from this report and commit; missing=${missing.join(",") || "none"}; invalid provenance=${unknown.join(",") || "none"}.`,
          );
        }
      }

      if (assignment.status === "submitted") {
        if (
          assignment.result === options.result &&
          assignment.noFindings === (options.noFindings === true ? true : undefined) &&
          JSON.stringify(assignment.findingIds) === JSON.stringify(findingIds) &&
          assignment.submittedBy === options.author.trim() &&
          assignment.details === options.details?.trim()
        ) {
          return {
            ticket: options.ticket,
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

      const confirmedTicket = this.ticketRepository.requireTicket(
        this.ticketRepository.readTickets(feature.workspace),
        options.ticket,
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
      if (options.noFindings === true) assignment.noFindings = true;
      else delete assignment.noFindings;
      if (findingIds !== undefined) assignment.findingIds = findingIds;
      else delete assignment.findingIds;
      assignment.reportSha256 = reportSha256;
      assignment.submittedAt = new Date().toISOString();
      assignment.submittedBy = options.author.trim();
      if (options.details?.trim()) assignment.details = options.details.trim();
      const submittedFindings = (assignment.findingIds ?? [])
        .map((id) => progress.findings?.find((finding) => finding.id === id))
        .filter((finding): finding is ReviewFinding => finding !== undefined);
      if (
        assignment.result !== "passed" ||
        submittedFindings.some(
          (finding) =>
            finding.blocking && finding.status !== "fixed" && finding.status !== "dismissed",
        )
      ) {
        progress.execution = "changes-requested";
      }
      const afterTicket = matter.stringify(
        this.ticketRepository.appendAudit(
          ticket.body,
          options.author,
          `Review report submitted for assignment ${assignment.id}: result=${assignment.result}${assignment.noFindings === true ? "; no-findings explicitly declared" : `; findings=${(assignment.findingIds ?? []).join(",")}`}; report=${assignment.report} (sha256 ${reportSha256}).`,
        ),
        this.ticketRepository.metadata(ticket),
      );
      this.workspaceTransaction.writeWorkflowState(feature, ticket, afterTicket, ledger);
      return {
        ticket: options.ticket,
        execution: progress.execution,
        assignment,
        report: assignment.report,
        reportSha256,
        ...identity,
      };
    });
  }
}
