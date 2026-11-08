import { randomUUID } from "node:crypto";
import { join } from "node:path";

import matter from "gray-matter";

import type { Application } from "@/Foundation/Application";
import { Service } from "@/Foundation/Service";
import { GitEvidence } from "@/SubagentDrivenDevelopment/Evidence/GitEvidence";
import { ReportEvidence } from "@/SubagentDrivenDevelopment/Evidence/ReportEvidence";
import type {
  ImplementationAssignment,
  CorrectionAttempt,
  CorrectionAdjudication,
  ReviewAssignment,
} from "@/SubagentDrivenDevelopment/Models/Assignments";
import type {
  ClaimOptions,
  ImplementOptions,
  ResumeOptions,
} from "@/SubagentDrivenDevelopment/Models/Options";
import type { ExecutionState } from "@/SubagentDrivenDevelopment/Models/Workflow";
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
import { ReviewPolicy } from "@/SubagentDrivenDevelopment/Policies/ReviewPolicy";
import { WorkflowPolicy } from "@/SubagentDrivenDevelopment/Policies/WorkflowPolicy";
import { FeatureInspectionService } from "@/SubagentDrivenDevelopment/Services/FeatureInspectionService";

export class AssignmentService extends Service {
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

  public claim(options: ClaimOptions): {
    issue: string;
    execution: "claimed";
    owner: string;
    baseSha: string;
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
      const issues = this.issueRepository.readIssues(feature.workspace);
      this.issueRepository.validateDependencyGraph(issues);
      const issue = this.issueRepository.requireIssue(issues, options.issue);
      const progress = this.workflowPolicy.requireProgress(ledger, options.issue);
      if (progress.execution !== "unstarted") {
        throw new Error(
          `Issue ${options.issue} is already owned or has progressed to ${progress.execution}.`,
        );
      }
      if (issue.status !== "ready-for-agent") {
        throw new Error(`Issue ${options.issue} is not ready for an agent.`);
      }
      const byId = new Map(ledger.issues.map((item) => [item.id, item]));
      const issuesById = new Map(issues.map((item) => [item.id, item]));
      const unmet = issue.blocked_by.filter((dependency) => {
        const dependencyProgress = byId.get(dependency);
        const dependencyIssue = issuesById.get(dependency);
        return (
          !dependencyProgress ||
          dependencyProgress.execution !== "integrated" ||
          !dependencyIssue ||
          !this.checkPolicy.hasCurrentCheckCoverage(feature, dependencyIssue, dependencyProgress)
        );
      });
      if (unmet.length > 0) {
        throw new Error(
          `Issue ${options.issue} has dependencies that are not integrated: ${unmet.join(", ")}.`,
        );
      }
      const baseSha = this.gitEvidence.cleanGitBaseline(feature);
      progress.execution = "claimed";
      progress.owner = options.author.trim();
      progress.baseSha = baseSha;
      ledger.delivery.baseSha ??= baseSha;
      const identity = this.gitEvidence.contentIdentity(feature, issue, baseSha, progress.checks);
      const afterIssue = matter.stringify(
        this.issueRepository.appendAudit(
          issue.body,
          options.author,
          `Claimed from clean Git baseline ${baseSha}.`,
        ),
        this.issueRepository.metadata(issue),
      );
      this.workspaceTransaction.writeWorkflowState(feature, issue, afterIssue, ledger);
      return {
        issue: options.issue,
        execution: "claimed",
        owner: options.author.trim(),
        baseSha,
        ...identity,
      };
    });
  }

  public implement(options: ImplementOptions): {
    issue: string;
    execution: "implementing";
    assignment: ImplementationAssignment;
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
      const identity = this.gitEvidence.contentIdentity(
        feature,
        issue,
        progress.baseSha,
        progress.checks,
      );
      if (progress.execution === "implementing" && progress.assignment) {
        if (progress.owner !== options.author.trim()) {
          throw new Error("Controller ownership changed; resume and confirm the handoff first.");
        }
        return {
          issue: options.issue,
          execution: "implementing",
          assignment: progress.assignment,
          ...identity,
        };
      }
      if (progress.execution !== "claimed" || !progress.baseSha || !progress.owner) {
        throw new Error(`Issue ${options.issue} must be claimed before implementation dispatch.`);
      }
      if (progress.owner !== options.author.trim()) {
        throw new Error("Only the recorded controller may dispatch implementation.");
      }

      const report = join(feature.workspace, "reports", `${options.issue}-implementation.md`);
      this.reportEvidence.assertReportPath(feature, report, false);
      if (lstatIfPresent(report)) {
        throw new Error(`Assigned report already exists and was preserved: ${report}.`);
      }
      const assignment: ImplementationAssignment = {
        id: randomUUID(),
        role: "implementation",
        action: "implement",
        controller: options.author.trim(),
        report,
        requestedAt: new Date().toISOString(),
        status: "pending",
        handoffs: [],
      };
      progress.execution = "implementing";
      progress.assignment = assignment;
      const afterIssue = matter.stringify(
        this.issueRepository.appendAudit(
          issue.body,
          options.author,
          `Implementation assignment ${assignment.id} recorded; role=implementation; report=${report}. No agent was launched.`,
        ),
        this.issueRepository.metadata(issue),
      );
      this.workspaceTransaction.writeWorkflowState(feature, issue, afterIssue, ledger);
      return { issue: options.issue, execution: "implementing", assignment, ...identity };
    });
  }

  public resume(options: ResumeOptions): {
    issue?: string;
    scope?: "delivery";
    gate: ExecutionState;
    nextAction: string;
    owner?: string;
    assignment?: ImplementationAssignment;
    correctionAttempts: CorrectionAttempt[];
    adjudication?: CorrectionAdjudication;
    reviewAssignments?: ReviewAssignment[];
    handoffRecorded?: boolean;
    blocker?: string;
    snapshot: string;
    codeSnapshot: string;
    requirementsSnapshot: string;
    headSha: string;
  } {
    if (options.scope === "delivery") {
      if (options.issue) throw new Error("--issue and --scope delivery are mutually exclusive.");
      return this.deliveryResume(options);
    }
    if (options.scope !== undefined) throw new Error("--scope must be 'delivery'.");
    if (!options.issue) throw new Error("resume requires --issue or --scope delivery.");
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
      let handoffRecorded = false;
      if (progress.owner && progress.owner !== options.author.trim()) {
        if (!options.confirmHandoff) {
          throw new Error(
            `Ownership handoff from ${progress.owner} to ${options.author.trim()} requires --confirm-handoff after the previous controller has stopped editing.`,
          );
        }
        const previousOwner = progress.owner;
        progress.owner = options.author.trim();
        if (progress.assignment) {
          progress.assignment.controller = options.author.trim();
          progress.assignment.handoffs.push({
            at: new Date().toISOString(),
            from: previousOwner,
            to: options.author.trim(),
            confirmedStopped: true,
          });
        }
        const afterIssue = matter.stringify(
          this.issueRepository.appendAudit(
            issue.body,
            options.author,
            `Controller handoff from ${previousOwner} to ${options.author.trim()} confirmed after the previous controller stopped editing.`,
          ),
          this.issueRepository.metadata(issue),
        );
        this.workspaceTransaction.writeWorkflowState(feature, issue, afterIssue, ledger);
        handoffRecorded = true;
      }
      const currentIssue = this.issueRepository.requireIssue(
        this.issueRepository.readIssues(feature.workspace),
        options.issue,
      );
      const identity = this.gitEvidence.contentIdentity(
        feature,
        currentIssue,
        progress.baseSha,
        progress.checks,
      );
      const reviewAssignments =
        progress.assignment?.action === "correct"
          ? ((progress.correctionAttempts ?? []).find(
              (attempt) => attempt.assignmentId === progress.assignment?.id,
            )?.reviewAssignments ?? [])
          : progress.reviewAssignments;
      const resumeProgress =
        reviewAssignments === undefined ? progress : { ...progress, reviewAssignments };
      const reviewBlocker = (reviewAssignments ?? [])
        .map((assignment) =>
          this.reviewPolicy.reviewAssignmentBlocker(feature, progress, assignment, identity),
        )
        .find((reason) => reason !== undefined);
      const blocker =
        this.assignmentPolicy.resumeBlocker(feature, progress) ??
        reviewBlocker ??
        this.checkPolicy.checkBlockers(feature, currentIssue, progress, identity)[0];
      return {
        issue: options.issue,
        gate: progress.execution,
        nextAction: this.workflowPolicy.nextAction(resumeProgress, blocker),
        ...(progress.owner ? { owner: progress.owner } : {}),
        ...(progress.assignment ? { assignment: progress.assignment } : {}),
        correctionAttempts: progress.correctionAttempts ?? [],
        ...(progress.adjudication ? { adjudication: progress.adjudication } : {}),
        ...(reviewAssignments ? { reviewAssignments } : {}),
        ...(handoffRecorded ? { handoffRecorded: true } : {}),
        ...(blocker ? { blocker } : {}),
        ...identity,
      };
    });
  }

  public deliveryResume(options: ResumeOptions): {
    scope: "delivery";
    gate: ExecutionState;
    nextAction: string;
    owner?: string;
    assignment?: ImplementationAssignment;
    correctionAttempts: CorrectionAttempt[];
    adjudication?: CorrectionAdjudication;
    reviewAssignments?: ReviewAssignment[];
    handoffRecorded?: boolean;
    blocker?: string;
    retrospectiveRequired: boolean;
    finished: boolean;
    snapshot: string;
    codeSnapshot: string;
    requirementsSnapshot: string;
    headSha: string;
  } {
    validateAuthor(options.author);
    const feature = this.featureInspectionService.resolveFeature(options.spec);
    return this.workspaceTransaction.run(feature.workspace, () => {
      const ledger = this.ledgerRepository.readLedger(feature);
      const delivery = ledger.delivery;
      let handoffRecorded = false;
      if (delivery.owner && delivery.owner !== options.author.trim()) {
        if (!options.confirmHandoff) {
          throw new Error(
            `Ownership handoff from ${delivery.owner} to ${options.author.trim()} requires --confirm-handoff after the previous controller has stopped editing.`,
          );
        }
        const previousOwner = delivery.owner;
        delivery.owner = options.author.trim();
        if (delivery.assignment) {
          delivery.assignment.controller = options.author.trim();
          delivery.assignment.handoffs.push({
            at: new Date().toISOString(),
            from: previousOwner,
            to: options.author.trim(),
            confirmedStopped: true,
          });
        }
        delivery.history.push({
          at: new Date().toISOString(),
          author: options.author.trim(),
          action: `controller-handoff:${previousOwner}`,
        });
        this.workspaceTransaction.writeLedger(feature, ledger);
        handoffRecorded = true;
      }
      const issues = this.issueRepository.readIssues(feature.workspace);
      const identity = this.gitEvidence.deliveryIdentity(feature, ledger, issues);
      const completion = delivery.finished
        ? this.featureInspectionService.deliveryStatus(feature, ledger, issues)
        : undefined;
      const checkBlocker = this.checkPolicy.deliveryCheckBlockers(delivery, identity)[0];
      let blocker =
        completion?.action === "completion-invalidated"
          ? `Finished delivery completion is invalidated: ${completion.blockers.join(" ")}`
          : delivery.adjudication?.status === "pending"
            ? `Delivery correction is paused for adjudication (${delivery.adjudication.reason}).`
            : checkBlocker;
      let nextAction: string;
      if (completion) {
        nextAction = completion.action;
      } else if (delivery.adjudication?.status === "pending") {
        nextAction = "adjudicate";
      } else if (
        delivery.assignment &&
        ["pending", "unavailable"].includes(delivery.assignment.status)
      ) {
        nextAction = "await-implementation-report";
      } else if (
        delivery.reviewAssignments?.some((assignment) => assignment.status === "pending")
      ) {
        nextAction = "await-review-report";
      } else if (checkBlocker) {
        nextAction = "record-final-checks";
      } else if (delivery.execution === "changes-requested") {
        nextAction = "correct";
      } else if (delivery.execution === "reviewing") {
        nextAction = "review-or-finish";
      } else {
        nextAction = "review";
      }
      return {
        scope: "delivery",
        gate: delivery.execution,
        nextAction,
        ...(delivery.owner ? { owner: delivery.owner } : {}),
        ...(delivery.assignment ? { assignment: delivery.assignment } : {}),
        correctionAttempts: delivery.correctionAttempts ?? [],
        ...(delivery.adjudication ? { adjudication: delivery.adjudication } : {}),
        ...(delivery.reviewAssignments ? { reviewAssignments: delivery.reviewAssignments } : {}),
        ...(handoffRecorded ? { handoffRecorded: true } : {}),
        ...(blocker ? { blocker } : {}),
        retrospectiveRequired: ledger.retrospectiveRequired,
        finished: !!delivery.finished,
        ...identity,
      };
    });
  }
}
