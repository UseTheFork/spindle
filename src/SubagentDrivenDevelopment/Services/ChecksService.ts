import type { Application } from "@/Foundation/Application";
import { Service } from "@/Foundation/Service";
import { GitEvidence } from "@/SubagentDrivenDevelopment/Evidence/GitEvidence";
import type {
  TicketChecks,
  CheckRecord,
  ContentIdentity,
} from "@/SubagentDrivenDevelopment/Models/Evidence";
import type {
  ChecksRequireOptions,
  ChecksRecordOptions,
} from "@/SubagentDrivenDevelopment/Models/Options";
import { isSafeCoveragePath } from "@/SubagentDrivenDevelopment/Persistence/CheckSchema";
import { LedgerRepository } from "@/SubagentDrivenDevelopment/Persistence/LedgerRepository";
import { TicketRepository } from "@/SubagentDrivenDevelopment/Persistence/TicketRepository";
import { WorkspaceTransaction } from "@/SubagentDrivenDevelopment/Persistence/WorkspaceTransaction";
import {
  validateAuthor,
  validateTicketId,
} from "@/SubagentDrivenDevelopment/Policies/InputValidation";
import { WorkflowPolicy } from "@/SubagentDrivenDevelopment/Policies/WorkflowPolicy";
import { FeatureInspectionService } from "@/SubagentDrivenDevelopment/Services/FeatureInspectionService";

export class ChecksService extends Service {
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

  public checksRequire(options: ChecksRequireOptions): {
    ticket?: string;
    scope?: "delivery";
    checks: TicketChecks;
    idempotent?: boolean;
    invalidatedDecision?: { from: "accepted" | "integrated"; to: "reviewing" };
    snapshot: string;
    codeSnapshot: string;
    requirementsSnapshot: string;
    headSha: string;
  } {
    if (options.scope === "delivery") {
      if (options.ticket) throw new Error("--ticket and --scope delivery are mutually exclusive.");
      return this.deliveryChecksRequire(options);
    }
    if (options.scope !== undefined) throw new Error("--scope must be 'delivery'.");
    if (!options.ticket) throw new Error("checks require needs --ticket or --scope delivery.");
    validateTicketId(options.ticket);
    validateAuthor(options.author);
    const command = options.command.trim();
    if (!command) throw new Error("Check command must not be empty.");
    if (options.remove && !options.details?.trim()) {
      throw new Error("Removing a required check requires non-empty --details rationale.");
    }
    if (!options.remove && options.details !== undefined) {
      throw new Error("--details is only valid when removing a required check.");
    }
    const feature = this.featureInspectionService.resolveFeature(options.spec);
    return this.workspaceTransaction.run(feature.workspace, () => {
      const ledger = this.ledgerRepository.readLedger(feature);
      const progress = this.workflowPolicy.requireProgress(ledger, options.ticket);
      if (progress.execution === "reviewing" && (progress.reviewAssignments?.length ?? 0) > 0) {
        throw new Error(
          "The review snapshot is frozen; required checks cannot change while review assignments are active.",
        );
      }
      const checks = (progress.checks ??= { required: [], records: [], invalidations: [] });
      const active = checks.required.find(
        (requirement) => requirement.command === command && !requirement.removedAt,
      );
      if (options.remove) {
        if (!active) throw new Error(`Required check is not declared: ${command}.`);
        active.removedAt = new Date().toISOString();
        active.removedBy = options.author.trim();
        active.removalDetails = options.details!.trim();
      } else {
        if (active) {
          return {
            ticket: options.ticket,
            checks,
            idempotent: true,
            ...this.gitEvidence.contentIdentity(
              feature,
              this.ticketRepository.requireTicket(
                this.ticketRepository.readTickets(feature.workspace),
                options.ticket,
              ),
              progress.baseSha,
              checks,
            ),
          };
        }
        checks.required.push({
          command,
          addedAt: new Date().toISOString(),
          addedBy: options.author.trim(),
        });
      }
      let invalidatedDecision: { from: "accepted" | "integrated"; to: "reviewing" } | undefined;
      if (progress.execution === "accepted" || progress.execution === "integrated") {
        const from = progress.execution;
        progress.execution = "reviewing";
        const invalidation = {
          at: new Date().toISOString(),
          author: options.author.trim(),
          command,
          from,
          to: "reviewing" as const,
        };
        (checks.invalidations ??= []).push(invalidation);
        invalidatedDecision = { from, to: "reviewing" };
      }
      const currentTicket = this.ticketRepository.requireTicket(
        this.ticketRepository.readTickets(feature.workspace),
        options.ticket,
      );
      const identity = this.gitEvidence.contentIdentity(
        feature,
        currentTicket,
        progress.baseSha,
        checks,
      );
      this.workspaceTransaction.writeLedger(feature, ledger);
      return {
        ticket: options.ticket,
        checks,
        ...(invalidatedDecision ? { invalidatedDecision } : {}),
        ...identity,
      };
    });
  }

  public checksRecord(options: ChecksRecordOptions): {
    ticket?: string;
    scope?: "delivery";
    record: CheckRecord;
    idempotent?: boolean;
  } & ContentIdentity {
    if (options.scope === "delivery") {
      if (options.ticket) throw new Error("--ticket and --scope delivery are mutually exclusive.");
      return this.deliveryChecksRecord(options);
    }
    if (options.scope !== undefined) throw new Error("--scope must be 'delivery'.");
    if (!options.ticket) throw new Error("checks record needs --ticket or --scope delivery.");
    validateTicketId(options.ticket);
    validateAuthor(options.author);
    const command = options.command.trim();
    if (!command) throw new Error("Check command must not be empty.");
    if (!/^[0-9a-f]{64}$/i.test(options.snapshot)) {
      throw new Error("Snapshot must be a 64-character hexadecimal content identity.");
    }
    if (!["passed", "failed", "unavailable"].includes(options.result)) {
      throw new Error(`Invalid check result: ${options.result}.`);
    }
    if (options.result !== "passed" && !options.details?.trim()) {
      throw new Error("--details is required for failed or unavailable checks.");
    }
    const feature = this.featureInspectionService.resolveFeature(options.spec);
    return this.workspaceTransaction.run(feature.workspace, () => {
      const ledger = this.ledgerRepository.readLedger(feature);
      const progress = this.workflowPolicy.requireProgress(ledger, options.ticket);
      const checks = progress.checks;
      if (!checks) throw new Error("No required checks are declared for this ticket.");
      const requirement = checks.required.find(
        (item) => item.command === command && !item.removedAt,
      );
      if (!requirement) throw new Error(`Check command is not currently required: ${command}.`);
      const coveredPaths =
        options.paths === undefined
          ? undefined
          : [...new Set(options.paths.map((path) => path.trim()))].sort();
      if (
        coveredPaths &&
        (coveredPaths.length === 0 || coveredPaths.some((path) => !isSafeCoveragePath(path)))
      ) {
        throw new Error("--paths must contain unique safe checkout-relative file paths.");
      }
      const ticket = this.ticketRepository.requireTicket(
        this.ticketRepository.readTickets(feature.workspace),
        options.ticket,
      );
      const identity = this.gitEvidence.contentIdentity(feature, ticket, progress.baseSha, checks);
      if (identity.snapshot !== options.snapshot) {
        throw new Error(
          `Snapshot is stale; current content identity is ${identity.snapshot}. No check result was recorded.`,
        );
      }
      const latestForCommand = [...checks.records]
        .reverse()
        .find((record) => record.command === command);
      const repeat =
        latestForCommand &&
        latestForCommand.result === options.result &&
        latestForCommand.author === options.author.trim() &&
        latestForCommand.snapshot === options.snapshot &&
        (!progress.worktree || latestForCommand.headSha === identity.headSha) &&
        latestForCommand.details === options.details?.trim() &&
        JSON.stringify(latestForCommand.coveredPaths) === JSON.stringify(coveredPaths)
          ? latestForCommand
          : undefined;
      if (repeat) return { ticket: options.ticket, record: repeat, idempotent: true, ...identity };
      const record: CheckRecord = {
        command,
        result: options.result as CheckRecord["result"],
        author: options.author.trim(),
        snapshot: identity.snapshot,
        codeSnapshot: identity.codeSnapshot,
        requirementsSnapshot: identity.requirementsSnapshot,
        headSha: identity.headSha,
        recordedAt: new Date().toISOString(),
        ...(coveredPaths
          ? {
              coveredPaths,
              coverageSnapshot: this.gitEvidence.contentIdentity(
                feature,
                ticket,
                progress.baseSha,
                checks,
                coveredPaths,
              ).codeSnapshot,
            }
          : {}),
        ...(options.details?.trim() ? { details: options.details.trim() } : {}),
      };
      checks.records.push(record);
      let correctionCheckHistory: CheckRecord[] | undefined;
      if (progress.assignment?.action === "correct") {
        const attempt = progress.correctionAttempts?.find(
          (candidate) => candidate.number === progress.assignment?.attempt,
        );
        if (attempt) {
          const recorded = (attempt.checks ??= []);
          correctionCheckHistory = recorded;
          if (!recorded.some((candidate) => candidate.recordedAt === record.recordedAt)) {
            recorded.push(record);
          }
        }
      }
      const confirmedTicket = this.ticketRepository.requireTicket(
        this.ticketRepository.readTickets(feature.workspace),
        options.ticket,
      );
      const confirmedIdentity = this.gitEvidence.contentIdentity(
        feature,
        confirmedTicket,
        progress.baseSha,
        checks,
      );
      if (
        confirmedIdentity.snapshot !== identity.snapshot ||
        (progress.worktree && confirmedIdentity.headSha !== identity.headSha)
      ) {
        checks.records.pop();
        correctionCheckHistory?.pop();
        throw new Error("Content changed while recording the check; retry with a fresh snapshot.");
      }
      this.workspaceTransaction.writeLedger(feature, ledger);
      return { ticket: options.ticket, record, ...identity };
    });
  }

  public deliveryChecksRequire(options: ChecksRequireOptions): {
    scope: "delivery";
    checks: TicketChecks;
    idempotent?: boolean;
    snapshot: string;
    codeSnapshot: string;
    requirementsSnapshot: string;
    headSha: string;
  } {
    validateAuthor(options.author);
    const command = options.command.trim();
    if (!command) throw new Error("Check command must not be empty.");
    if (options.remove && !options.details?.trim()) {
      throw new Error("Removing a required check requires non-empty --details rationale.");
    }
    if (!options.remove && options.details !== undefined) {
      throw new Error("--details is only valid when removing a required check.");
    }
    const feature = this.featureInspectionService.resolveFeature(options.spec);
    return this.workspaceTransaction.run(feature.workspace, () => {
      const ledger = this.ledgerRepository.readLedger(feature);
      const delivery = ledger.delivery;
      this.workflowPolicy.assertDeliveryOpen(delivery);
      if (delivery.owner && delivery.owner !== options.author.trim()) {
        throw new Error("Only the recorded delivery controller may change required checks.");
      }
      if (delivery.execution === "reviewing" && (delivery.reviewAssignments?.length ?? 0) > 0) {
        throw new Error("Aggregate review is frozen; required delivery checks cannot change.");
      }
      delivery.owner = options.author.trim();
      const checks = (delivery.checks ??= { required: [], records: [], invalidations: [] });
      const active = checks.required.find(
        (requirement) => requirement.command === command && !requirement.removedAt,
      );
      if (options.remove) {
        if (!active) throw new Error(`Required delivery check is not declared: ${command}.`);
        active.removedAt = new Date().toISOString();
        active.removedBy = options.author.trim();
        active.removalDetails = options.details!.trim();
      } else {
        if (active) {
          const identity = this.gitEvidence.deliveryIdentity(
            feature,
            ledger,
            this.ticketRepository.readTickets(feature.workspace),
          );
          return { scope: "delivery", checks, idempotent: true, ...identity };
        }
        checks.required.push({
          command,
          addedAt: new Date().toISOString(),
          addedBy: options.author.trim(),
        });
      }
      const identity = this.gitEvidence.deliveryIdentity(
        feature,
        ledger,
        this.ticketRepository.readTickets(feature.workspace),
      );
      delivery.history.push({
        at: new Date().toISOString(),
        author: options.author.trim(),
        action: `${options.remove ? "delivery-check-removed" : "delivery-check-required"}:${command}`,
      });
      this.workspaceTransaction.writeLedger(feature, ledger);
      return { scope: "delivery", checks, ...identity };
    });
  }

  public deliveryChecksRecord(options: ChecksRecordOptions): {
    scope: "delivery";
    record: CheckRecord;
    idempotent?: boolean;
  } & ContentIdentity {
    validateAuthor(options.author);
    const command = options.command.trim();
    if (!command) throw new Error("Check command must not be empty.");
    if (!/^[0-9a-f]{64}$/i.test(options.snapshot)) {
      throw new Error("Snapshot must be a 64-character hexadecimal content identity.");
    }
    if (!["passed", "failed", "unavailable"].includes(options.result)) {
      throw new Error(`Invalid check result: ${options.result}.`);
    }
    if (options.result !== "passed" && !options.details?.trim()) {
      throw new Error("--details is required for failed or unavailable checks.");
    }
    const feature = this.featureInspectionService.resolveFeature(options.spec);
    return this.workspaceTransaction.run(feature.workspace, () => {
      const ledger = this.ledgerRepository.readLedger(feature);
      const delivery = ledger.delivery;
      this.workflowPolicy.assertDeliveryOpen(delivery);
      if (!delivery.checks) throw new Error("No required checks are declared for delivery.");
      if (delivery.owner !== options.author.trim()) {
        throw new Error("Only the recorded delivery controller may record final checks.");
      }
      const requirement = delivery.checks.required.find(
        (item) => item.command === command && !item.removedAt,
      );
      if (!requirement)
        throw new Error(`Check command is not currently required for delivery: ${command}.`);
      const identity = this.gitEvidence.deliveryIdentity(
        feature,
        ledger,
        this.ticketRepository.readTickets(feature.workspace),
      );
      if (identity.snapshot !== options.snapshot) {
        throw new Error(
          `Snapshot is stale; current delivery identity is ${identity.snapshot}. No check result was recorded.`,
        );
      }
      const prior = [...delivery.checks.records]
        .reverse()
        .find((record) => record.command === command);
      if (
        prior &&
        prior.result === options.result &&
        prior.author === options.author.trim() &&
        prior.snapshot === identity.snapshot &&
        prior.details === options.details?.trim()
      ) {
        return { scope: "delivery", record: prior, idempotent: true, ...identity };
      }
      const record: CheckRecord = {
        command,
        result: options.result as CheckRecord["result"],
        author: options.author.trim(),
        snapshot: identity.snapshot,
        codeSnapshot: identity.codeSnapshot,
        requirementsSnapshot: identity.requirementsSnapshot,
        headSha: identity.headSha,
        recordedAt: new Date().toISOString(),
        ...(options.details?.trim() ? { details: options.details.trim() } : {}),
      };
      delivery.checks.records.push(record);
      if (record.result !== "passed") delivery.execution = "changes-requested";
      delivery.history.push({
        at: record.recordedAt,
        author: record.author,
        action: `delivery-check-recorded:${command}:${record.result}`,
      });
      const confirmed = this.gitEvidence.deliveryIdentity(
        feature,
        ledger,
        this.ticketRepository.readTickets(feature.workspace),
      );
      if (confirmed.snapshot !== identity.snapshot) {
        delivery.checks.records.pop();
        delivery.history.pop();
        throw new Error(
          "Content changed while recording the delivery check; retry with a fresh snapshot.",
        );
      }
      this.workspaceTransaction.writeLedger(feature, ledger);
      return { scope: "delivery", record, ...identity };
    });
  }
}
