import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";

import type { Application } from "@spindle/Foundation/Application";
import { Service } from "@spindle/Foundation/Service";
import { GitEvidence } from "@spindle/SubagentDrivenDevelopment/Evidence/GitEvidence";
import { ReportEvidence } from "@spindle/SubagentDrivenDevelopment/Evidence/ReportEvidence";
import type {
  ApprovedTaskPlanException,
  ImplementationAssignment,
  CorrectionAttempt,
  CorrectionAdjudication,
} from "@spindle/SubagentDrivenDevelopment/Models/Assignments";
import { APPROVED_TASK_PLAN_EXCEPTION } from "@spindle/SubagentDrivenDevelopment/Models/Assignments";
import type { CheckRecord } from "@spindle/SubagentDrivenDevelopment/Models/Evidence";
import type { CorrectOptions } from "@spindle/SubagentDrivenDevelopment/Models/Options";
import type {
  ExecutionState,
  FeatureLedger,
  FeaturePaths,
  TicketDocument,
  TicketProgress,
} from "@spindle/SubagentDrivenDevelopment/Models/Workflow";
import { FileSystem } from "@spindle/SubagentDrivenDevelopment/Persistence/FileSystem";
import { LedgerRepository } from "@spindle/SubagentDrivenDevelopment/Persistence/LedgerRepository";
import { TicketRepository } from "@spindle/SubagentDrivenDevelopment/Persistence/TicketRepository";
import { WorkspaceTransaction } from "@spindle/SubagentDrivenDevelopment/Persistence/WorkspaceTransaction";
import { InputValidation } from "@spindle/SubagentDrivenDevelopment/Policies/InputValidation";
import { TaskPlanPolicy } from "@spindle/SubagentDrivenDevelopment/Policies/TaskPlanPolicy";
import { WorkflowPolicy } from "@spindle/SubagentDrivenDevelopment/Policies/WorkflowPolicy";
import { ChecksService } from "@spindle/SubagentDrivenDevelopment/Services/ChecksService";
import { DeliveryCorrectionService } from "@spindle/SubagentDrivenDevelopment/Services/DeliveryCorrectionService";
import { FeatureInspectionService } from "@spindle/SubagentDrivenDevelopment/Services/FeatureInspectionService";
import { CheckRecords } from "@spindle/SubagentDrivenDevelopment/Support/CheckRecords";
import matter from "gray-matter";

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
    taskPlanException?: ApprovedTaskPlanException;
    idempotent?: boolean;
    headSha: string;
  } {
    if (options.approvedException && options.scope) {
      throw new Error("--approved-exception is only valid for a ticket correction.");
    }
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
    if (
      options.approvedException &&
      (findingIds.length > 0 ||
        options.checkFailure?.trim() ||
        options.decision !== undefined ||
        options.assessment !== undefined ||
        options.reason !== undefined)
    ) {
      throw new Error(
        "--approved-exception cannot be combined with findings, check failures, or adjudication options.",
      );
    }
    if (options.decision !== undefined && !["continue", "pause"].includes(options.decision)) {
      throw new Error("--decision must be 'continue' or 'pause'.");
    }
    if (
      !options.approvedException &&
      options.decision !== "pause" &&
      findingIds.length === 0 &&
      !options.checkFailure?.trim()
    ) {
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
      if (progress.taskPlanException && !options.approvedException) {
        throw new Error(
          "The approved task-plan exception permits one corrective cycle only; no further correction may be dispatched.",
        );
      }
      if (options.approvedException) {
        if (progress.taskPlanException) {
          return this.resumeApprovedTaskPlanException(
            options,
            feature,
            ticket,
            progress,
            attempts,
            objective,
          );
        }
        return this.createApprovedTaskPlanException(
          options,
          feature,
          ledger,
          ticket,
          progress,
          attempts,
        );
      }
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
        const operations = [
          "MERGE_HEAD",
          "CHERRY_PICK_HEAD",
          "REVERT_HEAD",
          "rebase-merge",
          "rebase-apply",
          "sequencer",
        ];
        const paths = this.gitEvidence.gitPaths(workspace, operations);
        for (const [index, operation] of operations.entries()) {
          if (FileSystem.lstatIfPresent(resolve(workspace, paths[index])))
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

  private resumeApprovedTaskPlanException(
    options: CorrectOptions,
    feature: FeaturePaths,
    ticket: TicketDocument,
    progress: TicketProgress,
    attempts: CorrectionAttempt[],
    objective: string,
  ): {
    ticket: string;
    execution: "implementing";
    attempt: CorrectionAttempt;
    assignment: ImplementationAssignment;
    taskPlanException: ApprovedTaskPlanException;
    idempotent: true;
    headSha: string;
  } {
    const exception = progress.taskPlanException!;
    const assignment = progress.assignment;
    const attempt = attempts.at(-1);
    if (
      options.ticket !== exception.ticket ||
      exception.feature !== feature.feature ||
      exception.controller !== options.author.trim() ||
      exception.objective !== objective ||
      progress.execution !== "implementing" ||
      !assignment ||
      !["pending", "unavailable"].includes(assignment.status) ||
      assignment.action !== "correct" ||
      assignment.approvedExceptionId !== exception.id ||
      assignment.id !== exception.assignmentId ||
      !attempt ||
      attempt.number !== exception.attempt ||
      attempt.assignmentId !== assignment.id ||
      attempt.approvedExceptionId !== exception.id
    ) {
      throw new Error("The approved task-plan exception has already been used.");
    }
    const identity = this.gitEvidence.commitIdentity(feature, ticket, progress.baseSha);
    return {
      ticket: options.ticket,
      execution: "implementing",
      attempt,
      assignment,
      taskPlanException: exception,
      idempotent: true,
      ...identity,
    };
  }

  private createApprovedTaskPlanException(
    options: CorrectOptions,
    feature: FeaturePaths,
    ledger: FeatureLedger,
    ticket: TicketDocument,
    progress: TicketProgress,
    attempts: CorrectionAttempt[],
  ): {
    ticket: string;
    execution: "implementing";
    attempt: CorrectionAttempt;
    assignment: ImplementationAssignment;
    taskPlanException: ApprovedTaskPlanException;
    headSha: string;
  } {
    const specification = APPROVED_TASK_PLAN_EXCEPTION;
    if (feature.feature !== specification.feature || options.ticket !== specification.ticket) {
      throw new Error(
        `--approved-exception is limited to ${specification.feature}/${specification.ticket}.`,
      );
    }
    const candidate = TaskPlanPolicy.approvedExceptionCandidate(feature.feature, ledger);
    if (
      !candidate ||
      candidate !== progress ||
      ticket.status !== "open" ||
      progress.status !== "open" ||
      progress.execution !== "integrated" ||
      progress.tasks.length !== 0 ||
      !progress.integration ||
      progress.integration.postMerge?.status !== "pending" ||
      !progress.integration.mergeSha ||
      progress.integration.postMerge.mergeSha !== progress.integration.mergeSha ||
      !progress.acceptedEvidence ||
      progress.acceptedEvidence.commitSha !== progress.integration.commitSha ||
      progress.assignment?.status !== "submitted" ||
      progress.assignment.controller !== options.author.trim() ||
      !progress.worktree ||
      !progress.baseSha
    ) {
      throw new Error(
        "The approved exception requires the current open, integrated, taskless T-0004 state and a closed, post-merge-validated T-0005.",
      );
    }
    const recoveryTicket = this.ticketRepository.requireTicket(
      this.ticketRepository.readTickets(feature.workspace),
      specification.recoveryTicket,
    );
    if (
      recoveryTicket.status !== "closed" ||
      !recoveryTicket.body.includes(specification.approvalComment)
    ) {
      throw new Error(
        "The exact recorded user approval and closed T-0005 recovery ticket are required.",
      );
    }

    const identity = this.gitEvidence.commitIdentity(feature, ticket, progress.baseSha);
    const workspace = this.gitEvidence.ticketWorkspace(progress);
    if (
      !workspace ||
      identity.headSha !== progress.integration.commitSha ||
      this.gitEvidence.headSha(workspace) !== progress.integration.commitSha
    ) {
      throw new Error("The previously integrated T-0004 implementation is not current.");
    }
    const dirty = this.gitEvidence
      .gitBuffer(
        ["status", "--porcelain=v1", "--untracked-files=all", "--ignore-submodules=none"],
        workspace,
      )
      .toString("utf8");
    if (dirty) {
      throw new Error("The T-0004 ticket worktree must be clean; existing changes were preserved.");
    }
    this.gitEvidence.assertTicketCodeCommitted(progress);

    const number = attempts.length + 1;
    const assignmentId = randomUUID();
    const exceptionId = randomUUID();
    const requestedAt = new Date().toISOString();
    const objective = options.details.trim();
    const priorIntegration = structuredClone(progress.integration);
    const priorAcceptedEvidence = structuredClone(progress.acceptedEvidence);
    const assignment: ImplementationAssignment = {
      id: assignmentId,
      role: "implementation",
      action: "correct",
      controller: options.author.trim(),
      attempt: number,
      findingIds: [],
      objective,
      approvedExceptionId: exceptionId,
      report: join(feature.workspace, "reports", `${options.ticket}-round-${number}-fix.md`),
      workspace: progress.worktree.workspace,
      branch: progress.worktree.branch,
      startingHeadSha: identity.headSha,
      requestedAt,
      status: "pending",
      handoffs: [],
    };
    this.reportEvidence.assertReportPath(feature, assignment.report, false);
    if (FileSystem.lstatIfPresent(assignment.report)) {
      throw new Error(`Assigned report already exists and was preserved: ${assignment.report}.`);
    }
    const taskPlanException: ApprovedTaskPlanException = {
      id: exceptionId,
      feature: specification.feature,
      ticket: specification.ticket,
      recoveryTicket: specification.recoveryTicket,
      scope: specification.scope,
      approval: {
        author: specification.approvalAuthor,
        date: specification.approvalDate,
        commentAt: specification.approvalCommentAt,
        quote: specification.approvalQuote,
        comment: specification.approvalComment,
        source: specification.approvalSource,
      },
      controller: options.author.trim(),
      recordedAt: requestedAt,
      objective,
      assignmentId,
      attempt: number,
      priorIntegration,
      priorAcceptedEvidence,
    };
    const attempt: CorrectionAttempt = {
      number,
      findingIds: [],
      objective,
      approvedExceptionId: exceptionId,
      startedAt: requestedAt,
      startedBy: options.author.trim(),
      assignmentId,
      assignment,
      ...(progress.assignment ? { priorAssignment: progress.assignment } : {}),
    };
    attempts.push(attempt);
    (progress.integrationHistory ??= []).push(priorIntegration);
    delete progress.integration;
    progress.taskPlanException = taskPlanException;
    progress.execution = "implementing";
    progress.assignment = assignment;
    const afterTicket = matter.stringify(
      this.ticketRepository.appendAudit(
        ticket.body,
        options.author,
        `Approved task-plan exception ${exceptionId} recorded for one corrective cycle; recovery-ticket=${specification.recoveryTicket}; objective=${objective}; assignment=${assignmentId}; report=${assignment.report}. No tasks, findings, or failed checks were claimed. No agent was launched.`,
      ),
      this.ticketRepository.metadata(ticket),
    );
    this.workspaceTransaction.writeWorkflowState(feature, ticket, afterTicket, ledger);
    return {
      ticket: options.ticket,
      execution: "implementing",
      attempt,
      assignment,
      taskPlanException,
      ...identity,
    };
  }
}
