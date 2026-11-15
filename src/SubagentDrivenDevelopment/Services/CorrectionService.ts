import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";

import matter from "gray-matter";

import type { Application } from "@/Foundation/Application";
import { Service } from "@/Foundation/Service";
import { GitEvidence } from "@/SubagentDrivenDevelopment/Evidence/GitEvidence";
import { ReportEvidence } from "@/SubagentDrivenDevelopment/Evidence/ReportEvidence";
import type {
  ImplementationAssignment,
  CorrectionAttempt,
  CorrectionAdjudication,
} from "@/SubagentDrivenDevelopment/Models/Assignments";
import type { CheckRecord } from "@/SubagentDrivenDevelopment/Models/Evidence";
import type { CorrectOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import type { ExecutionState } from "@/SubagentDrivenDevelopment/Models/Workflow";
import { FileSystem } from "@/SubagentDrivenDevelopment/Persistence/FileSystem";
import { LedgerRepository } from "@/SubagentDrivenDevelopment/Persistence/LedgerRepository";
import { TicketRepository } from "@/SubagentDrivenDevelopment/Persistence/TicketRepository";
import { WorkspaceTransaction } from "@/SubagentDrivenDevelopment/Persistence/WorkspaceTransaction";
import { InputValidation } from "@/SubagentDrivenDevelopment/Policies/InputValidation";
import { WorkflowPolicy } from "@/SubagentDrivenDevelopment/Policies/WorkflowPolicy";
import { ChecksService } from "@/SubagentDrivenDevelopment/Services/ChecksService";
import { DeliveryCorrectionService } from "@/SubagentDrivenDevelopment/Services/DeliveryCorrectionService";
import { FeatureInspectionService } from "@/SubagentDrivenDevelopment/Services/FeatureInspectionService";
import { CheckRecords } from "@/SubagentDrivenDevelopment/Support/CheckRecords";

export class CorrectionService extends Service {
  public constructor(
    app: Application,
    private readonly gitEvidence: GitEvidence,
    private readonly reportEvidence: ReportEvidence,
    private readonly ticketRepository: TicketRepository,
    private readonly ledgerRepository: LedgerRepository,
    private readonly workspaceTransaction: WorkspaceTransaction,
    private readonly workflowPolicy: WorkflowPolicy,
    private readonly deliveryCorrectionService: DeliveryCorrectionService,
    private readonly featureInspectionService: FeatureInspectionService,
    private readonly checksService: ChecksService,
  ) {
    super(app);
  }

  public correct(options: CorrectOptions): {
    ticket?: string;
    scope?: "delivery";
    execution: ExecutionState;
    attempt?: CorrectionAttempt;
    assignment?: ImplementationAssignment;
    paused?: boolean;
    adjudication?: CorrectionAdjudication;
    idempotent?: boolean;
    headSha: string;
  } {
    if (options.scope === "delivery") {
      if (options.ticket) throw new Error("--ticket and --scope delivery are mutually exclusive.");
      return this.deliveryCorrectionService.deliveryCorrect(options);
    }
    if (options.scope !== undefined) throw new Error("--scope must be 'delivery'.");
    if (!options.ticket) throw new Error("correct requires --ticket or --scope delivery.");
    InputValidation.validateTicketId(options.ticket);
    InputValidation.validateAuthor(options.author);
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
      if (options.assessment)
        throw new Error("--assessment is only valid with --decision continue.");
    } else if (options.reason) {
      throw new Error("--reason is only valid with --decision pause.");
    }
    if (options.decision === "continue" && !options.assessment?.trim()) {
      throw new Error("--assessment is required with --decision continue.");
    }

    const feature = this.featureInspectionService.resolveFeature(options.spec);
    return this.workspaceTransaction.run(feature.workspace, () => {
      const ledger = this.ledgerRepository.readLedger(feature);
      const ticket = this.ticketRepository.requireTicket(
        this.ticketRepository.readTickets(feature.workspace),
        options.ticket,
      );
      const progress = this.workflowPolicy.requireProgress(ledger, options.ticket);
      WorkflowPolicy.assertTicketOwner(
        progress.owner,
        options.author,
        feature.feature,
        options.ticket,
      );

      const attempts = (progress.correctionAttempts ??= []);
      if (options.decision === "pause") {
        if (progress.execution === "implementing" && progress.assignment?.status !== "submitted") {
          throw new Error("A pending implementation assignment must be resumed, not paused.");
        }
        const identity = this.gitEvidence.commitIdentity(feature, ticket, progress.baseSha);
        const hasCurrentFailure = CheckRecords.latestForHead(
          progress.checks?.records ?? [],
          identity.headSha,
        ).some((record) => record.result === "failed");
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
            ticket: options.ticket,
            execution: progress.execution,
            adjudication: progress.adjudication,
            paused: true,
            idempotent: true,
            ...identity,
          };
        }
        progress.adjudication = adjudication;
        const afterTicket = matter.stringify(
          this.ticketRepository.appendAudit(
            ticket.body,
            options.author,
            `Corrective work paused for adjudication (${adjudication.reason}): ${adjudication.details}.`,
          ),
          this.ticketRepository.metadata(ticket),
        );
        this.workspaceTransaction.writeWorkflowState(feature, ticket, afterTicket, ledger);
        return {
          ticket: options.ticket,
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
        const identity = this.gitEvidence.commitIdentity(feature, ticket, progress.baseSha);
        if (!progress.assignment.startingHeadSha) {
          progress.assignment.startingHeadSha = identity.headSha;
          current.assignment.startingHeadSha = identity.headSha;
          const afterTicket = matter.stringify(
            this.ticketRepository.appendAudit(
              ticket.body,
              options.author,
              `Starting commit recorded for existing correction assignment ${progress.assignment.id}.`,
            ),
            this.ticketRepository.metadata(ticket),
          );
          this.workspaceTransaction.writeWorkflowState(feature, ticket, afterTicket, ledger);
          return {
            ticket: options.ticket,
            execution: "implementing",
            attempt: current,
            assignment: progress.assignment,
            ...identity,
          };
        }
        return {
          ticket: options.ticket,
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
          `Ticket ${options.ticket} is paused for adjudication (${progress.adjudication?.reason}); resolve it before another correction.`,
        );
      }
      const checkDriven = !!options.checkFailure?.trim();
      const failedIntegration =
        progress.execution === "integrated" ? progress.integration : undefined;
      const postMergeChecks = failedIntegration?.postMerge?.checks;
      let failedPostMergeRecord: CheckRecord | undefined;
      if (failedIntegration && options.checkFailure?.trim()) {
        if (failedIntegration.postMerge?.status !== "pending" || !postMergeChecks) {
          throw new Error("Post-merge correction requires a pending failed validation.");
        }
        const latest = [...postMergeChecks.records]
          .reverse()
          .find((record) => record.command === options.checkFailure?.trim());
        if (!latest || latest.result !== "failed") {
          throw new Error(
            "Post-merge correction requires the latest result for that command to be failed.",
          );
        }
        const current = this.checksService.postMergeIdentity(feature, ledger, progress);
        if (latest.headSha !== current.headSha) {
          throw new Error(
            "Post-merge failure is stale; record current failure evidence before correction.",
          );
        }
        const workspace = this.gitEvidence.ticketWorkspace(progress);
        const mergeSha = failedIntegration.mergeSha;
        if (!workspace || !mergeSha || this.gitEvidence.headSha(workspace) !== mergeSha) {
          throw new Error(
            "Run sdd sync before dispatching post-merge correction; the ticket worktree must be at the failed feature merge.",
          );
        }
        const status = this.gitEvidence
          .gitBuffer(
            ["status", "--porcelain=v1", "--untracked-files=all", "--ignore-submodules=none"],
            workspace,
          )
          .toString("utf8");
        if (status)
          throw new Error(
            "Ticket worktree must be clean before post-merge correction; changes were preserved.",
          );
        for (const operation of [
          "MERGE_HEAD",
          "CHERRY_PICK_HEAD",
          "REVERT_HEAD",
          "rebase-merge",
          "rebase-apply",
          "sequencer",
        ]) {
          const path = this.gitEvidence
            .gitBuffer(["rev-parse", "--git-path", operation], workspace)
            .toString("utf8")
            .trim();
          if (FileSystem.lstatIfPresent(resolve(workspace, path)))
            throw new Error(
              `Ticket Git operation ${operation} must be resolved before correction.`,
            );
        }
        if (!progress.worktree)
          throw new Error("Post-merge correction requires an isolated ticket worktree.");
        const lastBaseline = progress.baselineHistory?.at(-1);
        if (
          progress.baseSha !== mergeSha ||
          progress.worktree.baseSha !== mergeSha ||
          lastBaseline?.to !== mergeSha ||
          lastBaseline?.ticketHead !== mergeSha
        ) {
          throw new Error(
            "Run sdd sync to record the failed feature merge as the ticket baseline.",
          );
        }
        this.checksService.assertPrerequisiteBaseline(ledger, progress, mergeSha);
        this.gitEvidence.assertTicketCodeCommitted(progress);
        failedPostMergeRecord = latest;
      }
      if (!checkDriven && progress.execution !== "changes-requested") {
        throw new Error(`Ticket ${options.ticket} must have a failed review before correction.`);
      }
      if (
        checkDriven &&
        !["reviewing", "changes-requested"].includes(progress.execution) &&
        !failedPostMergeRecord
      ) {
        throw new Error(
          `Ticket ${options.ticket} must have a submitted implementation before correction.`,
        );
      }
      if (!progress.baseSha)
        throw new Error("Correction requires the ticket's recorded Git baseline.");
      if (progress.assignment?.action === "correct" && progress.assignment.status !== "submitted") {
        throw new Error("The current correction assignment must be resumed, not replaced.");
      }
      let progressAssessment: CorrectionAttempt["progressAssessment"];
      if (attempts.length > 0 || pendingAdjudication) {
        if (options.decision !== "continue" || !options.assessment?.trim()) {
          throw new Error(
            "A subsequent correction requires --decision continue and an explicit --assessment.",
          );
        }
        progressAssessment = {
          decision: "continue",
          result: "productive",
          details: options.assessment.trim(),
          recordedAt: new Date().toISOString(),
          recordedBy: options.author.trim(),
        };
        // A pause before the first attempt leaves no previous attempt; the adjudication resolution records the assessment.
        const previous = attempts.at(-1);
        if (
          previous &&
          (previous.progressAssessment?.decision !== "continue" ||
            previous.progressAssessment.result !== "productive" ||
            previous.progressAssessment.recordedBy !== progressAssessment.recordedBy ||
            previous.progressAssessment.details !== progressAssessment.details)
        ) {
          previous.progressAssessment = { ...progressAssessment };
        }
      } else if (options.decision || options.assessment) {
        throw new Error("The first correction does not accept a continuation assessment.");
      }

      const identity = this.gitEvidence.commitIdentity(feature, ticket, progress.baseSha);
      const findings = progress.findings ?? [];
      for (const id of findingIds) {
        const finding = findings.find((candidate) => candidate.id === id);
        if (!finding || finding.status !== "confirmed") {
          throw new Error(`Finding ${id} is not an actionable unresolved finding.`);
        }
      }
      const checkFailure = options.checkFailure?.trim();
      if (checkFailure && !failedPostMergeRecord) {
        const record = progress.checks?.records
          .filter(
            (candidate) =>
              candidate.command === checkFailure && candidate.headSha === identity.headSha,
          )
          .at(-1);
        if (!record || record.result !== "failed") {
          throw new Error(
            `Check failure '${checkFailure}' must be an explicitly recorded failed check for the current commit.`,
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
        report: join(feature.workspace, "reports", `${options.ticket}-round-${number}-fix.md`),
        ...(progress.worktree
          ? { workspace: progress.worktree.workspace, branch: progress.worktree.branch }
          : {}),
        startingHeadSha: identity.headSha,
        requestedAt: new Date().toISOString(),
        status: "pending",
        handoffs: [],
      };
      this.reportEvidence.assertReportPath(feature, assignment.report, false);
      if (FileSystem.lstatIfPresent(assignment.report)) {
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
              checks: failedPostMergeRecord
                ? [failedPostMergeRecord]
                : (progress.checks?.records ?? []).filter(
                    (record) => record.headSha === identity.headSha,
                  ),
            }
          : {}),
      };
      if (progressAssessment) attempt.progressAssessment = { ...progressAssessment };
      attempts.push(attempt);
      if (failedPostMergeRecord && failedIntegration) {
        (progress.integrationHistory ??= []).push(failedIntegration);
        delete progress.integration;
      }
      progress.execution = "implementing";
      progress.assignment = assignment;
      if (pendingAdjudication && progress.adjudication && progressAssessment) {
        progress.adjudication.status = "resolved";
        progress.adjudication.resolution = {
          details: progressAssessment.details,
          recordedAt: progressAssessment.recordedAt,
          recordedBy: progressAssessment.recordedBy,
        };
      }
      const afterTicket = matter.stringify(
        this.ticketRepository.appendAudit(
          ticket.body,
          options.author,
          `Corrective attempt ${number} recorded; objective=${objective}; findings=${findingIds.join(",") || "none"}${checkFailure ? `; check-failure=${checkFailure}` : ""}; report=${assignment.report}. No agent was launched.`,
        ),
        this.ticketRepository.metadata(ticket),
      );
      this.workspaceTransaction.writeWorkflowState(feature, ticket, afterTicket, ledger);
      return {
        ticket: options.ticket,
        execution: "implementing",
        attempt,
        assignment,
        ...identity,
      };
    });
  }
}
