import { randomUUID } from "node:crypto";
import { join } from "node:path";

import type { Application } from "@/Foundation/Application";
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
import { validateAuthor } from "@/SubagentDrivenDevelopment/Policies/InputValidation";
import { FeatureInspectionService } from "@/SubagentDrivenDevelopment/Services/FeatureInspectionService";

export class DeliveryCorrectionService extends Service {
  public constructor(
    app: Application,
    private readonly gitEvidence: GitEvidence,
    private readonly reportEvidence: ReportEvidence,
    private readonly issueRepository: IssueRepository,
    private readonly ledgerRepository: LedgerRepository,
    private readonly workspaceTransaction: WorkspaceTransaction,
    private readonly featureInspectionService: FeatureInspectionService,
  ) {
    super(app);
  }

  public deliveryCorrect(options: CorrectOptions): {
    scope: "delivery";
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
      if (options.assessment || options.assessmentResult) {
        throw new Error("--assessment is only valid with --decision continue.");
      }
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
      const delivery = ledger.delivery;
      if (delivery.owner !== options.author.trim()) {
        throw new Error("Only the recorded delivery controller may dispatch a correction.");
      }
      const attempts = (delivery.correctionAttempts ??= []);
      const identity = this.gitEvidence.deliveryIdentity(
        feature,
        ledger,
        this.issueRepository.readIssues(feature.workspace),
      );
      const currentFailedCheck = (delivery.checks?.records ?? []).some(
        (record) =>
          record.snapshot === identity.snapshot &&
          record.codeSnapshot === identity.codeSnapshot &&
          record.requirementsSnapshot === identity.requirementsSnapshot &&
          record.result === "failed",
      );
      if (options.decision === "pause") {
        if (delivery.execution === "implementing" && delivery.assignment?.status !== "submitted") {
          throw new Error(
            "A pending delivery implementation assignment must be resumed, not paused.",
          );
        }
        if (
          attempts.length === 0 &&
          delivery.execution !== "changes-requested" &&
          !currentFailedCheck
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
          delivery.adjudication?.status === "pending" &&
          delivery.adjudication.reason === adjudication.reason &&
          delivery.adjudication.details === adjudication.details &&
          delivery.adjudication.recordedBy === adjudication.recordedBy
        ) {
          return {
            scope: "delivery",
            execution: delivery.execution,
            adjudication: delivery.adjudication,
            paused: true,
            idempotent: true,
            ...identity,
          };
        }
        delivery.adjudication = adjudication;
        delivery.execution = "changes-requested";
        delivery.history.push({
          at: adjudication.recordedAt,
          author: adjudication.recordedBy,
          action: `correction-paused:${adjudication.reason}`,
        });
        this.workspaceTransaction.writeLedger(feature, ledger);
        return {
          scope: "delivery",
          execution: delivery.execution,
          adjudication,
          paused: true,
          ...identity,
        };
      }
      if (
        delivery.execution === "implementing" &&
        delivery.assignment?.action === "correct" &&
        delivery.assignment.status !== "submitted" &&
        delivery.assignment.findingIds?.join(",") === findingIds.join(",") &&
        delivery.assignment.checkFailure === options.checkFailure?.trim() &&
        delivery.assignment.objective === objective
      ) {
        const current = attempts.find((attempt) => attempt.number === delivery.assignment?.attempt);
        if (!current)
          throw new Error("Delivery correction assignment has no persisted attempt record.");
        return {
          scope: "delivery",
          execution: "implementing",
          attempt: current,
          assignment: delivery.assignment,
          idempotent: true,
          ...identity,
        };
      }
      if (delivery.adjudication?.status === "pending" && options.decision !== "continue") {
        throw new Error(
          `Delivery correction is paused for adjudication (${delivery.adjudication.reason}).`,
        );
      }
      if (delivery.execution !== "changes-requested" && !currentFailedCheck) {
        throw new Error(
          "Delivery must have a failed aggregate review or current failed check before correction.",
        );
      }
      if (delivery.assignment?.action === "correct" && delivery.assignment.status !== "submitted") {
        throw new Error(
          "The current delivery correction assignment must be resumed, not replaced.",
        );
      }
      if (attempts.length > 0 || delivery.adjudication?.status === "pending") {
        if (options.decision !== "continue" || !options.assessment?.trim()) {
          throw new Error(
            "A subsequent delivery correction requires --decision continue and --assessment.",
          );
        }
        const previous = attempts.at(-1)!;
        previous.progressAssessment = {
          decision: "continue",
          result: "productive",
          details: options.assessment.trim(),
          recordedAt: new Date().toISOString(),
          recordedBy: options.author.trim(),
        };
      } else if (options.decision || options.assessment) {
        throw new Error("The first delivery correction does not accept a continuation assessment.");
      }
      for (const id of findingIds) {
        if (
          !delivery.findings?.some((finding) => finding.id === id && finding.status === "confirmed")
        ) {
          throw new Error(`Delivery finding ${id} is not an actionable unresolved finding.`);
        }
      }
      const checkFailure = options.checkFailure?.trim();
      if (checkFailure) {
        const record = (delivery.checks?.records ?? [])
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
            `Delivery check failure '${checkFailure}' must be an explicitly recorded failed check for the current snapshot.`,
          );
        }
      }
      const number = attempts.length + 1;
      const requestedAt = new Date().toISOString();
      const assignment: ImplementationAssignment = {
        id: randomUUID(),
        role: "implementation",
        action: "correct",
        controller: options.author.trim(),
        attempt: number,
        findingIds,
        ...(checkFailure ? { checkFailure } : {}),
        objective,
        report: join(feature.workspace, "reports", `final-round-${number}-fix.md`),
        requestedAt,
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
        startedAt: requestedAt,
        startedBy: options.author.trim(),
        assignmentId: assignment.id,
        assignment,
        ...(delivery.assignment ? { priorAssignment: delivery.assignment } : {}),
        ...(checkFailure
          ? {
              checks: (delivery.checks?.records ?? []).filter(
                (record) =>
                  record.snapshot === identity.snapshot &&
                  record.codeSnapshot === identity.codeSnapshot &&
                  record.requirementsSnapshot === identity.requirementsSnapshot,
              ),
            }
          : {}),
      };
      if (attempts.length > 0 || delivery.adjudication?.status === "pending") {
        attempt.progressAssessment = {
          decision: "continue",
          result: "productive",
          details: options.assessment!.trim(),
          recordedAt: new Date().toISOString(),
          recordedBy: options.author.trim(),
        };
      }
      attempts.push(attempt);
      delivery.assignment = assignment;
      delivery.execution = "implementing";
      if (delivery.adjudication?.status === "pending") {
        delivery.adjudication.status = "resolved";
        delivery.adjudication.resolution = {
          details: options.assessment!.trim(),
          recordedAt: new Date().toISOString(),
          recordedBy: options.author.trim(),
        };
      }
      delivery.history.push({
        at: requestedAt,
        author: options.author.trim(),
        action: `correction-dispatched:${number}`,
      });
      this.workspaceTransaction.writeLedger(feature, ledger);
      return {
        scope: "delivery",
        execution: "implementing",
        attempt,
        assignment,
        ...(delivery.adjudication ? { adjudication: delivery.adjudication } : {}),
        ...identity,
      };
    });
  }
}
