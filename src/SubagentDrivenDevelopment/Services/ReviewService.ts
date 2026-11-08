import { randomUUID } from "node:crypto";
import { join } from "node:path";

import matter from "gray-matter";

import { blueprintCatalog } from "@/blueprints/catalog";
import type { Application } from "@/Foundation/Application";
import { Service } from "@/services/Service";
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
import { IssueRepository } from "@/SubagentDrivenDevelopment/Persistence/IssueRepository";
import { LedgerRepository } from "@/SubagentDrivenDevelopment/Persistence/LedgerRepository";
import { WorkspaceTransaction } from "@/SubagentDrivenDevelopment/Persistence/WorkspaceTransaction";
import { AssignmentPolicy } from "@/SubagentDrivenDevelopment/Policies/AssignmentPolicy";
import { CheckPolicy } from "@/SubagentDrivenDevelopment/Policies/CheckPolicy";
import {
  validateAuthor,
  validateIssueId,
} from "@/SubagentDrivenDevelopment/Policies/InputValidation";
import {
  requiredIssueReviewers,
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
    private readonly issueRepository: IssueRepository,
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
    issue?: string;
    scope?: "delivery";
    requirement: SpecialistReviewRequirement;
    idempotent?: boolean;
  } {
    validateAuthor(options.author);
    const agent = options.agent.trim();
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
      if (options.issue) throw new Error("--issue and --scope delivery are mutually exclusive.");
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
    if (!options.issue) throw new Error("Review require needs --issue or --scope delivery.");
    validateIssueId(options.issue);
    const issueId = options.issue;

    const feature = this.featureInspectionService.resolveFeature(options.spec);
    return this.workspaceTransaction.run(feature.workspace, () => {
      const ledger = this.ledgerRepository.readLedger(feature);
      const issue = this.issueRepository.requireIssue(
        this.issueRepository.readIssues(feature.workspace),
        issueId,
      );
      const progress = this.workflowPolicy.requireProgress(ledger, issueId);
      if (!progress.owner || progress.owner !== options.author.trim()) {
        throw new Error("Only the recorded issue controller may require specialist reviews.");
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
        return { issue: issueId, requirement: existing, idempotent: true };
      }
      if (
        (progress.reviewAssignments?.length ?? 0) > 0 ||
        (progress.reviewHistory?.length ?? 0) > 0
      ) {
        throw new Error(
          "Review assignments are already frozen; specialist requirements cannot be added.",
        );
      }
      if (ledger.reviewPolicy.issue.includes(agent)) {
        throw new Error(`Review agent '${agent}' is already required by the pinned issue policy.`);
      }

      const requirement: SpecialistReviewRequirement = {
        agent,
        details,
        author: options.author.trim(),
        requestedAt: new Date().toISOString(),
      };
      (progress.reviewRequirements ??= []).push(requirement);
      const afterIssue = matter.stringify(
        this.issueRepository.appendAudit(
          issue.body,
          options.author,
          `Specialist review required for '${agent}': ${details}.`,
        ),
        this.issueRepository.metadata(issue),
      );
      this.workspaceTransaction.writeWorkflowState(feature, issue, afterIssue, ledger);
      return { issue: issueId, requirement };
    });
  }

  public review(options: ReviewOptions): {
    issue?: string;
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
    if (!options.issue) throw new Error("Review requires --issue or --scope delivery.");
    validateIssueId(options.issue);
    const issueId = options.issue;
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
      const issue = this.issueRepository.requireIssue(
        this.issueRepository.readIssues(feature.workspace),
        issueId,
      );
      const progress = this.workflowPolicy.requireProgress(ledger, issueId);
      if (progress.execution !== "reviewing" || !progress.assignment) {
        throw new Error(`Issue ${issueId} must have a submitted implementation before review.`);
      }
      if (progress.owner !== options.author.trim()) {
        throw new Error("Only the recorded controller may dispatch review.");
      }
      const implementationBlocker = this.assignmentPolicy.implementationReportBlocker(
        feature,
        progress.assignment,
      );
      if (implementationBlocker) throw new Error(implementationBlocker);
      if (!progress.baseSha) throw new Error("Review requires the issue's recorded Git baseline.");

      const identity = this.gitEvidence.contentIdentity(
        feature,
        issue,
        progress.baseSha,
        progress.checks,
      );
      const reviewCheckBlockers = this.checkPolicy.reviewCheckBlockers(
        feature,
        issue,
        progress,
        identity,
      );
      if (reviewCheckBlockers.length > 0) throw new Error(reviewCheckBlockers.join("\n"));
      const inventory = this.gitEvidence.changedPaths(progress.baseSha);
      const suppliedPaths = new Set(confirmedInventory);
      if (
        suppliedPaths.size !== inventory.length ||
        inventory.some((path) => !suppliedPaths.has(path))
      ) {
        throw new Error(
          `Controller-confirmed inventory does not match the current Git-derived inventory: ${JSON.stringify(inventory)}.`,
        );
      }

      const requiredReviewers = requiredIssueReviewers(ledger, progress);
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
                "The frozen corrective review assignment no longer matches the current issue snapshot.",
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
              issue: issueId,
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
              `${issueId}-round-${attempt.number}-review-${id}.md`,
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
              inventory,
              report,
              requestedAt: new Date().toISOString(),
              status: "pending" as const,
            };
          });
          attempt.reviewAssignments = assignments;
          const confirmedIdentity = this.gitEvidence.contentIdentity(
            feature,
            this.issueRepository.requireIssue(
              this.issueRepository.readIssues(feature.workspace),
              issueId,
            ),
            progress.baseSha,
            progress.checks,
          );
          if (
            confirmedIdentity.snapshot !== identity.snapshot ||
            JSON.stringify(this.gitEvidence.changedPaths(progress.baseSha)) !==
              JSON.stringify(inventory)
          ) {
            delete attempt.reviewAssignments;
            throw new Error(
              "Issue content changed while freezing corrective review; retry with a fresh inventory.",
            );
          }
          const assignmentSummary = assignments
            .map((assignment) => `${assignment.agent} (${assignment.id}) -> ${assignment.report}`)
            .join("; ");
          const afterIssue = matter.stringify(
            this.issueRepository.appendAudit(
              issue.body,
              options.author,
              `Corrective review assignments for attempt ${attempt.number} recorded: ${assignmentSummary}. Inventory and snapshot are frozen.`,
            ),
            this.issueRepository.metadata(issue),
          );
          this.workspaceTransaction.writeWorkflowState(feature, issue, afterIssue, ledger);
          return {
            issue: issueId,
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
            "The frozen review assignment no longer matches the current issue snapshot.",
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
          issue: issueId,
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
        const report = join(feature.workspace, "reports", `${issueId}-review-${id}.md`);
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
          inventory,
          report,
          requestedAt: new Date().toISOString(),
          status: "pending" as const,
        };
      });

      const confirmedIssue = this.issueRepository.requireIssue(
        this.issueRepository.readIssues(feature.workspace),
        issueId,
      );
      const confirmedIdentity = this.gitEvidence.contentIdentity(
        feature,
        confirmedIssue,
        progress.baseSha,
        progress.checks,
      );
      const confirmedCurrentInventory = this.gitEvidence.changedPaths(progress.baseSha);
      if (
        confirmedIdentity.snapshot !== identity.snapshot ||
        JSON.stringify(confirmedCurrentInventory) !== JSON.stringify(inventory)
      ) {
        throw new Error(
          "Issue content changed while freezing review; retry with a fresh inventory.",
        );
      }
      progress.reviewAssignments = assignments;
      const assignmentSummary = assignments
        .map((assignment) => `${assignment.agent} (${assignment.id}) -> ${assignment.report}`)
        .join("; ");
      const afterIssue = matter.stringify(
        this.issueRepository.appendAudit(
          issue.body,
          options.author,
          `Initial review assignment${assignments.length === 1 ? "" : "s"} recorded: ${assignmentSummary}. Inventory and snapshot are frozen.`,
        ),
        this.issueRepository.metadata(issue),
      );
      this.workspaceTransaction.writeWorkflowState(feature, issue, afterIssue, ledger);
      return {
        issue: issueId,
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
    if (options.issue) throw new Error("--issue and --scope delivery are mutually exclusive.");
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
      const issues = this.issueRepository.readIssues(feature.workspace);
      const incomplete = ledger.issues
        .filter((progress) => progress.execution !== "integrated")
        .map((progress) => progress.id);
      if (incomplete.length > 0) {
        throw new Error(
          `Aggregate review requires every issue integrated: ${incomplete.join(", ")}.`,
        );
      }
      if (issues.length !== ledger.issues.length) {
        throw new Error("Aggregate review requires every integrated issue document to be present.");
      }
      const delivery = ledger.delivery;
      if (delivery.adjudication?.status === "pending") {
        throw new Error("Delivery correction is paused for adjudication.");
      }
      if (delivery.owner && delivery.owner !== options.author.trim()) {
        throw new Error("Only the recorded delivery controller may dispatch aggregate review.");
      }
      delivery.owner = options.author.trim();
      const identity = this.gitEvidence.deliveryIdentity(feature, ledger, issues);
      const blockers = this.checkPolicy.deliveryCheckBlockers(delivery, identity);
      if (blockers.length > 0) throw new Error(blockers.join("\n"));
      const baseline = delivery.baseSha!;
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
        this.issueRepository.readIssues(feature.workspace),
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
