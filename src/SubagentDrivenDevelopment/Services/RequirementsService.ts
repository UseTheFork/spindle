import matter from "gray-matter";

import type { Application } from "@/foundation/Application";
import { Service } from "@/services/Service";
import { GitEvidence } from "@/SubagentDrivenDevelopment/Evidence/GitEvidence";
import type { RequirementsDecision } from "@/SubagentDrivenDevelopment/Models/Findings";
import type { RequirementsDecideOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import type { ExecutionState } from "@/SubagentDrivenDevelopment/Models/Workflow";
import { IssueRepository } from "@/SubagentDrivenDevelopment/Persistence/IssueRepository";
import { LedgerRepository } from "@/SubagentDrivenDevelopment/Persistence/LedgerRepository";
import { WorkspaceTransaction } from "@/SubagentDrivenDevelopment/Persistence/WorkspaceTransaction";
import {
  validateAuthor,
  validateIssueId,
} from "@/SubagentDrivenDevelopment/Policies/InputValidation";
import { WorkflowPolicy } from "@/SubagentDrivenDevelopment/Policies/WorkflowPolicy";
import { FeatureInspectionService } from "@/SubagentDrivenDevelopment/Services/FeatureInspectionService";

export class RequirementsService extends Service {
  public constructor(
    app: Application,
    private readonly gitEvidence: GitEvidence,
    private readonly issueRepository: IssueRepository,
    private readonly ledgerRepository: LedgerRepository,
    private readonly workspaceTransaction: WorkspaceTransaction,
    private readonly workflowPolicy: WorkflowPolicy,
    private readonly featureInspectionService: FeatureInspectionService,
  ) {
    super(app);
  }

  public requirementsDecide(options: RequirementsDecideOptions): {
    issue?: string;
    scope?: "delivery";
    execution: ExecutionState;
    decision: RequirementsDecision;
    idempotent?: boolean;
    snapshot: string;
    requirementsSnapshot: string;
  } {
    validateAuthor(options.author);
    if (options.scope === "delivery") {
      if (options.issue) throw new Error("--issue and --scope delivery are mutually exclusive.");
      return this.deliveryRequirementsDecide(options);
    }
    if (options.scope !== undefined) throw new Error("--scope must be 'delivery'.");
    if (!options.issue) throw new Error("requirements decide needs --issue or --scope delivery.");
    validateIssueId(options.issue);
    const issueId = options.issue;
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
      const issue = this.issueRepository.requireIssue(
        this.issueRepository.readIssues(feature.workspace),
        issueId,
      );
      const progress = this.workflowPolicy.requireProgress(ledger, issueId);
      if (progress.owner !== options.author.trim()) {
        throw new Error("Only the current issue controller may record a requirements decision.");
      }
      const finding = progress.findings?.find((candidate) => candidate.id === options.finding);
      if (!finding) throw new Error(`Finding not found: ${options.finding}.`);
      if (!progress.baseSha) {
        throw new Error("Requirements decisions require a recorded Git baseline.");
      }
      const identity = this.gitEvidence.contentIdentity(
        feature,
        issue,
        progress.baseSha,
        progress.checks,
      );
      const decisions = (progress.requirementsDecisions ??= []);
      const existing = decisions.find(
        (decision) =>
          decision.finding === finding.id &&
          decision.status === options.decision &&
          decision.details === options.details.trim() &&
          decision.author === options.author.trim() &&
          decision.requirementsSnapshot === identity.requirementsSnapshot,
      );
      if (existing) {
        return {
          issue: issueId,
          execution: progress.execution,
          decision: existing,
          idempotent: true,
          snapshot: identity.snapshot,
          requirementsSnapshot: identity.requirementsSnapshot,
        };
      }
      const priorAssignments = [
        ...(progress.reviewHistory ?? []),
        ...(progress.reviewAssignments ?? []),
      ];
      if (
        priorAssignments.every(
          (assignment) => assignment.requirementsSnapshot === identity.requirementsSnapshot,
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
        requirementsSnapshot: identity.requirementsSnapshot,
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
      const currentIdentity = this.gitEvidence.contentIdentity(
        feature,
        this.issueRepository.requireIssue(
          this.issueRepository.readIssues(feature.workspace),
          issueId,
        ),
        progress.baseSha,
        progress.checks,
      );
      if (
        currentIdentity.snapshot !== identity.snapshot ||
        currentIdentity.requirementsSnapshot !== identity.requirementsSnapshot
      ) {
        throw new Error("Issue requirements changed while recording the requirements decision.");
      }
      const afterIssue = matter.stringify(
        this.issueRepository.appendAudit(
          issue.body,
          options.author,
          `[SDD-SCOPE-RULING id=${decision.id} status=${decision.status}] ${decision.details}.`,
        ),
        this.issueRepository.metadata(issue),
      );
      this.workspaceTransaction.writeWorkflowState(feature, issue, afterIssue, ledger);
      return {
        issue: issueId,
        execution: progress.execution,
        decision,
        snapshot: identity.snapshot,
        requirementsSnapshot: identity.requirementsSnapshot,
      };
    });
  }

  public deliveryRequirementsDecide(options: RequirementsDecideOptions): {
    scope: "delivery";
    execution: ExecutionState;
    decision: RequirementsDecision;
    idempotent?: boolean;
    snapshot: string;
    requirementsSnapshot: string;
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
      if (delivery.owner !== options.author.trim()) {
        throw new Error("Only the current delivery controller may record a requirements decision.");
      }
      const finding = delivery.findings?.find((candidate) => candidate.id === options.finding);
      if (!finding) throw new Error(`Delivery finding not found: ${options.finding}.`);
      if (!delivery.baseSha) {
        throw new Error("Delivery requirements decisions require a recorded Git baseline.");
      }
      const identity = this.gitEvidence.deliveryIdentity(
        feature,
        ledger,
        this.issueRepository.readIssues(feature.workspace),
      );
      const decisions = (delivery.requirementsDecisions ??= []);
      const existing = decisions.find(
        (decision) =>
          decision.finding === finding.id &&
          decision.status === options.decision &&
          decision.details === details &&
          decision.author === options.author.trim() &&
          decision.requirementsSnapshot === identity.requirementsSnapshot,
      );
      if (existing) {
        return {
          scope: "delivery",
          execution: delivery.execution,
          decision: existing,
          idempotent: true,
          snapshot: identity.snapshot,
          requirementsSnapshot: identity.requirementsSnapshot,
        };
      }
      const priorAssignments = [
        ...(delivery.reviewHistory ?? []),
        ...(delivery.reviewAssignments ?? []),
      ];
      if (
        priorAssignments.every(
          (assignment) => assignment.requirementsSnapshot === identity.requirementsSnapshot,
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
        requirementsSnapshot: identity.requirementsSnapshot,
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
      const confirmed = this.gitEvidence.deliveryIdentity(
        feature,
        ledger,
        this.issueRepository.readIssues(feature.workspace),
      );
      if (
        confirmed.snapshot !== identity.snapshot ||
        confirmed.requirementsSnapshot !== identity.requirementsSnapshot
      ) {
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
        snapshot: identity.snapshot,
        requirementsSnapshot: identity.requirementsSnapshot,
      };
    });
  }
}
