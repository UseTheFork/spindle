import { join } from "node:path";

import type { Application } from "@/Foundation/Application";
import { Service } from "@/Foundation/Service";
import { GitEvidence } from "@/SubagentDrivenDevelopment/Evidence/GitEvidence";
import { ReportEvidence } from "@/SubagentDrivenDevelopment/Evidence/ReportEvidence";
import type { ReviewAssignment } from "@/SubagentDrivenDevelopment/Models/Assignments";
import type { CommitIdentity } from "@/SubagentDrivenDevelopment/Models/Evidence";
import type {
  TicketProgress,
  DeliveryProgress,
  FeaturePaths,
} from "@/SubagentDrivenDevelopment/Models/Workflow";

export class ReviewPolicy extends Service {
  public constructor(
    app: Application,
    private readonly gitEvidence: GitEvidence,
    private readonly reportEvidence: ReportEvidence,
  ) {
    super(app);
  }

  public reviewAssignmentBlocker(
    feature: FeaturePaths,
    progress: TicketProgress | DeliveryProgress,
    assignment: ReviewAssignment,
    identity: CommitIdentity,
  ): string | undefined {
    if (assignment.status !== "pending") {
      try {
        const currentDigest = this.reportEvidence.readReportDigest(feature, assignment.report);
        if (currentDigest !== assignment.reportSha256) {
          return `The registered review report for assignment ${assignment.id} changed after submission.`;
        }
      } catch {
        return `The registered review report for assignment ${assignment.id} is missing or unavailable.`;
      }
    }
    const commitBlocker = this.reviewCommitBlocker(feature, progress, assignment, identity);
    if (commitBlocker) return commitBlocker;
    if (assignment.status === "pending") return undefined;
    if (assignment.result !== "passed") {
      return `Review assignment ${assignment.id} is ${assignment.result}.${assignment.details ? ` Details: ${assignment.details}` : ""}`;
    }
    if (assignment.noFindings !== true && (assignment.findingIds?.length ?? 0) === 0) {
      return `Review assignment ${assignment.id} has no explicit findings declaration.`;
    }
    return undefined;
  }

  public reviewCommitBlocker(
    feature: FeaturePaths,
    progress: TicketProgress | DeliveryProgress,
    assignment: ReviewAssignment,
    identity: CommitIdentity,
  ): string | undefined {
    if ("id" in progress && progress.worktree) {
      try {
        this.gitEvidence.assertTicketCodeCommitted(progress);
        const ticket = {
          id: progress.id,
          path: join(feature.workspace, "tickets", `${progress.id}.md`),
        };
        const featureHead = this.gitEvidence.headSha(feature.workspace);
        this.gitEvidence.assertCommittedRequirements(feature, [ticket], featureHead);
        this.gitEvidence.assertTicketRequirementsCurrent(
          feature,
          ticket,
          identity.headSha,
          this.gitEvidence.ticketWorkspace(progress)!,
        );
      } catch (error) {
        return `Ticket review workspace is invalid: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
    const workspace =
      "id" in progress && progress.worktree
        ? this.gitEvidence.ticketWorkspace(progress)
        : this.app.workspaceRoot;
    const integratedEvidence =
      assignment.scope !== "delivery" &&
      "id" in progress &&
      !progress.worktree &&
      !!progress.acceptedEvidence &&
      assignment.headSha === progress.acceptedEvidence.commitSha &&
      JSON.stringify(assignment.inventory) === JSON.stringify(progress.acceptedEvidence.files) &&
      this.gitEvidence.commitPreservesInputs(
        feature,
        { id: progress.id, path: join(feature.workspace, "tickets", `${progress.id}.md`) },
        assignment.headSha,
        identity.headSha,
        workspace!,
      );
    const deliveryEvidence =
      assignment.scope === "delivery" &&
      !("id" in progress) &&
      this.gitEvidence.deliveryInputsPreserved(
        feature,
        assignment.headSha,
        identity.headSha,
        workspace!,
      );
    if (
      !integratedEvidence &&
      !deliveryEvidence &&
      (assignment.headSha !== identity.headSha ||
        ("id" in progress &&
          !!progress.worktree &&
          (assignment.workspace !== progress.worktree.workspace ||
            assignment.branch !== progress.worktree.branch)))
    ) {
      return `Review assignment ${assignment.id} is stale for the current commit.`;
    }
    if (!progress.baseSha) return "Review assignment has no recorded Git baseline.";
    let inventory: string[];
    try {
      inventory = this.gitEvidence.changedPaths(
        progress.baseSha,
        "id" in progress ? this.gitEvidence.ticketWorkspace(progress) : undefined,
      );
    } catch (error) {
      return `Review inventory cannot be revalidated: ${error instanceof Error ? error.message : String(error)}`;
    }
    if (JSON.stringify(inventory) !== JSON.stringify(assignment.inventory)) {
      return `Review assignment ${assignment.id} no longer matches the frozen Git inventory.`;
    }
    if (assignment.status === "pending") return undefined;
    try {
      const currentDigest = this.reportEvidence.readReportDigest(feature, assignment.report);
      if (currentDigest !== assignment.reportSha256) {
        return `The registered review report for assignment ${assignment.id} changed after submission.`;
      }
    } catch {
      return `The registered review report for assignment ${assignment.id} is missing or unavailable.`;
    }
    return undefined;
  }

  public reviewReportIntegrityBlocker(
    feature: FeaturePaths,
    assignment: ReviewAssignment,
  ): string | undefined {
    if (assignment.status !== "submitted" || !assignment.reportSha256) {
      return "Review report was not submitted.";
    }
    try {
      if (
        this.reportEvidence.readReportDigest(feature, assignment.report) !== assignment.reportSha256
      ) {
        return "Review report content changed after submission.";
      }
    } catch {
      return "Review report is missing or unavailable.";
    }
    return undefined;
  }
}
