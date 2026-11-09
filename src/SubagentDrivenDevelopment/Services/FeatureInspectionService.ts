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
  ContentIdentity,
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
  IssueDocument,
} from "@/SubagentDrivenDevelopment/Models/Workflow";
import { FeatureWorkspace } from "@/SubagentDrivenDevelopment/Persistence/FeatureWorkspace";
import { isPathInside } from "@/SubagentDrivenDevelopment/Persistence/FileSystem";
import { IssueRepository } from "@/SubagentDrivenDevelopment/Persistence/IssueRepository";
import { AcceptancePolicy } from "@/SubagentDrivenDevelopment/Policies/AcceptancePolicy";
import { AssignmentPolicy } from "@/SubagentDrivenDevelopment/Policies/AssignmentPolicy";
import { CheckPolicy } from "@/SubagentDrivenDevelopment/Policies/CheckPolicy";
import { FindingPolicy } from "@/SubagentDrivenDevelopment/Policies/FindingPolicy";
import { requiredDeliveryReviewers } from "@/SubagentDrivenDevelopment/Policies/RequiredReviewers";
import { ReviewPolicy } from "@/SubagentDrivenDevelopment/Policies/ReviewPolicy";

export class FeatureInspectionService extends Service {
  public constructor(
    app: Application,
    private readonly gitEvidence: GitEvidence,
    private readonly reportEvidence: ReportEvidence,
    private readonly featureWorkspace: FeatureWorkspace,
    private readonly issueRepository: IssueRepository,
    private readonly acceptancePolicy: AcceptancePolicy,
    private readonly assignmentPolicy: AssignmentPolicy,
    private readonly checkPolicy: CheckPolicy,
    private readonly findingPolicy: FindingPolicy,
    private readonly reviewPolicy: ReviewPolicy,
  ) {
    super(app);
  }

  public status({ spec }: StatusOptions): FeaturePaths & {
    state: FeatureLedger;
    snapshots: ({ issue: string } & ContentIdentity)[];
    findings: { issue: string; finding: ReviewFinding }[];
    requirementsDecisions: { issue: string; decision: RequirementsDecision }[];
    actions: { issue: string; action: string }[];
    pendingAssignments: {
      issue: string;
      id: string;
      role: "implementation" | "review";
      action: "implement" | "correct" | "review";
      report: string;
      status: ImplementationAssignment["status"] | ReviewAssignment["status"];
      agent?: string;
      scope?: ReviewAssignment["scope"];
      objective?: string;
    }[];
    blockers: { issue: string; reason: string }[];
    delivery: {
      scope: "delivery";
      status: "active" | "complete";
      execution: ExecutionState;
      action: string;
      snapshot?: string;
      codeSnapshot?: string;
      requirementsSnapshot?: string;
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
      checkRecords: CheckRecord[];
      blockers: string[];
    };
  } {
    const feature = this.resolvePaths(spec);
    const issues = this.issueRepository.readIssues(feature.workspace);
    this.issueRepository.validateDependencyGraph(issues);
    const byId = new Map(issues.map((issue) => [issue.id, issue]));
    const progressById = new Map(feature.state.issues.map((item) => [item.id, item]));
    let checkoutChanges: string | undefined;
    try {
      checkoutChanges = this.gitEvidence.gitChangeSummary(feature);
    } catch {
      checkoutChanges = undefined;
    }
    const actions: { issue: string; action: string }[] = [];
    const snapshots: ({ issue: string } & ContentIdentity)[] = [];
    const findings: { issue: string; finding: ReviewFinding }[] = [];
    const requirementsDecisions: { issue: string; decision: RequirementsDecision }[] = [];
    const pendingAssignments: {
      issue: string;
      id: string;
      role: "implementation" | "review";
      action: "implement" | "correct" | "review";
      report: string;
      status: ImplementationAssignment["status"] | ReviewAssignment["status"];
      agent?: string;
      scope?: ReviewAssignment["scope"];
      objective?: string;
    }[] = [];
    const blockers: { issue: string; reason: string }[] = [];

    for (const progress of feature.state.issues) {
      const issue = byId.get(progress.id);
      if (!issue) {
        blockers.push({ issue: progress.id, reason: "Issue Markdown is missing." });
        continue;
      }
      const identity = this.gitEvidence.contentIdentity(
        feature,
        issue,
        progress.baseSha,
        progress.checks,
      );
      snapshots.push({ issue: progress.id, ...identity });
      if (issue.status === "closed") continue;
      for (const finding of progress.findings ?? []) {
        findings.push({ issue: progress.id, finding });
      }
      for (const decision of progress.requirementsDecisions ?? []) {
        requirementsDecisions.push({ issue: progress.id, decision });
        if (
          decision.status === "rejected" &&
          decision.requirementsSnapshot === identity.requirementsSnapshot
        ) {
          blockers.push({
            issue: progress.id,
            reason: `Requirements decision ${decision.id} was rejected; acceptance requires an approved decision and fresh review.`,
          });
        }
      }
      const checkBlockers = this.checkPolicy.checkBlockers(feature, issue, progress, identity);
      for (const reason of checkBlockers) blockers.push({ issue: progress.id, reason });
      for (const reason of this.findingPolicy.findingBlockers(progress, identity)) {
        blockers.push({ issue: progress.id, reason });
      }
      if (progress.adjudication?.status === "pending") {
        blockers.push({
          issue: progress.id,
          reason: `Correction is paused for adjudication (${progress.adjudication.reason}).`,
        });
        actions.push({ issue: progress.id, action: "adjudicate" });
        continue;
      }
      if (progress.execution === "unstarted") {
        if (issue.status !== "open" || issue.blocker) {
          blockers.push({
            issue: progress.id,
            reason: issue.blocker ?? `Issue status is ${issue.status}.`,
          });
          continue;
        }
        const unmet = issue.blocked_by.filter((dependency) => {
          const dependencyIssue = byId.get(dependency);
          return (
            !dependencyIssue || dependencyIssue.status !== "closed" || !!dependencyIssue.blocker
          );
        });
        if (unmet.length > 0) {
          blockers.push({
            issue: progress.id,
            reason: `Dependencies are not closed: ${unmet.join(", ")}.`,
          });
          continue;
        }
        if (checkoutChanges === undefined) {
          blockers.push({
            issue: progress.id,
            reason: "Checkout cleanliness could not be verified; claim is unavailable.",
          });
          continue;
        }
        if (checkoutChanges) {
          blockers.push({
            issue: progress.id,
            reason: `Checkout is dirty; claim requires no staged, unstaged, or untracked changes: ${checkoutChanges}`,
          });
          continue;
        }
        actions.push({ issue: progress.id, action: "claim" });
      } else if (progress.execution === "claimed") {
        if (progress.owner && progress.baseSha) {
          actions.push({ issue: progress.id, action: "implement" });
        } else {
          blockers.push({
            issue: progress.id,
            reason: "Claim has no recorded owner or baseline; implementation is unavailable.",
          });
        }
      } else if (progress.execution === "implementing") {
        if (progress.assignment) {
          pendingAssignments.push({
            issue: progress.id,
            id: progress.assignment.id,
            role: progress.assignment.role,
            action: progress.assignment.action,
            report: progress.assignment.report,
            status: progress.assignment.status,
          });
          if (progress.assignment.status === "submitted") {
            const reason = this.assignmentPolicy.implementationReportBlocker(
              feature,
              progress.assignment,
            );
            if (reason) blockers.push({ issue: progress.id, reason });
            else if (checkBlockers.length === 0)
              actions.push({ issue: progress.id, action: "review" });
          } else {
            actions.push({ issue: progress.id, action: "await-implementation-report" });
          }
        } else {
          blockers.push({
            issue: progress.id,
            reason: "Implementation is marked in progress without a recorded assignment.",
          });
        }
      } else if (progress.execution === "reviewing") {
        const reason = this.assignmentPolicy.implementationReportBlocker(
          feature,
          progress.assignment,
        );
        if (reason) {
          blockers.push({ issue: progress.id, reason });
          continue;
        }
        const reviewCheckBlockers = this.checkPolicy.reviewCheckBlockers(
          feature,
          issue,
          progress,
          identity,
        );
        for (const blocker of reviewCheckBlockers)
          blockers.push({ issue: progress.id, reason: blocker });
        const latestAttempt = progress.correctionAttempts?.at(-1);
        const assignments =
          progress.assignment?.action === "correct"
            ? (latestAttempt?.reviewAssignments ?? [])
            : (progress.reviewAssignments ?? []);
        for (const assignment of assignments) {
          if (assignment.status === "pending") {
            pendingAssignments.push({
              issue: progress.id,
              id: assignment.id,
              role: assignment.role,
              action: "review",
              report: assignment.report,
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
          if (assignmentBlocker) blockers.push({ issue: progress.id, reason: assignmentBlocker });
        }
        if (reviewCheckBlockers.length === 0) {
          if (assignments.length === 0) actions.push({ issue: progress.id, action: "review" });
          else if (assignments.some((assignment) => assignment.status === "pending")) {
            actions.push({ issue: progress.id, action: "await-review-report" });
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
              issue: progress.id,
              action:
                this.findingPolicy.findingBlockers(progress, identity).length > 0
                  ? "resolve-findings"
                  : "accept",
            });
          }
        } else if (
          progress.assignment?.status === "submitted" &&
          reviewCheckBlockers.some((blocker) => blocker.includes(" is failed."))
        ) {
          actions.push({ issue: progress.id, action: "correct" });
        }
      } else if (progress.execution === "changes-requested") {
        blockers.push({
          issue: progress.id,
          reason: "A correction decision is required before another implementation dispatch.",
        });
        actions.push({
          issue: progress.id,
          action:
            (progress.findings ?? []).some((finding) => finding.status === "confirmed") ||
            (progress.correctionAttempts?.length ?? 0) > 0
              ? "correct"
              : this.findingPolicy.findingBlockers(progress, identity).length > 0
                ? "adjudicate-findings"
                : "controller-correction-decision",
        });
      } else if (progress.execution === "blocked") {
        blockers.push({ issue: progress.id, reason: "Issue execution is blocked." });
      } else if (progress.execution === "accepted") {
        const acceptanceBlockers = this.acceptancePolicy.acceptBlockers(
          feature,
          feature.state,
          issue,
          progress,
          identity,
        );
        for (const reason of acceptanceBlockers) {
          if (
            !blockers.some((blocker) => blocker.issue === progress.id && blocker.reason === reason)
          ) {
            blockers.push({ issue: progress.id, reason });
          }
        }
        if (acceptanceBlockers.length === 0)
          actions.push({ issue: progress.id, action: "integrate" });
      }
    }
    for (const issue of issues) {
      if (!progressById.has(issue.id)) {
        blockers.push({ issue: issue.id, reason: "Issue has no ledger execution record." });
      }
    }
    const delivery = this.deliveryStatus(feature, feature.state, issues);

    return {
      ...feature,
      snapshots,
      findings,
      requirementsDecisions,
      actions,
      pendingAssignments,
      blockers,
      delivery,
    };
  }

  public resolveFeature(spec: string): FeaturePaths {
    const absoluteSpec = isAbsolute(spec) ? relative(this.app.workspaceRoot, spec) : spec;
    return this.resolvePaths(absoluteSpec);
  }

  private resolvePaths(spec: string): FeaturePaths & { state: FeatureLedger } {
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
    issues: IssueDocument[],
  ): {
    scope: "delivery";
    status: "active" | "complete";
    execution: ExecutionState;
    action: string;
    snapshot?: string;
    codeSnapshot?: string;
    requirementsSnapshot?: string;
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
    checkRecords: CheckRecord[];
    blockers: string[];
  } {
    const delivery = ledger.delivery;
    const blockers: string[] = [];
    const allClosed =
      ledger.issues.length > 0 && ledger.issues.every((issue) => issue.status === "closed");
    let identity: ContentIdentity | undefined;
    if (!allClosed) {
      const missing = ledger.issues
        .filter((issue) => issue.status !== "closed")
        .map((issue) => issue.id);
      blockers.push(`Issues are not closed: ${missing.join(", ") || "feature has no issues"}.`);
    } else {
      try {
        identity = this.gitEvidence.deliveryIdentity(feature, ledger, issues);
        blockers.push(...this.checkPolicy.deliveryCheckBlockers(delivery, identity));
        if (delivery.adjudication?.status === "pending") {
          blockers.push(`Correction is paused for adjudication (${delivery.adjudication.reason}).`);
        }
        blockers.push(
          ...this.findingPolicy.deliveryFindingBlockers(feature, ledger, delivery, identity),
        );
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
    let action: string;
    if (delivery.finished) action = blockers.length > 0 ? "completion-invalidated" : "finished";
    else if (!allClosed) action = "close-issues";
    else if (delivery.adjudication?.status === "pending") action = "adjudicate";
    else if (
      delivery.assignment &&
      ["pending", "unavailable"].includes(delivery.assignment.status)
    ) {
      action = "await-implementation-report";
    } else if (
      this.checkPolicy.deliveryCheckBlockers(
        delivery,
        identity ?? {
          snapshot: "",
          codeSnapshot: "",
          requirementsSnapshot: "",
          headSha: "",
        },
      ).length > 0
    ) {
      action = "record-final-checks";
    } else if (
      !(delivery.reviewAssignments ?? []).length ||
      blockers.some((reason) => /aggregate review|reviewer|Review assignment/i.test(reason))
    ) {
      action = "review";
    } else if (
      (delivery.reviewAssignments ?? []).some((assignment) => assignment.status === "pending")
    ) {
      action = "await-review-report";
    } else if (
      this.findingPolicy.deliveryFindingBlockers(
        feature,
        ledger,
        delivery,
        identity ?? { snapshot: "", codeSnapshot: "", requirementsSnapshot: "", headSha: "" },
      ).length > 0
    ) {
      action = "correct";
    } else if (blockers.length > 0) action = "review";
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
      checkRecords: delivery.checks?.records ?? [],
      blockers,
    };
  }
}
