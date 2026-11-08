import type { Application } from "@/foundation/Application";
import { Service } from "@/services/Service";
import { ReportEvidence } from "@/SubagentDrivenDevelopment/Evidence/ReportEvidence";
import type { ImplementationAssignment } from "@/SubagentDrivenDevelopment/Models/Assignments";
import type { IssueProgress, FeaturePaths } from "@/SubagentDrivenDevelopment/Models/Workflow";

export class AssignmentPolicy extends Service {
  public constructor(
    app: Application,
    private readonly reportEvidence: ReportEvidence,
  ) {
    super(app);
  }

  public implementationReportBlocker(
    feature: FeaturePaths,
    assignment: ImplementationAssignment | undefined,
  ): string | undefined {
    if (!assignment || assignment.status !== "submitted" || !assignment.reportSha256) {
      return "Review is blocked because no submitted implementation report is registered.";
    }
    try {
      const currentDigest = this.reportEvidence.readReportDigest(feature, assignment.report);
      if (currentDigest !== assignment.reportSha256) {
        return "The registered implementation report content changed after submission.";
      }
    } catch {
      return "The registered implementation report is missing or unavailable.";
    }
    return undefined;
  }

  public resumeBlocker(feature: FeaturePaths, progress: IssueProgress): string | undefined {
    if (progress.execution === "claimed" && (!progress.owner || !progress.baseSha)) {
      return "Claim has no recorded owner or baseline; implementation is unavailable.";
    }
    if (progress.execution === "implementing" && !progress.assignment) {
      return "Implementation is marked in progress without a recorded assignment.";
    }
    if (
      progress.execution === "reviewing" ||
      (progress.execution === "implementing" && progress.assignment?.status === "submitted")
    ) {
      return this.implementationReportBlocker(feature, progress.assignment);
    }
    return undefined;
  }
}
