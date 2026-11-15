import matter from "gray-matter";

import type { Application } from "@spindle/Foundation/Application";
import { Service } from "@spindle/Foundation/Service";
import { GitEvidence } from "@spindle/SubagentDrivenDevelopment/Evidence/GitEvidence";
import type { RequirementsDecision } from "@spindle/SubagentDrivenDevelopment/Models/Findings";
import type { RequirementsDecideOptions } from "@spindle/SubagentDrivenDevelopment/Models/Options";
import type { ExecutionState } from "@spindle/SubagentDrivenDevelopment/Models/Workflow";
import { LedgerRepository } from "@spindle/SubagentDrivenDevelopment/Persistence/LedgerRepository";
import { TicketRepository } from "@spindle/SubagentDrivenDevelopment/Persistence/TicketRepository";
import { WorkspaceTransaction } from "@spindle/SubagentDrivenDevelopment/Persistence/WorkspaceTransaction";
import { InputValidation } from "@spindle/SubagentDrivenDevelopment/Policies/InputValidation";
import { WorkflowPolicy } from "@spindle/SubagentDrivenDevelopment/Policies/WorkflowPolicy";
import { FeatureInspectionService } from "@spindle/SubagentDrivenDevelopment/Services/FeatureInspectionService";

export class RequirementsService extends Service {
  public constructor(
    app: Application,
    private readonly gitEvidence: GitEvidence,
    private readonly ticketRepository: TicketRepository,
    private readonly ledgerRepository: LedgerRepository,
    private readonly workspaceTransaction: WorkspaceTransaction,
    private readonly workflowPolicy: WorkflowPolicy,
    private readonly featureInspectionService: FeatureInspectionService,
  ) {
    super(app);
  }

  public requirementsDecide(options: RequirementsDecideOptions): {
    ticket?: string;
    scope?: "delivery";
    execution: ExecutionState;
    decision: RequirementsDecision;
    idempotent?: boolean;
    headSha: string;
  } {
    InputValidation.validateAuthor(options.author);
    if (options.scope === "delivery") {
      if (options.ticket) throw new Error("--ticket and --scope delivery are mutually exclusive.");
      return this.deliveryRequirementsDecide(options);
    }
    if (options.scope !== undefined) throw new Error("--scope must be 'delivery'.");
    if (!options.ticket) throw new Error("requirements decide needs --ticket or --scope delivery.");
    InputValidation.validateTicketId(options.ticket);
    const ticketId = options.ticket;
    if (!/^F-\d{4,}$/.test(options.finding)) {
      throw new Error(`Invalid finding ID: ${options.finding}.`);
    }

    if (!["approved", "rejected"].includes(options.decision)) {
      throw new Error(`Invalid requirements decision: ${options.decision}.`);
    }
    if (!options.details.trim())
      throw new Error("Requirements decision details must not be empty.");

    const feature = this.featureInspectionService.resolveFeature(options.spec);
    return this.workspaceTransaction.run(feature.workspace, () => {
      const ledger = this.ledgerRepository.readLedger(feature);
      const ticket = this.ticketRepository.requireTicket(
        this.ticketRepository.readTickets(feature.workspace),
        ticketId,
      );
      const progress = this.workflowPolicy.requireProgress(ledger, ticketId);
      WorkflowPolicy.assertTicketOwner(progress.owner, options.author, feature.feature, ticketId);
      const finding = progress.findings?.find((candidate) => candidate.id === options.finding);
      if (!finding) throw new Error(`Finding not found: ${options.finding}.`);
      if (!progress.baseSha) {
        throw new Error("Requirements decisions require a recorded Git baseline.");
      }
      const identity = this.gitEvidence.commitIdentity(feature, ticket, progress.baseSha);
      this.gitEvidence.assertCommittedRequirements(
        feature,
        [ticket],
        this.gitEvidence.headSha(feature.workspace),
      );
      const currentFeatureHead = this.gitEvidence.headSha(feature.workspace);
      const decisions = (progress.requirementsDecisions ??= []);
      const existing = decisions.find(
        (decision) =>
          decision.finding === finding.id &&
          decision.status === options.decision &&
          decision.details === options.details.trim() &&
          decision.author === options.author.trim() &&
          decision.commitSha === currentFeatureHead,
      );
      if (existing) {
        return {
          ticket: ticketId,
          execution: progress.execution,
          decision: existing,
          idempotent: true,
          headSha: identity.headSha,
        };
      }
      const priorAssignments = [
        ...(progress.reviewHistory ?? []),
        ...(progress.reviewAssignments ?? []),
      ];
      if (
        priorAssignments.every((assignment) =>
          this.gitEvidence.requirementsMatchAtCommits(
            feature,
            ticket,
            assignment.headSha,
            currentFeatureHead,
            feature.workspace,
          ),
        )
      ) {
        throw new Error(
          "A requirements decision requires an explicit requirements change after review.",
        );
      }
      if (
        (progress.reviewAssignments ?? []).some((assignment) => assignment.status === "pending")
      ) {
        throw new Error(
          "Resolve pending review assignments before recording a requirements decision.",
        );
      }

      let highest = 0n;
      for (const decision of decisions) {
        const match = /^R-(\d{4,})$/.exec(decision.id);
        if (match && BigInt(match[1]!) > highest) highest = BigInt(match[1]!);
      }
      const decision: RequirementsDecision = {
        id: `R-${String(highest + 1n).padStart(4, "0")}`,
        finding: finding.id,
        status: options.decision as RequirementsDecision["status"],
        details: options.details.trim(),
        author: options.author.trim(),
        commitSha: currentFeatureHead,
        recordedAt: new Date().toISOString(),
      };
      decisions.push(decision);
      if (decision.status === "approved") {
        progress.reviewHistory = [
          ...(progress.reviewHistory ?? []),
          ...(progress.reviewAssignments ?? []),
        ];
        delete progress.reviewAssignments;
        progress.execution = "reviewing";
      }
      const currentIdentity = this.gitEvidence.commitIdentity(
        feature,
        this.ticketRepository.requireTicket(
          this.ticketRepository.readTickets(feature.workspace),
          ticketId,
        ),
        progress.baseSha,
      );
      if (currentIdentity.headSha !== identity.headSha) {
        throw new Error("Ticket requirements changed while recording the requirements decision.");
      }
      const afterTicket = matter.stringify(
        this.ticketRepository.appendAudit(
          ticket.body,
          options.author,
          `[SDD-SCOPE-RULING id=${decision.id} status=${decision.status}] ${decision.details}.`,
        ),
        this.ticketRepository.metadata(ticket),
      );
      this.workspaceTransaction.writeWorkflowState(feature, ticket, afterTicket, ledger);
      return {
        ticket: ticketId,
        execution: progress.execution,
        decision,
        headSha: identity.headSha,
      };
    });
  }

  public deliveryRequirementsDecide(options: RequirementsDecideOptions): {
    scope: "delivery";
    execution: ExecutionState;
    decision: RequirementsDecision;
    idempotent?: boolean;
    headSha: string;
  } {
    if (!/^F-\d{4,}$/.test(options.finding)) {
      throw new Error(`Invalid finding ID: ${options.finding}.`);
    }
    if (!["approved", "rejected"].includes(options.decision)) {
      throw new Error(`Invalid requirements decision: ${options.decision}.`);
    }
    const details = options.details.trim();
    if (!details) throw new Error("Requirements decision details must not be empty.");

    const feature = this.featureInspectionService.resolveFeature(options.spec);
    return this.workspaceTransaction.run(feature.workspace, () => {
      const ledger = this.ledgerRepository.readLedger(feature);
      const delivery = ledger.delivery;
      WorkflowPolicy.assertDeliveryOwner(delivery.owner, options.author, feature.feature);
      const finding = delivery.findings?.find((candidate) => candidate.id === options.finding);
      if (!finding) throw new Error(`Delivery finding not found: ${options.finding}.`);
      if (!delivery.baseSha) {
        throw new Error("Delivery requirements decisions require a recorded Git baseline.");
      }
      const identity = this.gitEvidence.deliveryCommitIdentity(
        feature,
        ledger,
        this.ticketRepository.readTickets(feature.workspace),
      );
      const tickets = this.ticketRepository.readTickets(feature.workspace);
      this.gitEvidence.assertCommittedRequirements(feature, tickets, identity.headSha);
      const decisions = (delivery.requirementsDecisions ??= []);
      const existing = decisions.find(
        (decision) =>
          decision.finding === finding.id &&
          decision.status === options.decision &&
          decision.details === details &&
          decision.author === options.author.trim() &&
          decision.commitSha === identity.headSha,
      );
      if (existing) {
        return {
          scope: "delivery",
          execution: delivery.execution,
          decision: existing,
          idempotent: true,
          headSha: identity.headSha,
        };
      }
      const priorAssignments = [
        ...(delivery.reviewHistory ?? []),
        ...(delivery.reviewAssignments ?? []),
      ];
      if (
        priorAssignments.every((assignment) =>
          this.gitEvidence.deliveryRequirementsMatchAtCommits(
            feature,
            assignment.headSha,
            identity.headSha,
            feature.workspace,
          ),
        )
      ) {
        throw new Error(
          "A delivery requirements decision requires an explicit requirements change after review.",
        );
      }
      if (
        (delivery.reviewAssignments ?? []).some((assignment) => assignment.status === "pending")
      ) {
        throw new Error(
          "Resolve pending delivery review assignments before recording a requirements decision.",
        );
      }

      let highest = 0n;
      for (const decision of decisions) {
        const match = /^R-(\d{4,})$/.exec(decision.id);
        if (match && BigInt(match[1]!) > highest) highest = BigInt(match[1]!);
      }
      const decision: RequirementsDecision = {
        id: `R-${String(highest + 1n).padStart(4, "0")}`,
        finding: finding.id,
        status: options.decision as RequirementsDecision["status"],
        details,
        author: options.author.trim(),
        commitSha: identity.headSha,
        recordedAt: new Date().toISOString(),
      };
      decisions.push(decision);
      if (decision.status === "approved") {
        delivery.reviewHistory = [
          ...(delivery.reviewHistory ?? []),
          ...(delivery.reviewAssignments ?? []),
        ];
        delete delivery.reviewAssignments;
        delivery.execution = "reviewing";
      }
      const confirmed = this.gitEvidence.deliveryCommitIdentity(feature, ledger, tickets);
      if (confirmed.headSha !== identity.headSha) {
        throw new Error("Delivery requirements changed while recording the requirements decision.");
      }
      delivery.history.push({
        at: new Date().toISOString(),
        author: options.author.trim(),
        action: `requirements-${decision.status}:${decision.id}`,
      });
      this.workspaceTransaction.writeLedger(feature, ledger);
      return {
        scope: "delivery",
        execution: delivery.execution,
        decision,
        headSha: identity.headSha,
      };
    });
  }
}
