import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { isAbsolute, join } from "node:path";

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
import { LedgerRepository } from "@/SubagentDrivenDevelopment/Persistence/LedgerRepository";
import { TicketRepository } from "@/SubagentDrivenDevelopment/Persistence/TicketRepository";
import { WorkspaceTransaction } from "@/SubagentDrivenDevelopment/Persistence/WorkspaceTransaction";
import { AssignmentPolicy } from "@/SubagentDrivenDevelopment/Policies/AssignmentPolicy";
import { CheckPolicy } from "@/SubagentDrivenDevelopment/Policies/CheckPolicy";
import {
  validateAuthor,
  validateTicketId,
} from "@/SubagentDrivenDevelopment/Policies/InputValidation";
import { ReviewPolicy } from "@/SubagentDrivenDevelopment/Policies/ReviewPolicy";
import { WorkflowPolicy } from "@/SubagentDrivenDevelopment/Policies/WorkflowPolicy";
import { FeatureInspectionService } from "@/SubagentDrivenDevelopment/Services/FeatureInspectionService";
import { TicketWorktreeService } from "@/SubagentDrivenDevelopment/Services/TicketWorktreeService";

export class AssignmentService extends Service {
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
    private readonly ticketWorktreeService: TicketWorktreeService,
  ) {
    super(app);
  }

  public claim(options: ClaimOptions): {
    ticket: string;
    execution: "claimed";
    owner: string;
    baseSha: string;
    snapshot: string;
    codeSnapshot: string;
    requirementsSnapshot: string;
    headSha: string;
  } {
    validateTicketId(options.ticket);
    validateAuthor(options.author);
    const feature = this.featureInspectionService.resolveFeature(options.spec);
    return this.workspaceTransaction.run(feature.workspace, () => {
      const ledger = this.ledgerRepository.readLedger(feature);
      const tickets = this.ticketRepository.readTickets(feature.workspace);
      this.ticketRepository.validateDependencyGraph(tickets);
      const ticket = this.ticketRepository.requireTicket(tickets, options.ticket);
      const progress = this.workflowPolicy.requireProgress(ledger, options.ticket);
      if (progress.execution !== "unstarted") {
        throw new Error(
          `Ticket ${options.ticket} is already owned or has progressed to ${progress.execution}.`,
        );
      }
      if (ticket.status !== "open" || ticket.blocker) {
        throw new Error(`Ticket ${options.ticket} is not open and unblocked.`);
      }
      const ticketsById = new Map(tickets.map((item) => [item.id, item]));
      const unmet = ticket.blocked_by.filter((dependency) => {
        const dependencyTicket = ticketsById.get(dependency);
        return (
          !dependencyTicket || dependencyTicket.status !== "closed" || !!dependencyTicket.blocker
        );
      });
      if (unmet.length > 0) {
        throw new Error(`Ticket ${options.ticket} has open dependencies: ${unmet.join(", ")}.`);
      }
      if (ticket.blocked_by.length > 0) {
        throw new Error(
          "Dependent ticket worktrees require post-merge prerequisite validation, which is not yet available.",
        );
      }
      const baseSha = this.gitEvidence.cleanGitBaseline(feature);
      progress.execution = "claimed";
      progress.status = "in-progress";
      progress.owner = options.author.trim();
      progress.baseSha = baseSha;
      ledger.delivery.baseSha ??= baseSha;
      const identity = this.gitEvidence.contentIdentity(feature, ticket, baseSha, progress.checks);
      const afterTicket = matter.stringify(
        this.ticketRepository.appendAudit(
          ticket.body,
          options.author,
          `Claimed from clean Git baseline ${baseSha}.`,
        ),
        this.ticketRepository.metadata(ticket),
      );
      this.workspaceTransaction.writeWorkflowState(feature, ticket, afterTicket, ledger);
      return {
        ticket: options.ticket,
        execution: "claimed",
        owner: options.author.trim(),
        baseSha,
        ...identity,
      };
    });
  }

  public implement(options: ImplementOptions): {
    ticket: string;
    execution: "implementing";
    assignment: ImplementationAssignment;
    snapshot: string;
    codeSnapshot: string;
    requirementsSnapshot: string;
    headSha: string;
  } {
    validateTicketId(options.ticket);
    validateAuthor(options.author);
    const feature = this.featureInspectionService.resolveFeature(options.spec);
    return this.workspaceTransaction.run(feature.workspace, () => {
      const ledger = this.ledgerRepository.readLedger(feature);
      const ticket = this.ticketRepository.requireTicket(
        this.ticketRepository.readTickets(feature.workspace),
        options.ticket,
      );
      const progress = this.workflowPolicy.requireProgress(ledger, options.ticket);
      if (progress.execution === "implementing" && progress.assignment) {
        if (progress.owner !== options.author.trim()) {
          throw new Error("Controller ownership changed; resume and confirm the handoff first.");
        }
        if (
          !progress.worktree ||
          !options.workspace ||
          !isAbsolute(options.workspace) ||
          join(realpathSync(options.workspace), `${feature.feature}-${options.ticket}`) !==
            progress.worktree.workspace
        ) {
          throw new Error(
            "Resume implementation using the originally assigned --workspace directory.",
          );
        }
        return {
          ticket: options.ticket,
          execution: "implementing",
          assignment: progress.assignment,
          ...this.gitEvidence.contentIdentity(feature, ticket, progress.baseSha, progress.checks),
        };
      }
      if (progress.execution !== "claimed" || !progress.baseSha || !progress.owner) {
        throw new Error(`Ticket ${options.ticket} must be claimed before implementation dispatch.`);
      }
      if (progress.owner !== options.author.trim()) {
        throw new Error("Only the recorded controller may dispatch implementation.");
      }
      if (progress.worktree) {
        throw new Error(
          "Ticket already has a recorded worktree; preserve and inspect it before continuing.",
        );
      }
      if (ticket.blocked_by.length > 0) {
        throw new Error(
          "Dependent ticket worktrees require post-merge prerequisite validation, which is not yet available.",
        );
      }

      const report = join(feature.workspace, "reports", `${options.ticket}-implementation.md`);
      this.reportEvidence.assertReportPath(feature, report, false);
      if (lstatIfPresent(report)) {
        throw new Error(`Assigned report already exists and was preserved: ${report}.`);
      }
      const worktree = this.ticketWorktreeService.create(feature, progress, options.workspace);
      const assignment: ImplementationAssignment = {
        id: randomUUID(),
        role: "implementation",
        action: "implement",
        controller: options.author.trim(),
        report,
        workspace: worktree.workspace,
        branch: worktree.branch,
        requestedAt: new Date().toISOString(),
        status: "pending",
        handoffs: [],
      };
      progress.execution = "implementing";
      progress.assignment = assignment;
      progress.baseSha = worktree.baseSha;
      progress.worktree = {
        workspace: worktree.workspace,
        branch: worktree.branch,
        baseSha: worktree.baseSha,
      };
      const afterTicket = matter.stringify(
        this.ticketRepository.appendAudit(
          ticket.body,
          options.author,
          `Implementation assignment ${assignment.id} recorded; role=implementation; report=${report}. No agent was launched.`,
        ),
        this.ticketRepository.metadata(ticket),
      );
      try {
        this.workspaceTransaction.writeWorkflowState(feature, ticket, afterTicket, ledger);
      } catch (error) {
        throw new Error(
          `Assignment recording failed; preserve and inspect ${worktree.journal}. ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return {
        ticket: options.ticket,
        execution: "implementing",
        assignment,
        ...this.gitEvidence.contentIdentity(feature, ticket, progress.baseSha, progress.checks),
      };
    });
  }

  public resume(options: ResumeOptions): {
    ticket?: string;
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
      if (options.ticket) throw new Error("--ticket and --scope delivery are mutually exclusive.");
      return this.deliveryResume(options);
    }
    if (options.scope !== undefined) throw new Error("--scope must be 'delivery'.");
    if (!options.ticket) throw new Error("resume requires --ticket or --scope delivery.");
    validateTicketId(options.ticket);
    validateAuthor(options.author);
    const feature = this.featureInspectionService.resolveFeature(options.spec);
    return this.workspaceTransaction.run(feature.workspace, () => {
      const ledger = this.ledgerRepository.readLedger(feature);
      const ticket = this.ticketRepository.requireTicket(
        this.ticketRepository.readTickets(feature.workspace),
        options.ticket,
      );
      const progress = this.workflowPolicy.requireProgress(ledger, options.ticket);
      this.gitEvidence.ticketWorkspace(progress);
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
        const afterTicket = matter.stringify(
          this.ticketRepository.appendAudit(
            ticket.body,
            options.author,
            `Controller handoff from ${previousOwner} to ${options.author.trim()} confirmed after the previous controller stopped editing.`,
          ),
          this.ticketRepository.metadata(ticket),
        );
        this.workspaceTransaction.writeWorkflowState(feature, ticket, afterTicket, ledger);
        handoffRecorded = true;
      }
      const currentTicket = this.ticketRepository.requireTicket(
        this.ticketRepository.readTickets(feature.workspace),
        options.ticket,
      );
      const identity = this.gitEvidence.contentIdentity(
        feature,
        currentTicket,
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
        this.checkPolicy.checkBlockers(feature, currentTicket, progress, identity)[0];
      return {
        ticket: options.ticket,
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
      const tickets = this.ticketRepository.readTickets(feature.workspace);
      const identity = this.gitEvidence.deliveryIdentity(feature, ledger, tickets);
      const completion = delivery.finished
        ? this.featureInspectionService.deliveryStatus(feature, ledger, tickets)
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
