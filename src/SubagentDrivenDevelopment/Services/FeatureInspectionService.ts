import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

import type { Application } from "@/Foundation/Application";
import { Service } from "@/Foundation/Service";
import { GitEvidence } from "@/SubagentDrivenDevelopment/Evidence/GitEvidence";
import { ReportEvidence } from "@/SubagentDrivenDevelopment/Evidence/ReportEvidence";
import type {
  ImplementationAssignment,
  CorrectionAttempt,
  CorrectionAdjudication,
  ReviewAssignment,
  SpecialistReviewRequirement,
} from "@/SubagentDrivenDevelopment/Models/Assignments";
import type {
  CheckRequirement,
  CheckRecord,
  CommitIdentity,
} from "@/SubagentDrivenDevelopment/Models/Evidence";
import type {
  RequirementsDecision,
  ReviewFinding,
} from "@/SubagentDrivenDevelopment/Models/Findings";
import type { StatusOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import {
  FEATURE_DIRECTORY,
  HISTORICAL_DATE_DIRECTORY,
} from "@/SubagentDrivenDevelopment/Models/Workflow";
import type {
  ExecutionState,
  FeatureLedger,
  FeaturePaths,
  TicketDocument,
} from "@/SubagentDrivenDevelopment/Models/Workflow";
import { FeatureWorkspace } from "@/SubagentDrivenDevelopment/Persistence/FeatureWorkspace";
import { isPathInside } from "@/SubagentDrivenDevelopment/Persistence/FileSystem";
import { TicketRepository } from "@/SubagentDrivenDevelopment/Persistence/TicketRepository";
import { AssignmentPolicy } from "@/SubagentDrivenDevelopment/Policies/AssignmentPolicy";
import {
  CheckPolicy,
  hasOnlyUnavailableDeliveryCheckIssue,
} from "@/SubagentDrivenDevelopment/Policies/CheckPolicy";
import { FindingPolicy } from "@/SubagentDrivenDevelopment/Policies/FindingPolicy";
import { requiredDeliveryReviewers } from "@/SubagentDrivenDevelopment/Policies/RequiredReviewers";
import { ReviewPolicy } from "@/SubagentDrivenDevelopment/Policies/ReviewPolicy";

export class FeatureInspectionService extends Service {
  public constructor(
    app: Application,
    private readonly gitEvidence: GitEvidence,
    private readonly reportEvidence: ReportEvidence,
    private readonly featureWorkspace: FeatureWorkspace,
    private readonly ticketRepository: TicketRepository,
    private readonly assignmentPolicy: AssignmentPolicy,
    private readonly checkPolicy: CheckPolicy,
    private readonly findingPolicy: FindingPolicy,
    private readonly reviewPolicy: ReviewPolicy,
  ) {
    super(app);
  }

  public status({ spec }: StatusOptions): FeaturePaths & {
    state: FeatureLedger;
    commits: ({ ticket: string } & CommitIdentity)[];
    findings: { ticket: string; finding: ReviewFinding }[];
    requirementsDecisions: { ticket: string; decision: RequirementsDecision }[];
    actions: {
      ticket: string;
      action: string;
      checkFailure?: string;
      checkCommand?: string;
      continuationRequired?: boolean;
      adjudication?: CorrectionAdjudication;
      failedReviewAssignments?: {
        id: string;
        report: string;
        role: "review";
        findingIds: string[];
      }[];
    }[];
    pendingAssignments: {
      ticket: string;
      id: string;
      role: "implementation" | "review";
      action: "implement" | "correct" | "review";
      report: string;
      requestedAt: string;
      reportPresent: boolean;
      status: ImplementationAssignment["status"] | ReviewAssignment["status"];
      agent?: string;
      scope?: ReviewAssignment["scope"];
      objective?: string;
    }[];
    blockers: { ticket: string; reason: string }[];
    delivery: {
      scope: "delivery";
      status: "active" | "complete";
      execution: ExecutionState;
      action: string;
      headSha?: string;
      baseSha?: string;
      retrospectiveRequired: boolean;
      finished: boolean;
      findings: ReviewFinding[];
      correctionAttempts: CorrectionAttempt[];
      reviewRequirements: SpecialistReviewRequirement[];
      reviewAssignments: ReviewAssignment[];
      assignment?: ImplementationAssignment;
      adjudication?: CorrectionAdjudication;
      requiredChecks: CheckRequirement[];
      finalChecks: CheckRequirement[];
      checkRecords: CheckRecord[];
      blockers: string[];
    };
  } {
    const feature = this.resolvePaths(spec);
    const tickets = this.ticketRepository.readTickets(feature.workspace);
    this.ticketRepository.validateDependencyGraph(tickets);
    const byId = new Map(tickets.map((ticket) => [ticket.id, ticket]));
    const progressById = new Map(feature.state.tickets.map((item) => [item.id, item]));
    const actions: {
      ticket: string;
      action: string;
      checkFailure?: string;
      checkCommand?: string;
      continuationRequired?: boolean;
      adjudication?: CorrectionAdjudication;
      failedReviewAssignments?: {
        id: string;
        report: string;
        role: "review";
        findingIds: string[];
      }[];
    }[] = [];
    const commits: ({ ticket: string } & CommitIdentity)[] = [];
    const findings: { ticket: string; finding: ReviewFinding }[] = [];
    const requirementsDecisions: { ticket: string; decision: RequirementsDecision }[] = [];
    const pendingAssignments: {
      ticket: string;
      id: string;
      role: "implementation" | "review";
      action: "implement" | "correct" | "review";
      report: string;
      requestedAt: string;
      reportPresent: boolean;
      status: ImplementationAssignment["status"] | ReviewAssignment["status"];
      agent?: string;
      scope?: ReviewAssignment["scope"];
      objective?: string;
    }[] = [];
    const blockers: { ticket: string; reason: string }[] = [];

    for (const progress of feature.state.tickets) {
      const ticket = byId.get(progress.id);
      if (!ticket) {
        blockers.push({ ticket: progress.id, reason: "Ticket Markdown is missing." });
        continue;
      }
      let identity: CommitIdentity;
      try {
        identity = this.gitEvidence.commitIdentity(feature, ticket, progress.baseSha);
      } catch (error) {
        blockers.push({
          ticket: progress.id,
          reason: `Ticket evidence is unavailable: ${error instanceof Error ? error.message : String(error)}`,
        });
        continue;
      }
      commits.push({ ticket: progress.id, ...identity });
      if (ticket.status === "closed") {
        if (
          progress.execution === "integrated" &&
          progress.integration?.postMerge?.status === "passed"
        ) {
          continue;
        }
        blockers.push({
          ticket: progress.id,
          reason: "Ticket closure requires integrated changes and passing post-merge checks.",
        });
        continue;
      }
      for (const finding of progress.findings ?? []) {
        findings.push({ ticket: progress.id, finding });
      }
      for (const decision of progress.requirementsDecisions ?? []) {
        requirementsDecisions.push({ ticket: progress.id, decision });
        if (decision.status === "rejected" && decision.commitSha === identity.headSha) {
          blockers.push({
            ticket: progress.id,
            reason: `Requirements decision ${decision.id} was rejected; acceptance requires an approved decision and fresh review.`,
          });
        }
      }
      const checkBlockers = this.checkPolicy.checkBlockers(feature, ticket, progress, identity);
      for (const reason of checkBlockers) blockers.push({ ticket: progress.id, reason });
      for (const reason of this.findingPolicy.findingBlockers(
        feature,
        ticket,
        progress,
        identity,
      )) {
        blockers.push({ ticket: progress.id, reason });
      }
      if (progress.adjudication?.status === "pending") {
        const failedReviewAssignments = this.failedReviewAssignments(progress);
        blockers.push({
          ticket: progress.id,
          reason: `Correction is paused for adjudication (${progress.adjudication.reason}).`,
        });
        actions.push({
          ticket: progress.id,
          action: "adjudicate",
          continuationRequired: true,
          adjudication: progress.adjudication,
          ...(failedReviewAssignments.length > 0 ? { failedReviewAssignments } : {}),
        });
        actions.push(
          ...this.failedTicketChecks(progress, identity).map((checkFailure) => ({
            ticket: progress.id,
            action: "correct",
            checkFailure,
            continuationRequired: true,
          })),
        );
        continue;
      }
      if (progress.execution === "unstarted") {
        if (ticket.status !== "open" || ticket.blocker) {
          blockers.push({
            ticket: progress.id,
            reason: ticket.blocker ?? `Ticket status is ${ticket.status}.`,
          });
          continue;
        }
        const unmet = ticket.blocked_by.filter((dependency) => {
          const dependencyTicket = byId.get(dependency);
          const dependencyProgress = progressById.get(dependency);
          return (
            !dependencyTicket ||
            dependencyTicket.status !== "closed" ||
            !!dependencyTicket.blocker ||
            dependencyProgress?.status !== "closed" ||
            dependencyProgress.execution !== "integrated" ||
            dependencyProgress.integration?.postMerge?.status !== "passed"
          );
        });
        if (unmet.length > 0) {
          blockers.push({
            ticket: progress.id,
            reason: `Dependencies must be closed, integrated, and post-merge validated: ${unmet.join(", ")}.`,
          });
          continue;
        }
        actions.push({ ticket: progress.id, action: "implement" });
      } else if (progress.execution === "implementing") {
        if (progress.assignment) {
          if (["pending", "unavailable"].includes(progress.assignment.status)) {
            pendingAssignments.push({
              ticket: progress.id,
              id: progress.assignment.id,
              role: progress.assignment.role,
              action: progress.assignment.action,
              report: progress.assignment.report,
              requestedAt: progress.assignment.requestedAt,
              reportPresent: this.reportEvidence.reportExists(feature, progress.assignment.report),
              status: progress.assignment.status,
            });
          }
          if (progress.assignment.status === "submitted") {
            const reason = this.assignmentPolicy.implementationReportBlocker(
              feature,
              progress.assignment,
            );
            if (reason) blockers.push({ ticket: progress.id, reason });
            else if (checkBlockers.length === 0) {
              const requiredChecks =
                progress.checks?.required.filter((requirement) => !requirement.removedAt) ?? [];
              if (requiredChecks.length === 0)
                actions.push({ ticket: progress.id, action: "checks" });
              else actions.push({ ticket: progress.id, action: "review" });
            } else {
              actions.push(...this.ticketCheckActions(progress.id, progress, identity));
            }
          } else {
            actions.push({ ticket: progress.id, action: "await-implementation-report" });
          }
        } else {
          blockers.push({
            ticket: progress.id,
            reason: "Implementation is marked in progress without a recorded assignment.",
          });
        }
      } else if (progress.execution === "reviewing") {
        const reason = this.assignmentPolicy.implementationReportBlocker(
          feature,
          progress.assignment,
        );
        if (reason) {
          blockers.push({ ticket: progress.id, reason });
          continue;
        }
        const reviewCheckBlockers = this.checkPolicy.reviewCheckBlockers(
          feature,
          ticket,
          progress,
          identity,
        );
        for (const blocker of reviewCheckBlockers)
          blockers.push({ ticket: progress.id, reason: blocker });
        const latestAttempt = progress.correctionAttempts?.at(-1);
        const assignments =
          progress.assignment?.action === "correct"
            ? (latestAttempt?.reviewAssignments ?? [])
            : (progress.reviewAssignments ?? []);
        for (const assignment of assignments) {
          if (assignment.status === "pending") {
            pendingAssignments.push({
              ticket: progress.id,
              id: assignment.id,
              role: assignment.role,
              action: "review",
              report: assignment.report,
              requestedAt: assignment.requestedAt,
              reportPresent: this.reportEvidence.reportExists(feature, assignment.report),
              status: assignment.status,
              agent: assignment.agent,
              scope: assignment.scope,
              ...(assignment.objective ? { objective: assignment.objective } : {}),
            });
          }
          const assignmentBlocker = this.reviewPolicy.reviewAssignmentBlocker(
            feature,
            progress,
            assignment,
            identity,
          );
          if (assignmentBlocker) blockers.push({ ticket: progress.id, reason: assignmentBlocker });
        }
        if (reviewCheckBlockers.length === 0) {
          if (assignments.length === 0) actions.push({ ticket: progress.id, action: "review" });
          else if (assignments.some((assignment) => assignment.status === "pending")) {
            actions.push({ ticket: progress.id, action: "await-review-report" });
          } else if (
            assignments.every(
              (assignment) => assignment.status === "submitted" && assignment.result === "passed",
            ) &&
            assignments.every(
              (assignment) =>
                this.reviewPolicy.reviewAssignmentBlocker(
                  feature,
                  progress,
                  assignment,
                  identity,
                ) === undefined,
            )
          ) {
            actions.push({
              ticket: progress.id,
              action:
                this.findingPolicy.findingBlockers(feature, ticket, progress, identity).length > 0
                  ? "resolve-findings"
                  : "integrate",
            });
          }
        } else {
          actions.push(...this.ticketCheckActions(progress.id, progress, identity));
        }
      } else if (progress.execution === "changes-requested") {
        blockers.push({
          ticket: progress.id,
          reason: "A correction decision is required before another implementation dispatch.",
        });
        const actionableFindings = (progress.findings ?? []).some(
          (finding) =>
            finding.status === "confirmed" && !["fixed", "dismissed"].includes(finding.status),
        );
        const unresolvedFindings =
          this.findingPolicy.findingBlockers(feature, ticket, progress, identity).length > 0;
        const failedCheckCommands = this.failedTicketChecks(progress, identity);
        const failedReviewAssignments = this.failedReviewAssignments(progress);
        if (actionableFindings || failedCheckCommands.length > 0) {
          if (actionableFindings) {
            actions.push({
              ticket: progress.id,
              action: "correct",
              continuationRequired: (progress.correctionAttempts?.length ?? 0) > 0,
              ...(failedReviewAssignments.length > 0 ? { failedReviewAssignments } : {}),
            });
          }
          actions.push(
            ...failedCheckCommands.map((checkFailure) => ({
              ticket: progress.id,
              action: "correct",
              checkFailure,
              continuationRequired: (progress.correctionAttempts?.length ?? 0) > 0,
              ...(failedReviewAssignments.length > 0 ? { failedReviewAssignments } : {}),
            })),
          );
        } else {
          actions.push({
            ticket: progress.id,
            action: unresolvedFindings ? "adjudicate-findings" : "controller-correction-decision",
            ...(failedReviewAssignments.length > 0 ? { failedReviewAssignments } : {}),
          });
        }
      } else if (progress.execution === "blocked") {
        blockers.push({ ticket: progress.id, reason: "Ticket execution is blocked." });
      } else if (progress.execution === "integrated") {
        if (progress.integration?.postMerge?.status !== "passed") {
          const mergeSha = progress.integration?.mergeSha;
          const checks = progress.integration?.postMerge?.checks;
          const currentFeatureBase = this.gitEvidence.headBeforeWorkflowRecords(
            feature,
            feature.state,
          );
          const failedCommands =
            mergeSha && currentFeatureBase === mergeSha
              ? (checks?.required ?? []).flatMap((requirement) => {
                  const latest = [...(checks?.records ?? [])]
                    .reverse()
                    .find((record) => record.command === requirement.command);
                  return latest?.result === "failed" && latest.headSha === mergeSha
                    ? [requirement.command]
                    : [];
                })
              : [];
          if (failedCommands.length > 0) {
            const lastBaseline = progress.baselineHistory?.at(-1);
            const synchronized =
              progress.baseSha === mergeSha &&
              progress.worktree?.baseSha === mergeSha &&
              lastBaseline?.to === mergeSha &&
              lastBaseline?.ticketHead === mergeSha;
            if (synchronized) {
              actions.push(
                ...failedCommands.map((checkFailure) => ({
                  ticket: progress.id,
                  action: "post-merge-correct",
                  checkFailure,
                  continuationRequired: (progress.correctionAttempts?.length ?? 0) > 0,
                })),
              );
            } else {
              actions.push({ ticket: progress.id, action: "post-merge-sync" });
            }
          } else {
            actions.push(...this.postMergeCheckActions(progress.id, progress, mergeSha));
          }
        } else {
          blockers.push({
            ticket: progress.id,
            reason: "Post-merge checks passed but the ticket is not recorded closed.",
          });
        }
      }
    }
    for (const ticket of tickets) {
      if (!progressById.has(ticket.id)) {
        blockers.push({ ticket: ticket.id, reason: "Ticket has no ledger execution record." });
      }
    }
    const delivery = this.deliveryStatus(feature, feature.state, tickets);
    if (
      feature.state.delivery.assignment &&
      ["pending", "unavailable"].includes(feature.state.delivery.assignment.status)
    ) {
      const assignment = feature.state.delivery.assignment;
      pendingAssignments.push({
        ticket: "delivery",
        id: assignment.id,
        role: assignment.role,
        action: assignment.action,
        report: assignment.report,
        requestedAt: assignment.requestedAt,
        reportPresent: this.reportEvidence.reportExists(feature, assignment.report),
        status: assignment.status,
        scope: "delivery",
      });
    }
    for (const assignment of feature.state.delivery.reviewAssignments ?? []) {
      if (assignment.status !== "pending") continue;
      pendingAssignments.push({
        ticket: "delivery",
        id: assignment.id,
        role: assignment.role,
        action: "review",
        report: assignment.report,
        requestedAt: assignment.requestedAt,
        reportPresent: this.reportEvidence.reportExists(feature, assignment.report),
        status: assignment.status,
        agent: assignment.agent,
        scope: assignment.scope,
        ...(assignment.objective ? { objective: assignment.objective } : {}),
      });
    }

    return {
      ...feature,
      commits,
      findings,
      requirementsDecisions,
      actions,
      pendingAssignments,
      blockers,
      delivery,
    };
  }

  private ticketCheckActions(
    ticket: string,
    progress: FeatureLedger["tickets"][number],
    identity: CommitIdentity,
  ): {
    ticket: string;
    action: string;
    checkFailure?: string;
    checkCommand?: string;
    continuationRequired?: boolean;
  }[] {
    const requirements =
      progress.checks?.required.filter((requirement) => !requirement.removedAt) ?? [];
    if (requirements.length === 0) return [{ ticket, action: "checks" }];
    const failed = this.failedTicketChecks(progress, identity);
    if (failed.length > 0) {
      return failed.map((checkFailure) => ({
        ticket,
        action: "correct",
        checkFailure,
        continuationRequired: (progress.correctionAttempts?.length ?? 0) > 0,
      }));
    }
    const commands = requirements
      .filter((requirement) => {
        const current = (progress.checks?.records ?? [])
          .filter(
            (record) =>
              record.command === requirement.command && record.headSha === identity.headSha,
          )
          .at(-1);
        return current?.result !== "passed";
      })
      .map((requirement) => requirement.command);
    if (commands.length > 0) {
      return commands.map((checkCommand) => ({ ticket, action: "checks", checkCommand }));
    }
    return [];
  }

  private failedTicketChecks(
    progress: FeatureLedger["tickets"][number],
    identity: CommitIdentity,
  ): string[] {
    const required = new Set(
      progress.checks?.required
        .filter((requirement) => !requirement.removedAt)
        .map((requirement) => requirement.command) ?? [],
    );
    return [
      ...new Set(
        (progress.checks?.records ?? [])
          .filter(
            (record) =>
              required.has(record.command) &&
              record.headSha === identity.headSha &&
              record.result === "failed",
          )
          .map((record) => record.command),
      ),
    ];
  }

  private failedReviewAssignments(
    progress: FeatureLedger["tickets"][number],
  ): { id: string; report: string; role: "review"; findingIds: string[] }[] {
    const latestAttempt = progress.correctionAttempts?.at(-1);
    const assignments =
      progress.assignment?.action === "correct"
        ? (latestAttempt?.reviewAssignments ?? [])
        : (progress.reviewAssignments ?? []);
    return assignments
      .filter((assignment) => assignment.status === "submitted" && assignment.result === "failed")
      .map(({ id, report, findingIds }) => ({
        id,
        report,
        role: "review" as const,
        findingIds: findingIds ?? [],
      }));
  }

  private postMergeCheckActions(
    ticket: string,
    progress: FeatureLedger["tickets"][number],
    mergeSha: string | undefined,
  ): { ticket: string; action: string; checkCommand?: string }[] {
    const checks = progress.integration?.postMerge?.checks;
    const required = checks?.required.filter((requirement) => !requirement.removedAt) ?? [];
    if (required.length === 0) return [{ ticket, action: "post-merge-checks" }];
    return required.flatMap((requirement) => {
      const latest = (checks?.records ?? [])
        .filter((record) => record.command === requirement.command && record.headSha === mergeSha)
        .at(-1);
      return latest?.result === "passed"
        ? []
        : [{ ticket, action: "post-merge-checks", checkCommand: requirement.command }];
    });
  }

  public resolveFeature(spec: string): FeaturePaths {
    const absoluteSpec = isAbsolute(spec) ? relative(this.app.workspaceRoot, spec) : spec;
    return this.resolvePaths(absoluteSpec);
  }

  private resolvePaths(spec: string): FeaturePaths & { state: FeatureLedger } {
    this.assertApplicationBooted();
    if (!spec.trim()) throw new Error("Spec path must not be empty.");
    if (spec.includes("\\"))
      throw new Error("Spec path must use checkout-relative path separators.");
    const inputSegments = spec.startsWith("/") ? spec.slice(1).split("/") : spec.split("/");
    if (inputSegments.some((segment) => !segment || segment === "." || segment === "..")) {
      throw new Error("Spec path must not contain empty, current, or parent path segments.");
    }
    const root = realpathSync(this.app.workspaceRoot);
    const specPath = resolve(root, spec);
    if (!isPathInside(root, specPath)) throw new Error("Spec must be inside this checkout.");
    const relativeSpec = relative(root, specPath);
    const segments = relativeSpec.split(sep);
    if (
      segments.length !== 3 ||
      segments[0] !== ".scratch" ||
      segments[2] !== "spec.md" ||
      HISTORICAL_DATE_DIRECTORY.test(segments[1] ?? "") ||
      !FEATURE_DIRECTORY.test(segments[1] ?? "")
    ) {
      throw new Error("Spec must be spec.md in a numbered feature workspace under .scratch.");
    }
    return this.featureWorkspace.statusFromPaths(root, specPath, relativeSpec, segments);
  }

  public deliveryStatus(
    feature: FeaturePaths,
    ledger: FeatureLedger,
    tickets: TicketDocument[],
  ): {
    scope: "delivery";
    status: "active" | "complete";
    execution: ExecutionState;
    action: string;
    headSha?: string;
    baseSha?: string;
    retrospectiveRequired: boolean;
    finished: boolean;
    findings: ReviewFinding[];
    correctionAttempts: CorrectionAttempt[];
    reviewRequirements: SpecialistReviewRequirement[];
    reviewAssignments: ReviewAssignment[];
    assignment?: ImplementationAssignment;
    adjudication?: CorrectionAdjudication;
    requiredChecks: CheckRequirement[];
    finalChecks: CheckRequirement[];
    checkRecords: CheckRecord[];
    blockers: string[];
  } {
    const delivery = ledger.delivery;
    const blockers: string[] = [];
    const allClosed =
      ledger.tickets.length > 0 && ledger.tickets.every((ticket) => ticket.status === "closed");
    let identity: CommitIdentity | undefined;
    let deliveryFindingBlockers: string[] = [];
    if (!allClosed) {
      const missing = ledger.tickets
        .filter((ticket) => ticket.status !== "closed")
        .map((ticket) => ticket.id);
      blockers.push(`Tickets are not closed: ${missing.join(", ") || "feature has no tickets"}.`);
    } else {
      try {
        identity = this.gitEvidence.deliveryCommitIdentity(feature, ledger, tickets);
        blockers.push(
          ...this.checkPolicy.deliveryCheckBlockers(feature, tickets, delivery, identity),
        );
        if (delivery.adjudication?.status === "pending") {
          blockers.push(`Correction is paused for adjudication (${delivery.adjudication.reason}).`);
        }
        deliveryFindingBlockers = this.findingPolicy.deliveryFindingBlockers(
          feature,
          ledger,
          delivery,
          identity,
        );
        blockers.push(...deliveryFindingBlockers);
        const required = requiredDeliveryReviewers(ledger, delivery);
        const assignments = delivery.reviewAssignments ?? [];
        if (assignments.length !== required.length) {
          blockers.push("Aggregate review assignment batch is incomplete.");
        }
        for (const item of required) {
          const matching = assignments.filter(
            (assignment) =>
              assignment.agent === item.agent &&
              assignment.objective === item.details &&
              assignment.scope === "delivery",
          );
          if (matching.length !== 1) {
            blockers.push(
              `Required aggregate reviewer '${item.agent}' has no unique current assignment.`,
            );
            continue;
          }
          const assignment = matching[0]!;
          if (assignment.status !== "submitted" || assignment.result !== "passed") {
            blockers.push(
              `Required aggregate review '${item.agent}' is ${assignment.status === "pending" ? "pending" : (assignment.result ?? "incomplete")}.`,
            );
          } else {
            const reason = this.reviewPolicy.reviewAssignmentBlocker(
              feature,
              delivery,
              assignment,
              identity,
            );
            if (reason) blockers.push(reason);
          }
        }
      } catch (error) {
        blockers.push(error instanceof Error ? error.message : String(error));
      }
    }
    if (delivery.finished?.report || delivery.finished?.reportSha256) {
      try {
        if (
          !delivery.finished.report ||
          !delivery.finished.reportSha256 ||
          this.reportEvidence.readReportDigest(feature, delivery.finished.report) !==
            delivery.finished.reportSha256
        ) {
          blockers.push("Finished delivery retrospective evidence is stale or incomplete.");
        }
      } catch {
        blockers.push("Finished delivery retrospective evidence is unavailable or invalid.");
      }
    }
    const failedCheckRecords = identity
      ? (delivery.checks?.records ?? []).filter(
          (record) => record.headSha === identity.headSha && record.result === "failed",
        )
      : [];
    const actionableFindings = (delivery.findings ?? []).some(
      (finding) =>
        finding.status === "confirmed" && !["fixed", "dismissed"].includes(finding.status),
    );
    let action: string;
    if (delivery.finished) action = blockers.length > 0 ? "completion-invalidated" : "finished";
    else if (!allClosed) action = "close-tickets";
    else if (!delivery.owner) action = "claim";
    else if (delivery.adjudication?.status === "pending") action = "adjudicate";
    else if (
      delivery.assignment &&
      ["pending", "unavailable"].includes(delivery.assignment.status)
    ) {
      action = "await-implementation-report";
    } else if (
      (delivery.execution === "changes-requested" &&
        (!identity || !hasOnlyUnavailableDeliveryCheckIssue(delivery, identity.headSha))) ||
      failedCheckRecords.length > 0
    ) {
      if (actionableFindings || failedCheckRecords.length > 0) action = "correct";
      else if (deliveryFindingBlockers.length > 0) action = "adjudicate-findings";
      else action = "controller-correction-decision";
    } else if (
      this.checkPolicy.deliveryCheckBlockers(
        feature,
        tickets,
        delivery,
        identity ?? { headSha: "" },
      ).length > 0
    ) {
      action = "record-final-checks";
    } else if (
      (delivery.reviewAssignments ?? []).some((assignment) => assignment.status === "pending")
    ) {
      action = "await-review-report";
    } else if (
      !(delivery.reviewAssignments ?? []).length ||
      blockers.some((reason) => /aggregate review|reviewer|Review assignment/i.test(reason))
    ) {
      action = "review";
    } else if (
      this.findingPolicy.deliveryFindingBlockers(
        feature,
        ledger,
        delivery,
        identity ?? { headSha: "" },
      ).length > 0
    ) {
      action = "correct";
    } else if (blockers.length > 0) action = "review";
    else if (!(delivery.finalChecks ?? []).length) action = "require-final-checks";
    else action = "finish";
    return {
      scope: "delivery",
      status: delivery.status ?? (delivery.finished ? "complete" : "active"),
      execution: delivery.execution,
      action,
      ...identity,
      ...(delivery.baseSha ? { baseSha: delivery.baseSha } : {}),
      retrospectiveRequired: ledger.retrospectiveRequired,
      finished: !!delivery.finished,
      findings: delivery.findings ?? [],
      correctionAttempts: delivery.correctionAttempts ?? [],
      reviewRequirements: delivery.reviewRequirements ?? [],
      reviewAssignments: delivery.reviewAssignments ?? [],
      ...(delivery.assignment ? { assignment: delivery.assignment } : {}),
      ...(delivery.adjudication ? { adjudication: delivery.adjudication } : {}),
      requiredChecks: (delivery.checks?.required ?? []).filter((check) => !check.removedAt),
      finalChecks: delivery.finalChecks ?? [],
      checkRecords: delivery.checks?.records ?? [],
      blockers,
    };
  }
}
