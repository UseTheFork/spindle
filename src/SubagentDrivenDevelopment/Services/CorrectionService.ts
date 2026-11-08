import { randomUUID } from "node:crypto";
import { join } from "node:path";

import matter from "gray-matter";

import type { Application } from "@/foundation/Application";
import { Service } from "@/services/Service";
import { GitEvidence } from "@/SubagentDrivenDevelopment/Evidence/GitEvidence";
import { ReportEvidence } from "@/SubagentDrivenDevelopment/Evidence/ReportEvidence";
import type {
  ImplementationAssignment,
  CorrectionAttempt,
  CorrectionAdjudication,
} from "@/SubagentDrivenDevelopment/Models/Assignments";
import type { CorrectOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import type { ExecutionState } from "@/SubagentDrivenDevelopment/Models/Workflow";
import { lstatIfPresent } from "@/SubagentDrivenDevelopment/Persistence/FileSystem";
import { IssueRepository } from "@/SubagentDrivenDevelopment/Persistence/IssueRepository";
import { LedgerRepository } from "@/SubagentDrivenDevelopment/Persistence/LedgerRepository";
import { WorkspaceTransaction } from "@/SubagentDrivenDevelopment/Persistence/WorkspaceTransaction";
import {
  validateAuthor,
  validateIssueId,
} from "@/SubagentDrivenDevelopment/Policies/InputValidation";
import { WorkflowPolicy } from "@/SubagentDrivenDevelopment/Policies/WorkflowPolicy";
import { DeliveryCorrectionService } from "@/SubagentDrivenDevelopment/Services/DeliveryCorrectionService";
import { FeatureInspectionService } from "@/SubagentDrivenDevelopment/Services/FeatureInspectionService";

export class CorrectionService extends Service {
  public constructor(
    app: Application,
    private readonly gitEvidence: GitEvidence,
    private readonly reportEvidence: ReportEvidence,
    private readonly issueRepository: IssueRepository,
    private readonly ledgerRepository: LedgerRepository,
    private readonly workspaceTransaction: WorkspaceTransaction,
    private readonly workflowPolicy: WorkflowPolicy,
    private readonly deliveryCorrectionService: DeliveryCorrectionService,
    private readonly featureInspectionService: FeatureInspectionService,
  ) {
    super(app);
  }

  public correct(options: CorrectOptions): {
    issue?: string;
    scope?: "delivery";
    execution: ExecutionState;
    attempt?: CorrectionAttempt;
    assignment?: ImplementationAssignment;
    paused?: boolean;
    adjudication?: CorrectionAdjudication;
    idempotent?: boolean;
    snapshot: string;
    codeSnapshot: string;
    requirementsSnapshot: string;
    headSha: string;
  } {
    if (options.scope === "delivery") {
      if (options.issue) throw new Error("--issue and --scope delivery are mutually exclusive.");
      return this.deliveryCorrectionService.deliveryCorrect(options);
    }
    if (options.scope !== undefined) throw new Error("--scope must be 'delivery'.");
    if (!options.issue) throw new Error("correct requires --issue or --scope delivery.");
    validateIssueId(options.issue);
    validateAuthor(options.author);
    const findingIds = [...new Set((options.findings ?? []).map((finding) => finding.trim()))];
    if (findingIds.some((finding) => !/^F-\d{4,}$/.test(finding))) {
      throw new Error("--findings must contain canonical finding IDs.");
    }
    const objective = options.details.trim();
    if (!objective) throw new Error("--details must not be empty.");
    if (options.decision !== undefined && !["continue", "pause"].includes(options.decision)) {
      throw new Error("--decision must be 'continue' or 'pause'.");
    }
    if (options.decision !== "pause" && findingIds.length === 0 && !options.checkFailure?.trim()) {
      throw new Error(
        "correct requires actionable --findings or a non-mechanical --check-failure.",
      );
    }
    if (options.decision === "pause") {
      if (
        ![
          "no-progress",
          "repeated-failure",
          "recurring-blocker",
          "requirements-disagreement",
          "worker-blocked",
        ].includes(options.reason ?? "")
      ) {
        throw new Error(
          "--reason is required for a pause and must identify the adjudication category.",
        );
      }
      if (options.assessment || options.assessmentResult)
        throw new Error("--assessment is only valid with --decision continue.");
    } else if (options.reason) {
      throw new Error("--reason is only valid with --decision pause.");
    }
    if (
      options.decision === "continue" &&
      (!options.assessment?.trim() || options.assessmentResult !== "productive")
    ) {
      throw new Error(
        "--assessment and --assessment-result productive are required with --decision continue.",
      );
    }
    if (options.assessmentResult && options.decision !== "continue") {
      throw new Error("--assessment-result is only valid with --decision continue.");
    }

    const feature = this.featureInspectionService.resolveFeature(options.spec);
    return this.workspaceTransaction.run(feature.workspace, () => {
      const ledger = this.ledgerRepository.readLedger(feature);
      const issue = this.issueRepository.requireIssue(
        this.issueRepository.readIssues(feature.workspace),
        options.issue,
      );
      const progress = this.workflowPolicy.requireProgress(ledger, options.issue);
      if (progress.owner !== options.author.trim()) {
        throw new Error("Only the recorded issue controller may dispatch a correction.");
      }

      const attempts = (progress.correctionAttempts ??= []);
      if (options.decision === "pause") {
        if (progress.execution === "implementing" && progress.assignment?.status !== "submitted") {
          throw new Error("A pending implementation assignment must be resumed, not paused.");
        }
        const identity = this.gitEvidence.contentIdentity(
          feature,
          issue,
          progress.baseSha,
          progress.checks,
        );
        const hasCurrentFailure = (progress.checks?.records ?? []).some(
          (record) =>
            record.snapshot === identity.snapshot &&
            record.codeSnapshot === identity.codeSnapshot &&
            record.requirementsSnapshot === identity.requirementsSnapshot &&
            record.result === "failed",
        );
        if (
          attempts.length === 0 &&
          progress.execution !== "changes-requested" &&
          !hasCurrentFailure
        ) {
          throw new Error(
            "Adjudication pause requires a recorded failed correction, check, or review.",
          );
        }
        const adjudication: CorrectionAdjudication = {
          status: "pending",
          reason: options.reason!,
          details: objective,
          recordedAt: new Date().toISOString(),
          recordedBy: options.author.trim(),
        };
        if (
          progress.adjudication?.status === "pending" &&
          progress.adjudication.reason === adjudication.reason &&
          progress.adjudication.details === adjudication.details &&
          progress.adjudication.recordedBy === adjudication.recordedBy
        ) {
          return {
            issue: options.issue,
            execution: progress.execution,
            adjudication: progress.adjudication,
            paused: true,
            idempotent: true,
            ...identity,
          };
        }
        progress.adjudication = adjudication;
        const afterIssue = matter.stringify(
          this.issueRepository.appendAudit(
            issue.body,
            options.author,
            `Corrective work paused for adjudication (${adjudication.reason}): ${adjudication.details}.`,
          ),
          this.issueRepository.metadata(issue),
        );
        this.workspaceTransaction.writeWorkflowState(feature, issue, afterIssue, ledger);
        return {
          issue: options.issue,
          execution: progress.execution,
          adjudication,
          paused: true,
          ...identity,
        };
      }
      if (
        progress.execution === "implementing" &&
        progress.assignment?.action === "correct" &&
        progress.assignment.status !== "submitted" &&
        progress.assignment.findingIds?.join(",") === findingIds.join(",") &&
        progress.assignment.checkFailure === options.checkFailure?.trim() &&
        progress.assignment.objective === objective
      ) {
        const current = attempts.find((attempt) => attempt.number === progress.assignment?.attempt);
        if (!current) throw new Error("Corrective assignment has no persisted attempt record.");
        const identity = this.gitEvidence.contentIdentity(
          feature,
          issue,
          progress.baseSha,
          progress.checks,
        );
        return {
          issue: options.issue,
          execution: "implementing",
          attempt: current,
          assignment: progress.assignment,
          idempotent: true,
          ...identity,
        };
      }
      const pendingAdjudication = progress.adjudication?.status === "pending";
      if (pendingAdjudication && options.decision !== "continue") {
        throw new Error(
          `Issue ${options.issue} is paused for adjudication (${progress.adjudication?.reason}); resolve it before another correction.`,
        );
      }
      const checkDriven = !!options.checkFailure?.trim();
      if (!checkDriven && progress.execution !== "changes-requested") {
        throw new Error(`Issue ${options.issue} must have a failed review before correction.`);
      }
      if (checkDriven && !["reviewing", "changes-requested"].includes(progress.execution)) {
        throw new Error(
          `Issue ${options.issue} must have a submitted implementation before correction.`,
        );
      }
      if (!progress.baseSha)
        throw new Error("Correction requires the issue's recorded Git baseline.");
      if (progress.assignment?.action === "correct" && progress.assignment.status !== "submitted") {
        throw new Error("The current correction assignment must be resumed, not replaced.");
      }
      if (attempts.length > 0 || pendingAdjudication) {
        if (options.decision !== "continue" || !options.assessment?.trim()) {
          throw new Error(
            "A subsequent correction requires --decision continue and an explicit --assessment.",
          );
        }
        const previous = attempts.at(-1)!;
        if (
          previous.progressAssessment?.decision !== "continue" ||
          previous.progressAssessment.result !== "productive" ||
          previous.progressAssessment.recordedBy !== options.author.trim() ||
          previous.progressAssessment.details !== options.assessment.trim()
        ) {
          previous.progressAssessment = {
            decision: "continue",
            result: "productive",
            details: options.assessment.trim(),
            recordedAt: new Date().toISOString(),
            recordedBy: options.author.trim(),
          };
        }
      } else if (options.decision || options.assessment) {
        throw new Error("The first correction does not accept a continuation assessment.");
      }

      const identity = this.gitEvidence.contentIdentity(
        feature,
        issue,
        progress.baseSha,
        progress.checks,
      );
      const findings = progress.findings ?? [];
      for (const id of findingIds) {
        const finding = findings.find((candidate) => candidate.id === id);
        if (!finding || finding.status !== "confirmed") {
          throw new Error(`Finding ${id} is not an actionable unresolved finding.`);
        }
      }
      const checkFailure = options.checkFailure?.trim();
      if (checkFailure) {
        const record = progress.checks?.records
          .filter(
            (candidate) =>
              candidate.command === checkFailure &&
              candidate.snapshot === identity.snapshot &&
              candidate.codeSnapshot === identity.codeSnapshot &&
              candidate.requirementsSnapshot === identity.requirementsSnapshot,
          )
          .at(-1);
        if (!record || record.result !== "failed") {
          throw new Error(
            `Check failure '${checkFailure}' must be an explicitly recorded failed check for the current snapshot.`,
          );
        }
      }

      const number = attempts.length + 1;
      const assignment: ImplementationAssignment = {
        id: randomUUID(),
        role: "implementation",
        action: "correct",
        controller: options.author.trim(),
        attempt: number,
        findingIds,
        ...(checkFailure ? { checkFailure } : {}),
        objective,
        report: join(feature.workspace, "reports", `${options.issue}-round-${number}-fix.md`),
        requestedAt: new Date().toISOString(),
        status: "pending",
        handoffs: [],
      };
      this.reportEvidence.assertReportPath(feature, assignment.report, false);
      if (lstatIfPresent(assignment.report)) {
        throw new Error(`Assigned report already exists and was preserved: ${assignment.report}.`);
      }
      const attempt: CorrectionAttempt = {
        number,
        findingIds,
        ...(checkFailure ? { checkFailure } : {}),
        objective,
        startedAt: assignment.requestedAt,
        startedBy: options.author.trim(),
        assignmentId: assignment.id,
        assignment,
        ...(progress.assignment ? { priorAssignment: progress.assignment } : {}),
        ...(checkFailure
          ? {
              checks: (progress.checks?.records ?? []).filter(
                (record) =>
                  record.snapshot === identity.snapshot &&
                  record.codeSnapshot === identity.codeSnapshot &&
                  record.requirementsSnapshot === identity.requirementsSnapshot,
              ),
            }
          : {}),
      };
      if (attempts.length > 0 || pendingAdjudication) {
        attempt.progressAssessment = {
          decision: "continue",
          result: "productive",
          details: options.assessment!.trim(),
          recordedAt: new Date().toISOString(),
          recordedBy: options.author.trim(),
        };
      }
      attempts.push(attempt);
      progress.execution = "implementing";
      progress.assignment = assignment;
      if (pendingAdjudication && progress.adjudication) {
        progress.adjudication.status = "resolved";
        progress.adjudication.resolution = {
          details: options.assessment!.trim(),
          recordedAt: new Date().toISOString(),
          recordedBy: options.author.trim(),
        };
      }
      const afterIssue = matter.stringify(
        this.issueRepository.appendAudit(
          issue.body,
          options.author,
          `Corrective attempt ${number} recorded; objective=${objective}; findings=${findingIds.join(",") || "none"}${checkFailure ? `; check-failure=${checkFailure}` : ""}; report=${assignment.report}. No agent was launched.`,
        ),
        this.issueRepository.metadata(issue),
      );
      this.workspaceTransaction.writeWorkflowState(feature, issue, afterIssue, ledger);
      return {
        issue: options.issue,
        execution: "implementing",
        attempt,
        assignment,
        ...identity,
      };
    });
  }
}
