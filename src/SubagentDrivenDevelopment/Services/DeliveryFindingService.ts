import { isAbsolute, resolve } from "node:path";

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
import { validateTicketId } from "@/SubagentDrivenDevelopment/Policies/InputValidation";
import { validateAuthor } from "@/SubagentDrivenDevelopment/Policies/InputValidation";
import { requiredDeliveryReviewers } from "@/SubagentDrivenDevelopment/Policies/RequiredReviewers";
import { ReviewPolicy } from "@/SubagentDrivenDevelopment/Policies/ReviewPolicy";
import { FeatureInspectionService } from "@/SubagentDrivenDevelopment/Services/FeatureInspectionService";

export class DeliveryFindingService extends Service {
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
    private readonly featureInspectionService: FeatureInspectionService,
  ) {
    super(app);
  }

  public deliveryFindingCreate(options: FindingCreateOptions): {
    scope: "delivery";
    finding: ReviewFinding;
    idempotent?: boolean;
    headSha: string;
  } {
    validateAuthor(options.author);
    if (!["high", "medium", "low"].includes(options.severity)) {
      throw new Error(`Invalid finding severity: ${options.severity}.`);
    }
    if (options.blocking === options.nonBlocking) {
      throw new Error("Choose exactly one of --blocking or --non-blocking.");
    }
    if (!options.summary.trim()) throw new Error("Finding summary must not be empty.");
    if (!options.details.trim()) throw new Error("Finding details must not be empty.");
    if (options.relatedTicket) validateTicketId(options.relatedTicket);
    if (options.link !== undefined && options.relatedTicket !== undefined) {
      throw new Error("--related-ticket cannot be combined with --link.");
    }
    const feature = this.featureInspectionService.resolveFeature(options.spec);
    return this.workspaceTransaction.run(feature.workspace, () => {
      const ledger = this.ledgerRepository.readLedger(feature);
      const delivery = ledger.delivery;
      if (!delivery.owner || delivery.owner !== options.author.trim()) {
        throw new Error("Only the current delivery controller may register findings.");
      }
      const report = options.source
        ? isAbsolute(options.source)
          ? resolve(options.source)
          : resolve(feature.workspace, options.source)
        : "";
      const assignment = delivery.reviewAssignments?.find(
        (candidate) => candidate.report === report && candidate.scope === "delivery",
      );
      if (!assignment) {
        throw new Error("Finding source report must match a frozen delivery review assignment.");
      }
      if (assignment.status === "submitted") {
        throw new Error("Findings must be registered before submitting the delivery assignment.");
      }
      const identity = this.gitEvidence.deliveryCommitIdentity(
        feature,
        ledger,
        this.ticketRepository.readTickets(feature.workspace),
      );
      if (options.relatedTicket) {
        const relatedTicket = ledger.tickets.find((item) => item.id === options.relatedTicket);
        if (!relatedTicket) {
          throw new Error(`Related ticket not found: ${options.relatedTicket}.`);
        }
      }
      const stale = this.reviewPolicy.reviewCommitBlocker(feature, delivery, assignment, identity);
      if (stale) throw new Error(stale);
      this.reportEvidence.readReportDigest(feature, report);
      const source: FindingProvenance = {
        report,
        headSha: assignment.headSha,
        author: options.author.trim(),
        summary: options.summary.trim(),
        details: options.details.trim(),
      };
      const findings = delivery.findings ?? [];
      if (options.link !== undefined) {
        const canonical = findings.find((finding) => finding.id === options.link);
        if (!canonical) throw new Error(`Canonical delivery finding not found: ${options.link}.`);
        const prior = canonical.provenance.find(
          (item) => item.report === source.report && item.headSha === source.headSha,
        );
        if (prior) {
          if (
            prior.author !== source.author ||
            prior.summary !== source.summary ||
            prior.details !== source.details
          ) {
            throw new Error("This report and commit are already linked with different details.");
          }
          return { scope: "delivery", finding: canonical, idempotent: true, ...identity };
        }
        canonical.provenance.push(source);
        canonical.history.push({
          at: new Date().toISOString(),
          author: options.author.trim(),
          action: "observation-linked",
          details: `Linked observation from ${report} at commit ${source.headSha}: ${source.summary} — ${source.details}`,
        });
        this.workspaceTransaction.writeLedger(feature, ledger);
        return { scope: "delivery", finding: canonical, ...identity };
      }
      const duplicate = findings.find(
        (finding) =>
          finding.author === options.author.trim() &&
          finding.relatedTicket === options.relatedTicket &&
          finding.severity === options.severity &&
          finding.blocking === (options.blocking === true) &&
          finding.summary === options.summary.trim() &&
          finding.details === options.details.trim() &&
          finding.provenance.some(
            (item) =>
              item.report === source.report &&
              item.headSha === source.headSha &&
              item.author === source.author &&
              item.summary === source.summary &&
              item.details === source.details,
          ),
      );
      if (duplicate)
        return { scope: "delivery", finding: duplicate, idempotent: true, ...identity };
      const highest = findings.reduce((current, finding) => {
        const match = /^F-(\d{4,})$/.exec(finding.id);
        return match && BigInt(match[1]!) > current ? BigInt(match[1]!) : current;
      }, 0n);
      const at = new Date().toISOString();
      const finding: ReviewFinding = {
        id: `F-${String(highest + 1n).padStart(4, "0")}`,
        ...(options.relatedTicket ? { relatedTicket: options.relatedTicket } : {}),
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
            details: `Registered from ${report} at commit ${source.headSha}.`,
          },
        ],
      };
      delivery.findings = findings;
      findings.push(finding);
      delivery.history.push({
        at,
        author: options.author.trim(),
        action: `finding-registered:${finding.id}`,
      });
      this.workspaceTransaction.writeLedger(feature, ledger);
      return { scope: "delivery", finding, headSha: identity.headSha };
    });
  }

  public deliveryFindingUpdate(options: FindingUpdateOptions): {
    scope: "delivery";
    finding: ReviewFinding;
    idempotent?: boolean;
    headSha: string;
  } {
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
      throw new Error("--follow-up is required for a deferred delivery finding.");
    }
    if (options.status === "deferred" && !options.requirementsDecision?.trim()) {
      throw new Error("--requirements-decision is required for a deferred delivery finding.");
    }
    if (
      options.status !== "deferred" &&
      (options.followUp !== undefined || options.requirementsDecision !== undefined)
    ) {
      throw new Error(
        "--follow-up and --requirements-decision are only valid for a deferred finding.",
      );
    }
    const feature = this.featureInspectionService.resolveFeature(options.spec);
    return this.workspaceTransaction.run(feature.workspace, () => {
      const ledger = this.ledgerRepository.readLedger(feature);
      const delivery = ledger.delivery;
      if (delivery.owner !== options.author.trim()) {
        throw new Error("Only the current delivery controller may record a finding ruling.");
      }
      const finding = delivery.findings?.find((candidate) => candidate.id === options.finding);
      if (!finding) throw new Error(`Delivery finding not found: ${options.finding}.`);
      const identity = this.gitEvidence.deliveryCommitIdentity(
        feature,
        ledger,
        this.ticketRepository.readTickets(feature.workspace),
      );
      const rulingDetails = options.details?.trim();
      let requirementsDecision: RequirementsDecision | undefined;
      if (options.status === "deferred") {
        requirementsDecision = delivery.requirementsDecisions?.find(
          (decision) =>
            decision.id === options.requirementsDecision &&
            decision.finding === finding.id &&
            decision.status === "approved" &&
            decision.commitSha === identity.headSha,
        );
        if (!requirementsDecision) {
          throw new Error(
            "--requirements-decision must identify an approved decision for this finding and current requirements.",
          );
        }
        const requiredReviewers = requiredDeliveryReviewers(ledger, delivery);
        const assignments = delivery.reviewAssignments ?? [];
        for (const { agent } of requiredReviewers) {
          const matching = assignments.filter(
            (assignment) => assignment.agent === agent && assignment.headSha === identity.headSha,
          );
          if (
            matching.length !== 1 ||
            matching[0]!.status !== "submitted" ||
            matching[0]!.result !== "passed" ||
            this.reviewPolicy.reviewAssignmentBlocker(feature, delivery, matching[0]!, identity)
          ) {
            throw new Error(
              `A deferred delivery finding requires fresh passing aggregate review from '${agent}'.`,
            );
          }
        }
      }
      let verification: ReviewFinding["verification"];
      if (options.status === "fixed") {
        if (
          finding.provenance.some((source) =>
            this.gitEvidence.deliveryInputsPreserved(
              feature,
              source.headSha,
              identity.headSha,
              feature.workspace,
            ),
          )
        ) {
          throw new Error(
            "Verification requires a committed change since every finding observation.",
          );
        }
        const checks = this.checkPolicy.deliveryCheckBlockers(
          feature,
          this.ticketRepository.readTickets(feature.workspace),
          delivery,
          identity,
        );
        const required = delivery.checks?.required.filter((check) => !check.removedAt) ?? [];
        if (required.length === 0 || checks.length > 0) {
          throw new Error(
            `Verification evidence is insufficient:\n${checks.join("\n") || "No required delivery checks are declared."}`,
          );
        }
        verification = {
          headSha: identity.headSha,
          checkCommands: required.map((check) => check.command),
          verifiedAt: new Date().toISOString(),
          verifiedBy: options.author.trim(),
        };
      }
      const last = finding.history.at(-1);
      if (
        finding.status === options.status &&
        finding.rulingDetails === rulingDetails &&
        last?.action === `status:${options.status}` &&
        last.author === options.author.trim()
      ) {
        return { scope: "delivery", finding, idempotent: true, headSha: identity.headSha };
      }
      const current = this.gitEvidence.deliveryCommitIdentity(
        feature,
        ledger,
        this.ticketRepository.readTickets(feature.workspace),
      );
      if (current.headSha !== identity.headSha) {
        throw new Error("Delivery commit changed while recording the finding ruling.");
      }
      const wasBlocking = finding.blocking && !["fixed", "dismissed"].includes(finding.status);
      finding.status = options.status as FindingStatus;
      if (["dismissed", "deferred"].includes(options.status))
        finding.rulingDetails = rulingDetails!;
      else delete finding.rulingDetails;
      if (options.status === "deferred") {
        finding.followUp = options.followUp!.trim();
        finding.requirementsDecision = requirementsDecision!.id;
      } else {
        delete finding.followUp;
        delete finding.requirementsDecision;
      }
      if (verification) finding.verification = verification;
      else delete finding.verification;
      const details =
        rulingDetails ??
        (verification ? `Verified at commit ${verification.headSha}.` : options.status);
      finding.history.push({
        at: new Date().toISOString(),
        author: options.author.trim(),
        action: `status:${options.status}`,
        details,
      });
      delivery.history.push({
        at: new Date().toISOString(),
        author: options.author.trim(),
        action: `finding-${options.status}:${finding.id}`,
      });
      if (wasBlocking && ["fixed", "dismissed"].includes(options.status)) {
        delivery.execution = "reviewing";
      } else if (finding.blocking && options.status === "deferred") {
        delivery.execution =
          this.findingPolicy.deliveryFindingBlockers(feature, ledger, delivery, identity).length > 0
            ? "changes-requested"
            : "reviewing";
      } else if (finding.blocking && !["fixed", "dismissed"].includes(options.status)) {
        delivery.execution = "changes-requested";
      }
      this.workspaceTransaction.writeLedger(feature, ledger);
      return { scope: "delivery", finding, headSha: identity.headSha };
    });
  }
}
