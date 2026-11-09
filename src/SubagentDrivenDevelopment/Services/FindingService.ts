import { isAbsolute, resolve } from "node:path";

import matter from "gray-matter";

import type { Application } from "@/Foundation/Application";
import { Service } from "@/Foundation/Service";
import { GitEvidence } from "@/SubagentDrivenDevelopment/Evidence/GitEvidence";
import { ReportEvidence } from "@/SubagentDrivenDevelopment/Evidence/ReportEvidence";
import type {
  FindingSeverity,
  FindingStatus,
  FindingProvenance,
  RequirementsDecision,
  ReviewFinding,
} from "@/SubagentDrivenDevelopment/Models/Findings";
import type {
  FindingCreateOptions,
  FindingUpdateOptions,
} from "@/SubagentDrivenDevelopment/Models/Options";
import { LedgerRepository } from "@/SubagentDrivenDevelopment/Persistence/LedgerRepository";
import { TicketRepository } from "@/SubagentDrivenDevelopment/Persistence/TicketRepository";
import { WorkspaceTransaction } from "@/SubagentDrivenDevelopment/Persistence/WorkspaceTransaction";
import { CheckPolicy } from "@/SubagentDrivenDevelopment/Policies/CheckPolicy";
import { FindingPolicy } from "@/SubagentDrivenDevelopment/Policies/FindingPolicy";
import {
  validateAuthor,
  validateTicketId,
} from "@/SubagentDrivenDevelopment/Policies/InputValidation";
import { requiredTicketReviewers } from "@/SubagentDrivenDevelopment/Policies/RequiredReviewers";
import { ReviewPolicy } from "@/SubagentDrivenDevelopment/Policies/ReviewPolicy";
import { WorkflowPolicy } from "@/SubagentDrivenDevelopment/Policies/WorkflowPolicy";
import { DeliveryFindingService } from "@/SubagentDrivenDevelopment/Services/DeliveryFindingService";
import { FeatureInspectionService } from "@/SubagentDrivenDevelopment/Services/FeatureInspectionService";

export class FindingService extends Service {
  public constructor(
    app: Application,
    private readonly gitEvidence: GitEvidence,
    private readonly reportEvidence: ReportEvidence,
    private readonly ticketRepository: TicketRepository,
    private readonly ledgerRepository: LedgerRepository,
    private readonly workspaceTransaction: WorkspaceTransaction,
    private readonly checkPolicy: CheckPolicy,
    private readonly findingPolicy: FindingPolicy,
    private readonly reviewPolicy: ReviewPolicy,
    private readonly workflowPolicy: WorkflowPolicy,
    private readonly deliveryFindingService: DeliveryFindingService,
    private readonly featureInspectionService: FeatureInspectionService,
  ) {
    super(app);
  }

  public findingCreate(options: FindingCreateOptions): {
    ticket?: string;
    scope?: "delivery";
    finding: ReviewFinding;
    idempotent?: boolean;
    snapshot: string;
    headSha: string;
  } {
    if (options.scope === "delivery") {
      if (options.ticket) throw new Error("--ticket and --scope delivery are mutually exclusive.");
      return this.deliveryFindingService.deliveryFindingCreate(options);
    }
    if (options.scope !== undefined) throw new Error("--scope must be 'delivery'.");
    if (options.relatedTicket !== undefined) {
      throw new Error("--related-ticket is only valid for a delivery finding.");
    }
    if (!options.ticket) throw new Error("Finding creation requires --ticket or --scope delivery.");
    validateTicketId(options.ticket);
    validateAuthor(options.author);
    if (!["high", "medium", "low"].includes(options.severity)) {
      throw new Error(`Invalid finding severity: ${options.severity}.`);
    }
    if (options.blocking === options.nonBlocking) {
      throw new Error("Choose exactly one of --blocking or --non-blocking.");
    }
    if (!options.summary.trim()) throw new Error("Finding summary must not be empty.");
    if (!options.details.trim()) throw new Error("Finding details must not be empty.");
    if (!/^[0-9a-f]{64}$/i.test(options.snapshot)) {
      throw new Error("Finding snapshot must be a CLI-returned content snapshot.");
    }

    const feature = this.featureInspectionService.resolveFeature(options.spec);
    return this.workspaceTransaction.run(feature.workspace, () => {
      const ledger = this.ledgerRepository.readLedger(feature);
      const ticket = this.ticketRepository.requireTicket(
        this.ticketRepository.readTickets(feature.workspace),
        options.ticket,
      );
      const progress = this.workflowPolicy.requireProgress(ledger, options.ticket);
      if (progress.owner !== options.author.trim()) {
        throw new Error("Only the current ticket controller may register findings.");
      }
      const report = options.source
        ? isAbsolute(options.source)
          ? resolve(options.source)
          : resolve(feature.workspace, options.source)
        : "";
      const correctionAttempt = progress.correctionAttempts?.find((attempt) =>
        attempt.reviewAssignments?.some(
          (candidate) => candidate.report === report && candidate.snapshot === options.snapshot,
        ),
      );
      const assignment =
        correctionAttempt?.reviewAssignments?.find(
          (candidate) => candidate.report === report && candidate.snapshot === options.snapshot,
        ) ??
        progress.reviewAssignments?.find(
          (candidate) => candidate.report === report && candidate.snapshot === options.snapshot,
        );
      if (!assignment) {
        throw new Error(
          "Finding source report and snapshot must match a frozen review assignment for this ticket.",
        );
      }
      if (assignment.status === "submitted") {
        throw new Error("Findings must be registered before submitting the review assignment.");
      }
      if (!progress.baseSha)
        throw new Error("Finding registration requires a recorded Git baseline.");
      const identity = this.gitEvidence.contentIdentity(
        feature,
        ticket,
        progress.baseSha,
        progress.checks,
      );
      const snapshotBlocker = this.reviewPolicy.reviewSnapshotBlocker(
        feature,
        progress,
        assignment,
        identity,
      );
      if (snapshotBlocker) throw new Error(snapshotBlocker);
      this.reportEvidence.readReportDigest(feature, report);
      const source: FindingProvenance = {
        report,
        snapshot: options.snapshot,
        author: options.author.trim(),
        summary: options.summary.trim(),
        details: options.details.trim(),
      };
      const findings = progress.findings ?? [];
      if (options.link !== undefined) {
        if (!/^F-\d{4,}$/.test(options.link)) {
          throw new Error(`Invalid canonical finding ID to link: ${options.link}.`);
        }
        const canonical = findings.find((finding) => finding.id === options.link);
        if (!canonical) throw new Error(`Canonical finding not found: ${options.link}.`);
        const priorSource = canonical.provenance.find(
          (provenance) =>
            provenance.report === source.report && provenance.snapshot === source.snapshot,
        );
        if (priorSource) {
          if (
            priorSource.author !== source.author ||
            priorSource.summary !== source.summary ||
            priorSource.details !== source.details
          ) {
            throw new Error("This report and snapshot are already linked with different details.");
          }
          return {
            ticket: options.ticket,
            finding: canonical,
            idempotent: true,
            snapshot: identity.snapshot,
            headSha: identity.headSha,
          };
        }
        canonical.provenance.push(source);
        canonical.history.push({
          at: new Date().toISOString(),
          author: options.author.trim(),
          action: "observation-linked",
          details: `Linked observation from ${report} at snapshot ${options.snapshot}: ${source.summary} — ${source.details}`,
        });
        if (canonical.status === "fixed" || canonical.status === "dismissed") {
          canonical.status = "open";
          delete canonical.rulingDetails;
          delete canonical.followUp;
          delete canonical.requirementsDecision;
          delete canonical.verification;
          canonical.history.push({
            at: new Date().toISOString(),
            author: options.author.trim(),
            action: "observation-reopened",
            details: `New observation from ${report} at snapshot ${options.snapshot} requires renewed adjudication.`,
          });
        }
        const afterTicket = matter.stringify(
          this.ticketRepository.appendAudit(
            ticket.body,
            options.author,
            `Observation linked to finding ${canonical.id}: source=${report}; snapshot=${options.snapshot}; summary=${source.summary}.`,
          ),
          this.ticketRepository.metadata(ticket),
        );
        this.workspaceTransaction.writeWorkflowState(feature, ticket, afterTicket, ledger);
        return {
          ticket: options.ticket,
          finding: canonical,
          snapshot: identity.snapshot,
          headSha: identity.headSha,
        };
      }
      const existing = findings.find(
        (finding) =>
          finding.author === options.author.trim() &&
          finding.severity === options.severity &&
          finding.blocking === (options.blocking === true) &&
          finding.summary === options.summary.trim() &&
          finding.details === options.details.trim() &&
          finding.provenance.some(
            (provenance) =>
              provenance.report === source.report &&
              provenance.snapshot === source.snapshot &&
              provenance.author === source.author &&
              provenance.summary === source.summary &&
              provenance.details === source.details,
          ),
      );
      if (existing) {
        return {
          ticket: options.ticket,
          finding: existing,
          idempotent: true,
          snapshot: identity.snapshot,
          headSha: identity.headSha,
        };
      }

      let highest = 0n;
      for (const candidate of findings) {
        const match = /^F-(\d{4,})$/.exec(candidate.id);
        if (match && BigInt(match[1]!) > highest) highest = BigInt(match[1]!);
      }
      const at = new Date().toISOString();
      progress.findings = findings;
      const finding: ReviewFinding = {
        id: `F-${String(highest + 1n).padStart(4, "0")}`,
        severity: options.severity as FindingSeverity,
        blocking: options.blocking === true,
        status: "open",
        summary: options.summary.trim(),
        details: options.details.trim(),
        author: options.author.trim(),
        createdAt: at,
        provenance: [source],
        history: [
          {
            at,
            author: options.author.trim(),
            action: "registered",
            details: `Registered from ${report} at snapshot ${options.snapshot}.`,
          },
        ],
      };
      findings.push(finding);
      const afterTicket = matter.stringify(
        this.ticketRepository.appendAudit(
          ticket.body,
          options.author,
          `Finding ${finding.id} registered by ${options.author.trim()}: ${finding.summary}; source=${report}; snapshot=${options.snapshot}.`,
        ),
        this.ticketRepository.metadata(ticket),
      );
      this.workspaceTransaction.writeWorkflowState(feature, ticket, afterTicket, ledger);
      return {
        ticket: options.ticket,
        finding,
        snapshot: identity.snapshot,
        headSha: identity.headSha,
      };
    });
  }

  public findingUpdate(options: FindingUpdateOptions): {
    ticket?: string;
    scope?: "delivery";
    finding: ReviewFinding;
    idempotent?: boolean;
    snapshot: string;
  } {
    if (options.scope === "delivery") {
      if (options.ticket) throw new Error("--ticket and --scope delivery are mutually exclusive.");
      return this.deliveryFindingService.deliveryFindingUpdate(options);
    }
    if (options.scope !== undefined) throw new Error("--scope must be 'delivery'.");
    if (!options.ticket) throw new Error("Finding update requires --ticket or --scope delivery.");
    validateTicketId(options.ticket);
    validateAuthor(options.author);
    if (!/^F-\d{4,}$/.test(options.finding)) {
      throw new Error(`Invalid finding ID: ${options.finding}.`);
    }
    if (!["open", "confirmed", "fixed", "dismissed", "deferred"].includes(options.status)) {
      throw new Error(`Invalid finding status: ${options.status}.`);
    }
    if (["dismissed", "deferred"].includes(options.status) && !options.details?.trim()) {
      throw new Error(`--details is required for a ${options.status} finding disposition.`);
    }
    if (options.status === "deferred" && !options.followUp?.trim()) {
      throw new Error("--follow-up is required for a deferred finding.");
    }
    if (options.status === "fixed" && !options.evidence?.trim()) {
      throw new Error("--evidence is required to mark a finding fixed.");
    }
    if (options.status !== "deferred" && options.followUp !== undefined) {
      throw new Error("--follow-up is only valid for a deferred finding.");
    }
    if (options.status !== "deferred" && options.requirementsDecision !== undefined) {
      throw new Error("--requirements-decision is only valid for a deferred finding.");
    }
    if (options.status !== "fixed" && options.evidence !== undefined) {
      throw new Error("--evidence is only valid for a fixed finding.");
    }

    const feature = this.featureInspectionService.resolveFeature(options.spec);
    return this.workspaceTransaction.run(feature.workspace, () => {
      const ledger = this.ledgerRepository.readLedger(feature);
      const ticket = this.ticketRepository.requireTicket(
        this.ticketRepository.readTickets(feature.workspace),
        options.ticket,
      );
      const progress = this.workflowPolicy.requireProgress(ledger, options.ticket);
      const finding = progress.findings?.find((candidate) => candidate.id === options.finding);
      if (!finding) throw new Error(`Finding not found: ${options.finding}.`);
      const wasBlocking = finding.blocking && !["fixed", "dismissed"].includes(finding.status);
      if (progress.owner !== options.author.trim()) {
        throw new Error("Only the current ticket controller may record a finding ruling.");
      }
      if (!progress.baseSha) throw new Error("Finding rulings require a recorded Git baseline.");
      const identity = this.gitEvidence.contentIdentity(
        feature,
        ticket,
        progress.baseSha,
        progress.checks,
      );
      let verification: ReviewFinding["verification"];
      let requirementsDecision: RequirementsDecision | undefined;
      if (options.status === "deferred" && finding.blocking) {
        if (!options.requirementsDecision) {
          throw new Error(
            `Blocking finding ${finding.id} requires an approved requirements decision and fresh review before deferral.`,
          );
        }
        requirementsDecision = progress.requirementsDecisions?.find(
          (decision) =>
            decision.id === options.requirementsDecision &&
            decision.finding === finding.id &&
            decision.status === "approved" &&
            decision.requirementsSnapshot === identity.requirementsSnapshot,
        );
        if (!requirementsDecision) {
          throw new Error(
            "Blocking finding deferral requires a matching approved requirements decision for the current requirements snapshot.",
          );
        }
        const assignments = progress.reviewAssignments ?? [];
        for (const { agent, details } of requiredTicketReviewers(ledger, progress)) {
          const coverage = assignments.filter(
            (assignment) => assignment.agent === agent && assignment.scope === "initial",
          );
          if (
            coverage.length !== 1 ||
            coverage[0]!.objective !== details ||
            coverage[0]!.status !== "submitted" ||
            coverage[0]!.result !== "passed" ||
            this.reviewPolicy.reviewAssignmentBlocker(feature, progress, coverage[0]!, identity)
          ) {
            throw new Error(
              `Blocking finding deferral requires fresh passing review coverage for '${agent}'.`,
            );
          }
        }
      }
      if (options.status === "fixed") {
        if (!/^[0-9a-f]{64}$/i.test(options.evidence!)) {
          throw new Error("--evidence must be a CLI-returned content snapshot.");
        }
        if (options.evidence !== identity.snapshot) {
          throw new Error("Verification evidence must match the current ticket snapshot.");
        }
        if (finding.provenance.some((observation) => observation.snapshot === identity.snapshot)) {
          throw new Error(
            "Verification evidence must reflect changed content since every finding observation; dismiss an invalid finding with --details.",
          );
        }
        const required = progress.checks?.required.filter((check) => !check.removedAt) ?? [];
        if (required.length === 0) {
          throw new Error("Verification requires at least one current passing required check.");
        }
        const checkBlockers = this.checkPolicy.checkBlockers(feature, ticket, progress, identity);
        if (checkBlockers.length > 0) {
          throw new Error(`Verification evidence is insufficient:\n${checkBlockers.join("\n")}`);
        }
        verification = {
          snapshot: identity.snapshot,
          checkCommands: required.map((check) => check.command),
          verifiedAt: new Date().toISOString(),
          verifiedBy: options.author.trim(),
        };
      }

      const rulingDetails = options.details?.trim();
      const followUp = options.followUp?.trim();
      const last = finding.history.at(-1);
      if (
        finding.status === options.status &&
        finding.rulingDetails === rulingDetails &&
        finding.followUp === followUp &&
        finding.requirementsDecision === requirementsDecision?.id &&
        last?.action === `status:${options.status}` &&
        last.author === options.author.trim() &&
        last.details ===
          (rulingDetails ??
            (verification ? `Verified at ${verification.snapshot}.` : options.status)) &&
        (options.status !== "fixed" || finding.verification?.snapshot === verification?.snapshot)
      ) {
        return { ticket: options.ticket, finding, idempotent: true, snapshot: identity.snapshot };
      }

      const before = identity.snapshot;
      const currentIdentity = this.gitEvidence.contentIdentity(
        feature,
        this.ticketRepository.requireTicket(
          this.ticketRepository.readTickets(feature.workspace),
          options.ticket,
        ),
        progress.baseSha,
        progress.checks,
      );
      if (currentIdentity.snapshot !== before) {
        throw new Error("Ticket content changed while recording the finding ruling.");
      }
      finding.status = options.status as FindingStatus;
      if (["dismissed", "deferred"].includes(options.status)) {
        finding.rulingDetails = rulingDetails!;
      } else {
        delete finding.rulingDetails;
      }
      if (options.status === "deferred") finding.followUp = followUp!;
      else delete finding.followUp;
      if (options.status === "deferred" && requirementsDecision) {
        finding.requirementsDecision = requirementsDecision.id;
      } else {
        delete finding.requirementsDecision;
      }
      if (verification) finding.verification = verification;
      else delete finding.verification;
      if (
        progress.execution === "changes-requested" &&
        wasBlocking &&
        ["fixed", "dismissed"].includes(options.status) &&
        this.findingPolicy.findingBlockers(progress, identity).length === 0
      ) {
        const assignments = progress.reviewAssignments ?? [];
        const requiredReviewers = requiredTicketReviewers(ledger, progress);
        const freshCoverage =
          assignments.length === requiredReviewers.length &&
          requiredReviewers.every(({ agent, details }) => {
            const matching = assignments.filter((assignment) => assignment.agent === agent);
            return (
              matching.length === 1 &&
              matching[0]!.objective === details &&
              matching[0]!.status === "submitted" &&
              matching[0]!.result === "passed" &&
              this.reviewPolicy.reviewAssignmentBlocker(
                feature,
                progress,
                matching[0]!,
                identity,
              ) === undefined
            );
          });
        if (!freshCoverage) {
          progress.reviewHistory = [...(progress.reviewHistory ?? []), ...assignments];
          delete progress.reviewAssignments;
        }
        progress.execution = "reviewing";
      }
      const historyDetails =
        rulingDetails ?? (verification ? `Verified at ${verification.snapshot}.` : options.status);
      finding.history.push({
        at: new Date().toISOString(),
        author: options.author.trim(),
        action: `status:${options.status}`,
        details: historyDetails,
      });
      const audit = [
        `Finding ${finding.id} disposition recorded: ${options.status}`,
        rulingDetails ? `details=${rulingDetails}` : undefined,
        finding.followUp ? `follow-up=${finding.followUp}` : undefined,
        finding.requirementsDecision
          ? `requirements-decision=${finding.requirementsDecision}`
          : undefined,
        followUp ? `follow-up=${followUp}` : undefined,
        verification ? `verification=${verification.snapshot}` : undefined,
      ]
        .filter((entry): entry is string => entry !== undefined)
        .join("; ");
      const afterTicket = matter.stringify(
        this.ticketRepository.appendAudit(ticket.body, options.author, `${audit}.`),
        this.ticketRepository.metadata(ticket),
      );
      this.workspaceTransaction.writeWorkflowState(feature, ticket, afterTicket, ledger);
      return { ticket: options.ticket, finding, snapshot: identity.snapshot };
    });
  }
}
