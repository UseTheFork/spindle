import matter from "gray-matter";

import type { Application } from "@/Foundation/Application";
import { Service } from "@/Foundation/Service";
import { GitEvidence } from "@/SubagentDrivenDevelopment/Evidence/GitEvidence";
import { ReportEvidence } from "@/SubagentDrivenDevelopment/Evidence/ReportEvidence";
import type { ContentIdentity } from "@/SubagentDrivenDevelopment/Models/Evidence";
import type { AcceptOptions, IntegrateOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import { IssueRepository } from "@/SubagentDrivenDevelopment/Persistence/IssueRepository";
import { LedgerRepository } from "@/SubagentDrivenDevelopment/Persistence/LedgerRepository";
import { WorkspaceTransaction } from "@/SubagentDrivenDevelopment/Persistence/WorkspaceTransaction";
import { AcceptancePolicy } from "@/SubagentDrivenDevelopment/Policies/AcceptancePolicy";
import {
  validateAuthor,
  validateIssueId,
} from "@/SubagentDrivenDevelopment/Policies/InputValidation";
import { requiredIssueReviewers } from "@/SubagentDrivenDevelopment/Policies/RequiredReviewers";
import { WorkflowPolicy } from "@/SubagentDrivenDevelopment/Policies/WorkflowPolicy";
import { FeatureInspectionService } from "@/SubagentDrivenDevelopment/Services/FeatureInspectionService";

export class IntegrationService extends Service {
  public constructor(
    app: Application,
    private readonly gitEvidence: GitEvidence,
    private readonly reportEvidence: ReportEvidence,
    private readonly issueRepository: IssueRepository,
    private readonly ledgerRepository: LedgerRepository,
    private readonly workspaceTransaction: WorkspaceTransaction,
    private readonly acceptancePolicy: AcceptancePolicy,
    private readonly workflowPolicy: WorkflowPolicy,
    private readonly featureInspectionService: FeatureInspectionService,
  ) {
    super(app);
  }

  public accept(options: AcceptOptions): {
    issue: string;
    execution: "accepted";
    reviews: {
      agent: string;
      assignment: string;
      result: "passed";
      noFindings?: true;
      findingIds?: string[];
    }[];
    idempotent?: boolean;
    snapshot: string;
    codeSnapshot: string;
    requirementsSnapshot: string;
    headSha: string;
  } {
    validateIssueId(options.issue);
    validateAuthor(options.author);
    const feature = this.featureInspectionService.resolveFeature(options.spec);
    return this.workspaceTransaction.run(feature.workspace, () => {
      const ledger = this.ledgerRepository.readLedger(feature);
      const issue = this.issueRepository.requireIssue(
        this.issueRepository.readIssues(feature.workspace),
        options.issue,
      );
      const progress = this.workflowPolicy.requireProgress(ledger, options.issue);
      if (
        progress.execution !== "reviewing" &&
        progress.execution !== "changes-requested" &&
        progress.execution !== "accepted"
      ) {
        throw new Error(`Issue ${options.issue} must be reviewing before it can be accepted.`);
      }
      if (!progress.owner || progress.owner !== options.author.trim()) {
        throw new Error("Only the current controller may accept this issue.");
      }
      const identity = this.gitEvidence.contentIdentity(
        feature,
        issue,
        progress.baseSha,
        progress.checks,
      );
      const blockers = this.acceptancePolicy.acceptBlockers(
        feature,
        ledger,
        issue,
        progress,
        identity,
      );
      if (blockers.length > 0) {
        throw new Error(`Issue ${options.issue} cannot be accepted:\n${blockers.join("\n")}`);
      }
      const reviews = requiredIssueReviewers(ledger, progress).map(({ agent, details }) => {
        const assignment = progress.reviewAssignments!.find(
          (candidate) =>
            candidate.agent === agent &&
            candidate.objective === details &&
            candidate.scope === "initial",
        )!;
        return {
          agent,
          assignment: assignment.id,
          result: "passed" as const,
          ...(assignment.noFindings === true
            ? { noFindings: true as const }
            : { findingIds: assignment.findingIds }),
        };
      });
      if (progress.execution === "accepted") {
        if (!progress.acceptedEvidence) {
          throw new Error(`Accepted issue ${options.issue} has no frozen integration evidence.`);
        }
        return {
          issue: options.issue,
          execution: "accepted",
          reviews,
          idempotent: true,
          ...identity,
        };
      }

      const confirmedIssue = this.issueRepository.requireIssue(
        this.issueRepository.readIssues(feature.workspace),
        options.issue,
      );
      const confirmedIdentity = this.gitEvidence.contentIdentity(
        feature,
        confirmedIssue,
        progress.baseSha,
        progress.checks,
      );
      const confirmedBlockers = this.acceptancePolicy.acceptBlockers(
        feature,
        ledger,
        confirmedIssue,
        progress,
        confirmedIdentity,
      );
      if (confirmedIdentity.snapshot !== identity.snapshot || confirmedBlockers.length > 0) {
        throw new Error(
          `Issue content changed while accepting; revalidate current review and check coverage:\n${confirmedBlockers.join("\n")}`,
        );
      }
      const acceptedFiles = this.workflowPolicy.acceptedInventory(progress, options.issue);
      if (
        JSON.stringify(this.gitEvidence.changedPaths(progress.baseSha!)) !==
        JSON.stringify(acceptedFiles)
      ) {
        throw new Error("Accepted Git inventory changed while accepting the issue.");
      }
      const contentDigest = this.gitEvidence.worktreeContentDigest(acceptedFiles);
      progress.execution = "accepted";
      progress.acceptedEvidence = {
        snapshot: identity.snapshot,
        codeSnapshot: identity.codeSnapshot,
        requirementsSnapshot: identity.requirementsSnapshot,
        files: acceptedFiles,
        contentDigest,
      };
      const afterIssue = matter.stringify(
        this.issueRepository.appendAudit(
          issue.body,
          options.author,
          `Issue accepted with current passing checks and complete initial review coverage: ${reviews.map((review) => `${review.agent} (${review.assignment})`).join(", ")}.`,
        ),
        this.issueRepository.metadata(issue),
      );
      this.workspaceTransaction.writeWorkflowState(feature, issue, afterIssue, ledger);
      return {
        issue: options.issue,
        execution: "accepted",
        reviews,
        ...identity,
      };
    });
  }

  public integrate(options: IntegrateOptions): {
    issue: string;
    execution: "accepted" | "integrated";
    acceptedFiles: string[];
    deliveryRecords: string[];
    commitSha?: string;
    idempotent?: boolean;
    snapshot: string;
    codeSnapshot: string;
    requirementsSnapshot: string;
    headSha: string;
  } {
    validateIssueId(options.issue);
    validateAuthor(options.author);
    if (options.commit && !/^[0-9a-f]{40,64}$/i.test(options.commit)) {
      throw new Error("--commit must be an existing full Git commit SHA.");
    }
    const feature = this.featureInspectionService.resolveFeature(options.spec);
    return this.workspaceTransaction.run(feature.workspace, () => {
      const ledger = this.ledgerRepository.readLedger(feature);
      const issue = this.issueRepository.requireIssue(
        this.issueRepository.readIssues(feature.workspace),
        options.issue,
      );
      const progress = this.workflowPolicy.requireProgress(ledger, options.issue);
      if (progress.execution !== "accepted" && progress.execution !== "integrated") {
        throw new Error(`Issue ${options.issue} must be accepted before integration.`);
      }
      if (!progress.owner || progress.owner !== options.author.trim()) {
        throw new Error("Only the current controller may integrate this issue.");
      }
      const accepted = progress.acceptedEvidence;
      if (!accepted) {
        throw new Error(`Issue ${options.issue} has no frozen accepted inventory and evidence.`);
      }
      if (!progress.baseSha) {
        throw new Error(`Issue ${options.issue} has no recorded Git baseline for integration.`);
      }

      const identity = this.gitEvidence.contentIdentity(
        feature,
        issue,
        progress.baseSha,
        progress.checks,
      );
      if (identity.requirementsSnapshot !== accepted.requirementsSnapshot) {
        throw new Error("Accepted requirements evidence is stale; re-review is required.");
      }
      const inventory = this.gitEvidence.changedPaths(progress.baseSha);
      if (JSON.stringify(inventory) !== JSON.stringify(accepted.files)) {
        throw new Error(
          `Git-derived inventory changed after acceptance; expected ${JSON.stringify(accepted.files)}, found ${JSON.stringify(inventory)}.`,
        );
      }
      const currentDigest = this.gitEvidence.worktreeContentDigest(accepted.files);
      if (currentDigest !== accepted.contentDigest) {
        throw new Error("Accepted file content changed after acceptance.");
      }
      this.gitEvidence.assertSafeIntegrationChanges(feature, accepted.files, ledger);
      this.reportEvidence.assertAcceptedReportsCurrent(feature, progress);

      if (!options.commit) {
        if (progress.execution === "integrated") {
          return {
            issue: options.issue,
            execution: "integrated",
            acceptedFiles: accepted.files,
            deliveryRecords: this.gitEvidence.deliveryRecordPaths(feature),
            commitSha: progress.integration?.commitSha,
            idempotent: true,
            ...identity,
          };
        }
        const blockers = this.acceptancePolicy.acceptBlockers(
          feature,
          ledger,
          issue,
          progress,
          identity,
        );
        if (blockers.length > 0) {
          throw new Error(`Issue ${options.issue} cannot be integrated:\n${blockers.join("\n")}`);
        }
        return {
          issue: options.issue,
          execution: "accepted",
          acceptedFiles: accepted.files,
          deliveryRecords: this.gitEvidence.deliveryRecordPaths(feature),
          ...identity,
        };
      }

      const requestedCommit = this.gitEvidence
        .gitBuffer(["rev-parse", "--verify", `${options.commit}^{commit}`])
        .toString("utf8")
        .trim()
        .toLowerCase();
      if (requestedCommit !== options.commit.toLowerCase()) {
        throw new Error(`Commit ${options.commit} did not resolve to the requested commit.`);
      }
      if (progress.execution === "integrated") {
        if (progress.integration?.commitSha !== requestedCommit) {
          throw new Error(
            `Issue ${options.issue} is already integrated through ${progress.integration?.commitSha ?? "an unknown commit"}.`,
          );
        }
        if (this.gitEvidence.gitIndexContentDigest(accepted.files) !== accepted.contentDigest) {
          throw new Error("Staged index content does not match the accepted file content.");
        }
        return {
          issue: options.issue,
          execution: "integrated",
          acceptedFiles: accepted.files,
          deliveryRecords: this.gitEvidence.deliveryRecordPaths(feature),
          commitSha: requestedCommit,
          idempotent: true,
          ...identity,
        };
      }

      const acceptedIdentity: ContentIdentity = {
        snapshot: accepted.snapshot,
        codeSnapshot: accepted.codeSnapshot,
        requirementsSnapshot: accepted.requirementsSnapshot,
        headSha: identity.headSha,
      };
      const acceptanceBlockers = this.acceptancePolicy.acceptBlockers(
        feature,
        ledger,
        issue,
        progress,
        acceptedIdentity,
      );
      if (acceptanceBlockers.length > 0) {
        throw new Error(
          `Accepted evidence is no longer valid for integration:\n${acceptanceBlockers.join("\n")}`,
        );
      }

      const headSha = this.gitEvidence.headSha();
      if (headSha !== requestedCommit) {
        throw new Error(
          `Commit ${requestedCommit} must be the current HEAD (${headSha}) before integration can be confirmed.`,
        );
      }
      const ancestry = this.gitEvidence
        .gitBuffer(["rev-list", "--parents", "-n", "1", requestedCommit])
        .toString("utf8")
        .trim()
        .split(/\s+/);
      if (ancestry.length !== 2 || ancestry[1] !== progress.baseSha) {
        throw new Error(
          `Commit ${requestedCommit} must be a caller-created child of the recorded baseline ${progress.baseSha}.`,
        );
      }
      const committedFiles = this.gitEvidence
        .gitBuffer([
          "diff",
          "--name-only",
          "-z",
          "--no-renames",
          progress.baseSha,
          requestedCommit,
          "--",
          ".",
        ])
        .toString("utf8")
        .split("\0")
        .filter(Boolean)
        .sort();
      if (JSON.stringify(committedFiles) !== JSON.stringify(accepted.files)) {
        throw new Error(
          `Commit contents do not match the accepted inventory; expected ${JSON.stringify(accepted.files)}, found ${JSON.stringify(committedFiles)}.`,
        );
      }
      if (
        this.gitEvidence.gitTreeContentDigest(requestedCommit, accepted.files) !==
        accepted.contentDigest
      ) {
        throw new Error("Caller commit content does not match the accepted file content.");
      }
      if (this.gitEvidence.worktreeContentDigest(accepted.files) !== accepted.contentDigest) {
        throw new Error("Accepted file content changed before integration confirmation.");
      }
      if (this.gitEvidence.gitIndexContentDigest(accepted.files) !== accepted.contentDigest) {
        throw new Error("Staged index content does not match the accepted file content.");
      }

      progress.execution = "integrated";
      progress.integration = {
        commitSha: requestedCommit,
        integratedAt: new Date().toISOString(),
        integratedBy: options.author.trim(),
        files: accepted.files,
        contentDigest: accepted.contentDigest,
      };
      const afterIssue = matter.stringify(
        this.issueRepository.appendAudit(
          issue.body,
          options.author,
          `Issue integration confirmed against caller-owned commit ${requestedCommit}; delivery records remain caller-owned.`,
        ),
        this.issueRepository.metadata(issue),
      );
      this.workspaceTransaction.writeWorkflowState(feature, issue, afterIssue, ledger);
      return {
        issue: options.issue,
        execution: "integrated",
        acceptedFiles: accepted.files,
        deliveryRecords: this.gitEvidence.deliveryRecordPaths(feature),
        commitSha: requestedCommit,
        ...this.gitEvidence.contentIdentity(
          feature,
          this.issueRepository.requireIssue(
            this.issueRepository.readIssues(feature.workspace),
            options.issue,
          ),
          progress.baseSha,
          progress.checks,
        ),
      };
    });
  }
}
