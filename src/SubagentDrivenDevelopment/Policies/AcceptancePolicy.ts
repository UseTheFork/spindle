import type { Application } from "@/Foundation/Application";
import { Service } from "@/Foundation/Service";
import type { CommitIdentity } from "@/SubagentDrivenDevelopment/Models/Evidence";
import type {
  TicketProgress,
  FeatureLedger,
  FeaturePaths,
  TicketDocument,
} from "@/SubagentDrivenDevelopment/Models/Workflow";
import { AssignmentPolicy } from "@/SubagentDrivenDevelopment/Policies/AssignmentPolicy";
import { CheckPolicy } from "@/SubagentDrivenDevelopment/Policies/CheckPolicy";
import { FindingPolicy } from "@/SubagentDrivenDevelopment/Policies/FindingPolicy";
import { requiredTicketReviewers } from "@/SubagentDrivenDevelopment/Policies/RequiredReviewers";
import { ReviewPolicy } from "@/SubagentDrivenDevelopment/Policies/ReviewPolicy";

export class AcceptancePolicy extends Service {
  public constructor(
    app: Application,
    private readonly assignmentPolicy: AssignmentPolicy,
    private readonly checkPolicy: CheckPolicy,
    private readonly findingPolicy: FindingPolicy,
    private readonly reviewPolicy: ReviewPolicy,
  ) {
    super(app);
  }

  public acceptBlockers(
    feature: FeaturePaths,
    ledger: FeatureLedger,
    ticket: TicketDocument,
    progress: TicketProgress,
    identity: CommitIdentity,
  ): string[] {
    const blockers = this.checkPolicy.reviewCheckBlockers(feature, ticket, progress, identity);
    blockers.push(...this.findingPolicy.findingBlockers(feature, ticket, progress, identity));
    for (const decision of progress.requirementsDecisions ?? []) {
      if (decision.status === "rejected" && decision.commitSha === identity.headSha) {
        blockers.push(
          `Requirements decision ${decision.id} was rejected; acceptance requires an approved decision and fresh review.`,
        );
      }
    }
    const implementationBlocker = this.assignmentPolicy.implementationReportBlocker(
      feature,
      progress.assignment,
    );
    if (implementationBlocker) blockers.push(implementationBlocker);

    const assignments = progress.reviewAssignments ?? [];
    const requiredReviewers = requiredTicketReviewers(ledger, progress);
    if (
      new Set(assignments.map((assignment) => assignment.id)).size !== assignments.length ||
      new Set(assignments.map((assignment) => assignment.report)).size !== assignments.length
    ) {
      blockers.push("Initial review assignments must have distinct IDs and report destinations.");
    }
    const hasCorrections = (progress.correctionAttempts?.length ?? 0) > 0;
    for (const { agent, details } of requiredReviewers) {
      const coverage = assignments.filter(
        (assignment) => assignment.agent === agent && assignment.scope === "initial",
      );
      if (coverage.length === 0) {
        blockers.push(`Required initial review coverage for '${agent}' is missing.`);
      } else if (coverage.length > 1) {
        blockers.push(`Required initial review coverage for '${agent}' is duplicated.`);
      } else if (coverage[0]!.objective !== details) {
        blockers.push(`Review assignment for '${agent}' does not match its pinned objective.`);
      } else if (
        hasCorrections &&
        (coverage[0]!.status !== "submitted" ||
          coverage[0]!.result === "unavailable" ||
          this.reviewPolicy.reviewReportIntegrityBlocker(feature, coverage[0]))
      ) {
        blockers.push(
          `Required initial review coverage for '${agent}' is missing or its registered report is unavailable.`,
        );
      }
    }
    if (hasCorrections) {
      const currentAttempt = progress.correctionAttempts!.at(-1)!;
      const correctiveAssignments = currentAttempt.reviewAssignments ?? [];
      if (correctiveAssignments.length !== requiredReviewers.length) {
        blockers.push("Complete corrective review coverage for the latest attempt is missing.");
      }
      for (const { agent, details } of requiredReviewers) {
        const coverage = correctiveAssignments.filter(
          (assignment) =>
            assignment.agent === agent &&
            assignment.scope === "corrective" &&
            assignment.attempt === currentAttempt.number,
        );
        if (coverage.length !== 1) {
          blockers.push(
            `Required corrective review coverage for '${agent}' is missing or duplicated.`,
          );
          continue;
        }
        if (coverage[0]!.objective !== details) {
          blockers.push(
            `Corrective review assignment for '${agent}' does not match its pinned objective.`,
          );
        }
        if (coverage[0]!.status !== "submitted" || coverage[0]!.result !== "passed") {
          blockers.push(`Corrective review assignment ${coverage[0]!.id} is not passing.`);
          continue;
        }
        const blocker = this.reviewPolicy.reviewAssignmentBlocker(
          feature,
          progress,
          coverage[0]!,
          identity,
        );
        if (blocker) blockers.push(blocker);
      }
      for (const assignment of correctiveAssignments) {
        if (!requiredReviewers.some((reviewer) => reviewer.agent === assignment.agent)) {
          blockers.push(
            `Corrective review assignment ${assignment.id} is not part of the pinned review policy.`,
          );
        }
      }
    } else {
      for (const assignment of assignments) {
        if (!requiredReviewers.some((reviewer) => reviewer.agent === assignment.agent)) {
          blockers.push(
            `Review assignment ${assignment.id} is not part of the pinned review policy.`,
          );
          continue;
        }
        if (assignment.status === "pending") {
          blockers.push(`Review assignment ${assignment.id} is pending.`);
          continue;
        }
        const blocker = this.reviewPolicy.reviewAssignmentBlocker(
          feature,
          progress,
          assignment,
          identity,
        );
        if (blocker) blockers.push(blocker);
      }
    }
    return [...new Set(blockers)];
  }
}
