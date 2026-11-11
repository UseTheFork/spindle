import { randomUUID } from "node:crypto";
import { join } from "node:path";

import matter from "gray-matter";

import { blueprintCatalog } from "@/BlueprintManagement/Catalog/BlueprintCatalog";
import type { Application } from "@/Foundation/Application";
import { Service } from "@/Foundation/Service";
import { GitEvidence } from "@/SubagentDrivenDevelopment/Evidence/GitEvidence";
import { ReportEvidence } from "@/SubagentDrivenDevelopment/Evidence/ReportEvidence";
import type {
  ReviewAssignment,
  SpecialistReviewRequirement,
} from "@/SubagentDrivenDevelopment/Models/Assignments";
import type {
  ReviewOptions,
  ReviewRequireOptions,
} from "@/SubagentDrivenDevelopment/Models/Options";
import { lstatIfPresent } from "@/SubagentDrivenDevelopment/Persistence/FileSystem";
import { LedgerRepository } from "@/SubagentDrivenDevelopment/Persistence/LedgerRepository";
import { TicketRepository } from "@/SubagentDrivenDevelopment/Persistence/TicketRepository";
import { WorkspaceTransaction } from "@/SubagentDrivenDevelopment/Persistence/WorkspaceTransaction";
import { AssignmentPolicy } from "@/SubagentDrivenDevelopment/Policies/AssignmentPolicy";
import { CheckPolicy } from "@/SubagentDrivenDevelopment/Policies/CheckPolicy";
import {
  validateAuthor,
  validateTicketId,
} from "@/SubagentDrivenDevelopment/Policies/InputValidation";
import {
  requiredTicketReviewers,
  requiredDeliveryReviewers,
} from "@/SubagentDrivenDevelopment/Policies/RequiredReviewers";
import { ReviewPolicy } from "@/SubagentDrivenDevelopment/Policies/ReviewPolicy";
import { WorkflowPolicy } from "@/SubagentDrivenDevelopment/Policies/WorkflowPolicy";
import { FeatureInspectionService } from "@/SubagentDrivenDevelopment/Services/FeatureInspectionService";

export class ReviewService extends Service {
  public constructor(
    app: Application,
    private readonly gitEvidence: GitEvidence,
    private readonly reportEvidence: ReportEvidence,
    private readonly ticketRepository: TicketRepository,
    private readonly ledgerRepository: LedgerRepository,
    private readonly workspaceTransaction: WorkspaceTransaction,
    private readonly assignmentPolicy: AssignmentPolicy,
    private readonly checkPolicy: CheckPolicy,
    private readonly reviewPolicy: ReviewPolicy,
    private readonly workflowPolicy: WorkflowPolicy,
    private readonly featureInspectionService: FeatureInspectionService,
  ) {
    super(app);
  }

  public reviewRequire(options: ReviewRequireOptions): {
    ticket?: string;
    scope?: "delivery";
    requirement: SpecialistReviewRequirement;
    idempotent?: boolean;
  } {
    validateAuthor(options.author);
    const agent = (options.type ?? options.agent ?? "").trim();
    const details = options.details.trim();
    if (!agent) throw new Error("Review agent must not be empty.");
    if (!details) throw new Error("Specialist review details must not be empty.");
    const catalogEntry = blueprintCatalog.agents[agent];
    if (!catalogEntry) {
      throw new Error(`Unknown review agent '${agent}' in the Blueprint Catalog.`);
    }
    if (catalogEntry.canReview !== true) {
      throw new Error(`Review agent '${agent}' is not explicitly marked review-eligible.`);
    }

    if (options.scope === "delivery") {
      if (options.ticket) throw new Error("--ticket and --scope delivery are mutually exclusive.");
      const feature = this.featureInspectionService.resolveFeature(options.spec);
      return this.workspaceTransaction.run(feature.workspace, () => {
        const ledger = this.ledgerRepository.readLedger(feature);
        const delivery = ledger.delivery;
        if (delivery.execution === "reviewing" || (delivery.reviewHistory?.length ?? 0) > 0) {
          throw new Error("Delivery review assignments are already frozen.");
        }
        const existing = (delivery.reviewRequirements ?? []).find(
          (requirement) => requirement.agent === agent,
        );
        if (existing) {
          if (existing.details !== details || existing.author !== options.author.trim()) {
            throw new Error(
              `Delivery specialist review for '${agent}' is already pinned with different details or author.`,
            );
          }
          return { scope: "delivery", requirement: existing, idempotent: true };
        }
        if (ledger.reviewPolicy.delivery.includes(agent)) {
          throw new Error(
            `Review agent '${agent}' is already required by the pinned delivery policy.`,
          );
        }
        if (delivery.owner && delivery.owner !== options.author.trim()) {
          throw new Error("Only the recorded delivery controller may require specialist reviews.");
        }
        delivery.owner = options.author.trim();
        const requirement: SpecialistReviewRequirement = {
          agent,
          details,
          author: options.author.trim(),
          requestedAt: new Date().toISOString(),
        };
        (delivery.reviewRequirements ??= []).push(requirement);
        delivery.history.push({
          at: new Date().toISOString(),
          author: options.author.trim(),
          action: `specialist-review-required:${agent}`,
        });
        this.workspaceTransaction.writeLedger(feature, ledger);
        return { scope: "delivery", requirement };
      });
    }
    if (options.scope !== undefined) throw new Error("--scope must be 'delivery'.");
    if (!options.ticket) throw new Error("Review require needs --ticket or --scope delivery.");
    validateTicketId(options.ticket);
    const ticketId = options.ticket;

    const feature = this.featureInspectionService.resolveFeature(options.spec);
    return this.workspaceTransaction.run(feature.workspace, () => {
      const ledger = this.ledgerRepository.readLedger(feature);
      const ticket = this.ticketRepository.requireTicket(
        this.ticketRepository.readTickets(feature.workspace),
        ticketId,
      );
      const progress = this.workflowPolicy.requireProgress(ledger, ticketId);
      if (!progress.owner || progress.owner !== options.author.trim()) {
        throw new Error("Only the recorded ticket controller may require specialist reviews.");
      }

      const existing = (progress.reviewRequirements ?? []).find(
        (requirement) => requirement.agent === agent,
      );
      if (existing) {
        if (existing.details !== details || existing.author !== options.author.trim()) {
          throw new Error(
            `Specialist review for '${agent}' is already pinned with different details or author.`,
          );
        }
        return { ticket: ticketId, requirement: existing, idempotent: true };
      }
      if (
        (progress.reviewAssignments?.length ?? 0) > 0 ||
        (progress.reviewHistory?.length ?? 0) > 0
      ) {
        throw new Error(
          "Review assignments are already frozen; specialist requirements cannot be added.",
        );
      }
      if (ledger.reviewPolicy.ticket.includes(agent)) {
        throw new Error(`Review agent '${agent}' is already required by the pinned ticket policy.`);
      }

      const requirement: SpecialistReviewRequirement = {
        agent,
        details,
        author: options.author.trim(),
        requestedAt: new Date().toISOString(),
      };
      (progress.reviewRequirements ??= []).push(requirement);
      const afterTicket = matter.stringify(
        this.ticketRepository.appendAudit(
          ticket.body,
          options.author,
          `Specialist review required for '${agent}': ${details}.`,
        ),
        this.ticketRepository.metadata(ticket),
      );
      this.workspaceTransaction.writeWorkflowState(feature, ticket, afterTicket, ledger);
      return { ticket: ticketId, requirement };
    });
  }

  public review(options: ReviewOptions): {
    ticket?: string;
    scope?: "delivery";
    execution: "reviewing";
    assignments: ReviewAssignment[];
    idempotent?: boolean;
    snapshot: string;
    codeSnapshot: string;
    requirementsSnapshot: string;
    headSha: string;
  } {
    validateAuthor(options.author);
    if (options.scope === "delivery") return this.deliveryReview(options);
    if (options.scope !== undefined) throw new Error("--scope must be 'delivery'.");
    if (!options.ticket) throw new Error("Review requires --ticket or --scope delivery.");
    validateTicketId(options.ticket);
    const ticketId = options.ticket;
    let confirmedInventory: unknown;
    try {
      confirmedInventory = JSON.parse(options.inventory) as unknown;
    } catch {
      throw new Error("--inventory must be a JSON string array of Git-derived paths.");
    }
    if (
      !Array.isArray(confirmedInventory) ||
      !confirmedInventory.every((path) => typeof path === "string" && path.length > 0) ||
      new Set(confirmedInventory).size !== confirmedInventory.length
    ) {
      throw new Error("--inventory must be a JSON string array without duplicate paths.");
    }

    const feature = this.featureInspectionService.resolveFeature(options.spec);
    return this.workspaceTransaction.run(feature.workspace, () => {
      const ledger = this.ledgerRepository.readLedger(feature);
      const ticket = this.ticketRepository.requireTicket(
        this.ticketRepository.readTickets(feature.workspace),
        ticketId,
      );
      const progress = this.workflowPolicy.requireProgress(ledger, ticketId);
      if (progress.execution !== "reviewing" || !progress.assignment) {
        throw new Error(`Ticket ${ticketId} must have a submitted implementation before review.`);
      }
      if (progress.owner !== options.author.trim()) {
        throw new Error("Only the recorded controller may dispatch review.");
      }
      const implementationBlocker = this.assignmentPolicy.implementationReportBlocker(
        feature,
        progress.assignment,
      );
      if (implementationBlocker) throw new Error(implementationBlocker);
      if (!progress.baseSha) throw new Error("Review requires the ticket's recorded Git baseline.");

      const ticketWorkspace = this.gitEvidence.ticketWorkspace(progress);
      this.gitEvidence.assertTicketCodeCommitted(progress);
      const identity = this.gitEvidence.contentIdentity(
        feature,
        ticket,
        progress.baseSha,
        progress.checks,
      );
      const reviewCheckBlockers = this.checkPolicy.reviewCheckBlockers(
        feature,
        ticket,
        progress,
        identity,
      );
      if (reviewCheckBlockers.length > 0) throw new Error(reviewCheckBlockers.join("\n"));
      const inventory = this.gitEvidence.changedPaths(progress.baseSha, ticketWorkspace);
      const suppliedPaths = new Set(confirmedInventory);
      if (
        suppliedPaths.size !== inventory.length ||
        inventory.some((path) => !suppliedPaths.has(path))
      ) {
        throw new Error(
          `Controller-confirmed inventory does not match the current Git-derived inventory: ${JSON.stringify(inventory)}.`,
        );
      }

      const requiredReviewers = requiredTicketReviewers(ledger, progress);
      let existing = progress.reviewAssignments ?? [];
      if (progress.assignment.action === "correct") {
        const completeInitialCoverage = requiredReviewers.every(({ agent, details }) => {
          const matching = existing.filter(
            (assignment) => assignment.agent === agent && assignment.scope === "initial",
          );
          return (
            matching.length === 1 &&
            matching[0]!.objective === details &&
            matching[0]!.status === "submitted"
          );
        });
        if (completeInitialCoverage) {
          const attempt = progress.correctionAttempts?.find(
            (candidate) => candidate.number === progress.assignment?.attempt,
          );
          if (!attempt) throw new Error("Corrective assignment has no persisted attempt record.");
          const correctionAssignments = attempt.reviewAssignments ?? [];
          if (correctionAssignments.length > 0) {
            if (
              correctionAssignments.length !== requiredReviewers.length ||
              correctionAssignments.some(
                (assignment, index) =>
                  assignment.scope !== "corrective" ||
                  assignment.attempt !== attempt.number ||
                  assignment.agent !== requiredReviewers[index]?.agent ||
                  assignment.objective !== requiredReviewers[index]?.details ||
                  assignment.snapshot !== identity.snapshot ||
                  assignment.codeSnapshot !== identity.codeSnapshot ||
                  assignment.requirementsSnapshot !== identity.requirementsSnapshot ||
                  JSON.stringify(assignment.inventory) !== JSON.stringify(inventory),
              )
            ) {
              throw new Error(
                "The frozen corrective review assignment no longer matches the current ticket snapshot.",
              );
            }
            for (const assignment of correctionAssignments) {
              const blocker = this.reviewPolicy.reviewSnapshotBlocker(
                feature,
                progress,
                assignment,
                identity,
              );
              if (blocker) throw new Error(blocker);
            }
            return {
              ticket: ticketId,
              execution: "reviewing",
              assignments: correctionAssignments,
              idempotent: true,
              ...identity,
            };
          }

          const assignments = requiredReviewers.map(({ agent, details }) => {
            const catalogEntry = blueprintCatalog.agents[agent];
            if (!catalogEntry || catalogEntry.canReview !== true) {
              throw new Error(`Review agent '${agent}' is not explicitly marked review-eligible.`);
            }
            const id = randomUUID();
            const report = join(
              feature.workspace,
              "reports",
              `${ticketId}-round-${attempt.number}-review-${id}.md`,
            );
            this.reportEvidence.assertReportPath(feature, report, false);
            if (lstatIfPresent(report)) {
              throw new Error(`Assigned report already exists and was preserved: ${report}.`);
            }
            return {
              id,
              agent,
              role: "review" as const,
              scope: "corrective" as const,
              attempt: attempt.number,
              ...(details ? { objective: details } : {}),
              snapshot: identity.snapshot,
              codeSnapshot: identity.codeSnapshot,
              requirementsSnapshot: identity.requirementsSnapshot,
              headSha: identity.headSha,
              ...(progress.worktree
                ? { workspace: progress.worktree.workspace, branch: progress.worktree.branch }
                : {}),
              inventory,
              report,
              requestedAt: new Date().toISOString(),
              status: "pending" as const,
            };
          });
          attempt.reviewAssignments = assignments;
          const confirmedIdentity = this.gitEvidence.contentIdentity(
            feature,
            this.ticketRepository.requireTicket(
              this.ticketRepository.readTickets(feature.workspace),
              ticketId,
            ),
            progress.baseSha,
            progress.checks,
          );
          this.gitEvidence.assertTicketCodeCommitted(progress);
          if (
            confirmedIdentity.snapshot !== identity.snapshot ||
            (progress.worktree && confirmedIdentity.headSha !== identity.headSha) ||
            JSON.stringify(this.gitEvidence.changedPaths(progress.baseSha, ticketWorkspace)) !==
              JSON.stringify(inventory)
          ) {
            delete attempt.reviewAssignments;
            throw new Error(
              "Ticket content changed while freezing corrective review; retry with a fresh inventory.",
            );
          }
          const assignmentSummary = assignments
            .map((assignment) => `${assignment.agent} (${assignment.id}) -> ${assignment.report}`)
            .join("; ");
          const afterTicket = matter.stringify(
            this.ticketRepository.appendAudit(
              ticket.body,
              options.author,
              `Corrective review assignments for attempt ${attempt.number} recorded: ${assignmentSummary}. Inventory and snapshot are frozen.`,
            ),
            this.ticketRepository.metadata(ticket),
          );
          this.workspaceTransaction.writeWorkflowState(feature, ticket, afterTicket, ledger);
          return {
            ticket: ticketId,
            execution: "reviewing",
            assignments,
            ...identity,
          };
        }
        if (existing.length > 0) {
          progress.reviewHistory = [...(progress.reviewHistory ?? []), ...existing];
          delete progress.reviewAssignments;
          existing = [];
        }
      }

      if (
        progress.assignment.action !== "correct" &&
        existing.length > 0 &&
        existing.every((assignment) => assignment.status === "submitted") &&
        existing.some(
          (assignment) =>
            assignment.snapshot !== identity.snapshot ||
            assignment.headSha !== identity.headSha ||
            JSON.stringify(assignment.inventory) !== JSON.stringify(inventory),
        )
      ) {
        progress.reviewHistory = [...(progress.reviewHistory ?? []), ...existing];
        delete progress.reviewAssignments;
        existing = [];
      }

      if (existing.length > 0) {
        if (
          existing.length !== requiredReviewers.length ||
          existing.some(
            (assignment, index) =>
              assignment.agent !== requiredReviewers[index]?.agent ||
              assignment.objective !== requiredReviewers[index]?.details ||
              assignment.snapshot !== identity.snapshot ||
              assignment.codeSnapshot !== identity.codeSnapshot ||
              assignment.requirementsSnapshot !== identity.requirementsSnapshot ||
              JSON.stringify(assignment.inventory) !== JSON.stringify(inventory),
          )
        ) {
          throw new Error(
            "The frozen review assignment no longer matches the current ticket snapshot.",
          );
        }
        for (const assignment of existing) {
          const blocker = this.reviewPolicy.reviewSnapshotBlocker(
            feature,
            progress,
            assignment,
            identity,
          );
          if (blocker) throw new Error(blocker);
        }
        return {
          ticket: ticketId,
          execution: "reviewing",
          assignments: existing,
          idempotent: true,
          ...identity,
        };
      }

      const assignments = requiredReviewers.map(({ agent, details }) => {
        const catalogEntry = blueprintCatalog.agents[agent];
        if (!catalogEntry || catalogEntry.canReview !== true) {
          throw new Error(`Review agent '${agent}' is not explicitly marked review-eligible.`);
        }
        const id = randomUUID();
        const report = join(feature.workspace, "reports", `${ticketId}-review-${id}.md`);
        this.reportEvidence.assertReportPath(feature, report, false);
        if (lstatIfPresent(report)) {
          throw new Error(`Assigned review report already exists and was preserved: ${report}.`);
        }
        return {
          id,
          agent,
          role: "review" as const,
          scope: "initial" as const,
          ...(details ? { objective: details } : {}),
          snapshot: identity.snapshot,
          codeSnapshot: identity.codeSnapshot,
          requirementsSnapshot: identity.requirementsSnapshot,
          headSha: identity.headSha,
          ...(progress.worktree
            ? { workspace: progress.worktree.workspace, branch: progress.worktree.branch }
            : {}),
          inventory,
          report,
          requestedAt: new Date().toISOString(),
          status: "pending" as const,
        };
      });

      const confirmedTicket = this.ticketRepository.requireTicket(
        this.ticketRepository.readTickets(feature.workspace),
        ticketId,
      );
      const confirmedIdentity = this.gitEvidence.contentIdentity(
        feature,
        confirmedTicket,
        progress.baseSha,
        progress.checks,
      );
      this.gitEvidence.assertTicketCodeCommitted(progress);
      const confirmedCurrentInventory = this.gitEvidence.changedPaths(
        progress.baseSha,
        ticketWorkspace,
      );
      if (
        confirmedIdentity.snapshot !== identity.snapshot ||
        (progress.worktree && confirmedIdentity.headSha !== identity.headSha) ||
        JSON.stringify(confirmedCurrentInventory) !== JSON.stringify(inventory)
      ) {
        throw new Error(
          "Ticket content changed while freezing review; retry with a fresh inventory.",
        );
      }
      progress.reviewAssignments = assignments;
      const assignmentSummary = assignments
        .map((assignment) => `${assignment.agent} (${assignment.id}) -> ${assignment.report}`)
        .join("; ");
      const afterTicket = matter.stringify(
        this.ticketRepository.appendAudit(
          ticket.body,
          options.author,
          `Initial review assignment${assignments.length === 1 ? "" : "s"} recorded: ${assignmentSummary}. Inventory and snapshot are frozen.`,
        ),
        this.ticketRepository.metadata(ticket),
      );
      this.workspaceTransaction.writeWorkflowState(feature, ticket, afterTicket, ledger);
      return {
        ticket: ticketId,
        execution: "reviewing",
        assignments,
        ...identity,
      };
    });
  }

  public deliveryReview(options: ReviewOptions): {
    scope: "delivery";
    execution: "reviewing";
    assignments: ReviewAssignment[];
    idempotent?: boolean;
    snapshot: string;
    codeSnapshot: string;
    requirementsSnapshot: string;
    headSha: string;
  } {
    if (options.ticket) throw new Error("--ticket and --scope delivery are mutually exclusive.");
    let confirmedInventory: unknown;
    try {
      confirmedInventory = JSON.parse(options.inventory) as unknown;
    } catch {
      throw new Error("--inventory must be a JSON string array of Git-derived paths.");
    }
    if (
      !Array.isArray(confirmedInventory) ||
      !confirmedInventory.every((path) => typeof path === "string" && path.length > 0) ||
      new Set(confirmedInventory).size !== confirmedInventory.length
    ) {
      throw new Error("--inventory must be a JSON string array without duplicate paths.");
    }
    const feature = this.featureInspectionService.resolveFeature(options.spec);
    return this.workspaceTransaction.run(feature.workspace, () => {
      const ledger = this.ledgerRepository.readLedger(feature);
      const tickets = this.ticketRepository.readTickets(feature.workspace);
      const incomplete = ledger.tickets
        .filter((progress) => progress.status !== "closed")
        .map((progress) => progress.id);
      if (incomplete.length > 0) {
        throw new Error(`Feature review requires every ticket closed: ${incomplete.join(", ")}.`);
      }
      const unintegrated = ledger.tickets
        .filter((progress) => progress.execution !== "integrated" || !progress.integration)
        .map((progress) => progress.id);
      if (unintegrated.length > 0) {
        throw new Error(
          `Feature review requires every ticket integrated: ${unintegrated.join(", ")}.`,
        );
      }
      const unvalidated = ledger.tickets
        .filter(
          (progress) =>
            !progress.integration?.mergeSha ||
            progress.integration.postMerge?.status !== "passed" ||
            progress.integration.postMerge.mergeSha !== progress.integration.mergeSha,
        )
        .map((progress) => progress.id);
      if (unvalidated.length > 0) {
        throw new Error(
          `Feature review requires passing ticket post-merge validation: ${unvalidated.join(", ")}.`,
        );
      }
      if (tickets.length !== ledger.tickets.length) {
        throw new Error("Feature review requires every ticket document to be present.");
      }
      const delivery = ledger.delivery;
      if (delivery.adjudication?.status === "pending") {
        throw new Error("Delivery correction is paused for adjudication.");
      }
      delivery.owner = options.author.trim();
      const identity = this.gitEvidence.deliveryIdentity(feature, ledger, tickets);
      const blockers = this.checkPolicy.deliveryCheckBlockers(delivery, identity);
      if (blockers.length > 0) throw new Error(blockers.join("\n"));
      const baseline = delivery.baseSha;
      if (!baseline) {
        throw new Error(
          "Feature review requires a recorded feature baseline; create the feature again.",
        );
      }
      const inventory = this.gitEvidence.changedPaths(baseline);
      const suppliedPaths = new Set(confirmedInventory);
      if (
        suppliedPaths.size !== inventory.length ||
        inventory.some((path) => !suppliedPaths.has(path))
      ) {
        throw new Error(
          `Controller-confirmed delivery inventory does not match the current Git-derived inventory: ${JSON.stringify(inventory)}.`,
        );
      }
      const required = requiredDeliveryReviewers(ledger, delivery);
      const correctionNumber =
        delivery.assignment?.action === "correct" ? delivery.assignment.attempt : undefined;
      let existing = delivery.reviewAssignments ?? [];
      if (existing.length > 0) {
        if (
          existing.length === required.length &&
          existing.every(
            (assignment, index) =>
              assignment.scope === "delivery" &&
              assignment.attempt === correctionNumber &&
              assignment.agent === required[index]?.agent &&
              assignment.objective === required[index]?.details &&
              assignment.snapshot === identity.snapshot &&
              assignment.codeSnapshot === identity.codeSnapshot &&
              assignment.requirementsSnapshot === identity.requirementsSnapshot &&
              JSON.stringify(assignment.inventory) === JSON.stringify(inventory),
          )
        ) {
          for (const assignment of existing) {
            const blocker = this.reviewPolicy.reviewSnapshotBlocker(
              feature,
              delivery,
              assignment,
              identity,
            );
            if (blocker) throw new Error(blocker);
          }
          return {
            scope: "delivery",
            execution: "reviewing",
            assignments: existing,
            idempotent: true,
            ...identity,
          };
        }
        delivery.reviewHistory = [...(delivery.reviewHistory ?? []), ...existing];
        delivery.reviewAssignments = [];
        existing = [];
      }
      const assignments = required.map(({ agent, details }) => {
        if (blueprintCatalog.agents[agent]?.canReview !== true) {
          throw new Error(`Review agent '${agent}' is not explicitly marked review-eligible.`);
        }
        const id = randomUUID();
        const report = join(
          feature.workspace,
          "reports",
          correctionNumber
            ? `final-round-${correctionNumber}-review-${id}.md`
            : `final-review-${id}.md`,
        );
        this.reportEvidence.assertReportPath(feature, report, false);
        if (lstatIfPresent(report)) {
          throw new Error(`Assigned report already exists and was preserved: ${report}.`);
        }
        return {
          id,
          agent,
          role: "review" as const,
          scope: "delivery" as const,
          ...(correctionNumber ? { attempt: correctionNumber } : {}),
          ...(details ? { objective: details } : {}),
          snapshot: identity.snapshot,
          codeSnapshot: identity.codeSnapshot,
          requirementsSnapshot: identity.requirementsSnapshot,
          headSha: identity.headSha,
          inventory,
          report,
          requestedAt: new Date().toISOString(),
          status: "pending" as const,
        };
      });
      delivery.reviewAssignments = assignments;
      if (correctionNumber) {
        const attempt = delivery.correctionAttempts?.find(
          (candidate) => candidate.number === correctionNumber,
        );
        if (!attempt) throw new Error("Delivery corrective review has no matching attempt record.");
        attempt.reviewAssignments = assignments;
      }
      delivery.execution = "reviewing";
      delivery.history.push({
        at: new Date().toISOString(),
        author: options.author.trim(),
        action: "aggregate-review-dispatched",
      });
      const confirmed = this.gitEvidence.deliveryIdentity(
        feature,
        ledger,
        this.ticketRepository.readTickets(feature.workspace),
      );
      if (
        confirmed.snapshot !== identity.snapshot ||
        JSON.stringify(this.gitEvidence.changedPaths(baseline)) !== JSON.stringify(inventory)
      ) {
        delivery.reviewAssignments = [];
        delivery.execution = "unstarted";
        delivery.history.pop();
        throw new Error(
          "Feature content changed while freezing aggregate review; retry with a fresh inventory.",
        );
      }
      this.workspaceTransaction.writeLedger(feature, ledger);
      return { scope: "delivery", execution: "reviewing", assignments, ...identity };
    });
  }
}
