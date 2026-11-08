import type { Application } from "@/Foundation/Application";
import { Service } from "@/Foundation/Service";
import { GitEvidence } from "@/SubagentDrivenDevelopment/Evidence/GitEvidence";
import { ReportEvidence } from "@/SubagentDrivenDevelopment/Evidence/ReportEvidence";
import type { ReviewAssignment } from "@/SubagentDrivenDevelopment/Models/Assignments";
import type { ContentIdentity } from "@/SubagentDrivenDevelopment/Models/Evidence";
import type {
  IssueProgress,
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
    progress: IssueProgress | DeliveryProgress,
    assignment: ReviewAssignment,
    identity: ContentIdentity,
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
    const snapshotBlocker = this.reviewSnapshotBlocker(feature, progress, assignment, identity);
    if (snapshotBlocker) return snapshotBlocker;
    if (assignment.status === "pending") return undefined;
    if (assignment.result !== "passed") {
      return `Review assignment ${assignment.id} is ${assignment.result}.${assignment.details ? ` Details: ${assignment.details}` : ""}`;
    }
    if (assignment.noFindings !== true && (assignment.findingIds?.length ?? 0) === 0) {
      return `Review assignment ${assignment.id} has no explicit findings declaration.`;
    }
    return undefined;
  }

  public reviewSnapshotBlocker(
    feature: FeaturePaths,
    progress: IssueProgress | DeliveryProgress,
    assignment: ReviewAssignment,
    identity: ContentIdentity,
  ): string | undefined {
    const integratedEvidence =
      assignment.scope !== "delivery" &&
      this.gitEvidence.integrationPreservesEvidence(progress, identity) &&
      assignment.snapshot === progress.acceptedEvidence?.snapshot &&
      assignment.codeSnapshot === progress.acceptedEvidence?.codeSnapshot &&
      assignment.requirementsSnapshot === progress.acceptedEvidence?.requirementsSnapshot &&
      JSON.stringify(assignment.inventory) === JSON.stringify(progress.acceptedEvidence?.files);
    if (
      !integratedEvidence &&
      (assignment.snapshot !== identity.snapshot ||
        assignment.codeSnapshot !== identity.codeSnapshot ||
        assignment.requirementsSnapshot !== identity.requirementsSnapshot)
    ) {
      return `Review assignment ${assignment.id} is stale for the current issue snapshot.`;
    }
    if (!progress.baseSha) return "Review assignment has no recorded Git baseline.";
    let inventory: string[];
    try {
      inventory = this.gitEvidence.changedPaths(progress.baseSha);
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
