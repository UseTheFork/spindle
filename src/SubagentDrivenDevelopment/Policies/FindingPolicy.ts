import type { Application } from "@/foundation/Application";
import { Service } from "@/services/Service";
import type { ContentIdentity } from "@/SubagentDrivenDevelopment/Models/Evidence";
import type {
  IssueProgress,
  FeatureLedger,
  DeliveryProgress,
  FeaturePaths,
} from "@/SubagentDrivenDevelopment/Models/Workflow";
import { requiredDeliveryReviewers } from "@/SubagentDrivenDevelopment/Policies/RequiredReviewers";
import { ReviewPolicy } from "@/SubagentDrivenDevelopment/Policies/ReviewPolicy";

export class FindingPolicy extends Service {
  public constructor(
    app: Application,
    private readonly reviewPolicy: ReviewPolicy,
  ) {
    super(app);
  }

  public findingBlockers(progress: IssueProgress, identity: ContentIdentity): string[] {
    return (progress.findings ?? [])
      .filter(
        (finding) =>
          finding.blocking &&
          finding.status !== "fixed" &&
          finding.status !== "dismissed" &&
          !(
            finding.status === "deferred" &&
            finding.requirementsDecision &&
            progress.requirementsDecisions?.some(
              (decision) =>
                decision.id === finding.requirementsDecision &&
                decision.finding === finding.id &&
                decision.status === "approved" &&
                decision.requirementsSnapshot === identity.requirementsSnapshot,
            ) &&
            (progress.reviewAssignments?.length ?? 0) > 0 &&
            progress.reviewAssignments!.every(
              (assignment) =>
                assignment.status === "submitted" &&
                assignment.result === "passed" &&
                assignment.snapshot === identity.snapshot &&
                assignment.requirementsSnapshot === identity.requirementsSnapshot,
            )
          ),
      )
      .map(
        (finding) =>
          `Finding ${finding.id} is unresolved and blocking acceptance (severity=${finding.severity}, status=${finding.status}).`,
      );
  }

  public deliveryFindingBlockers(
    feature: FeaturePaths,
    ledger: FeatureLedger,
    delivery: DeliveryProgress,
    identity: ContentIdentity,
  ): string[] {
    return (delivery.findings ?? [])
      .filter((finding) => {
        if (!finding.blocking || ["fixed", "dismissed"].includes(finding.status)) return false;
        if (finding.status !== "deferred" || !finding.requirementsDecision) return true;
        const decision = delivery.requirementsDecisions?.find(
          (candidate) =>
            candidate.id === finding.requirementsDecision &&
            candidate.finding === finding.id &&
            candidate.status === "approved" &&
            candidate.requirementsSnapshot === identity.requirementsSnapshot,
        );
        if (!decision) return true;
        const required = requiredDeliveryReviewers(ledger, delivery);
        return required.some(({ agent }) => {
          const matching = (delivery.reviewAssignments ?? []).filter(
            (assignment) =>
              assignment.agent === agent &&
              assignment.status === "submitted" &&
              assignment.result === "passed" &&
              assignment.snapshot === identity.snapshot &&
              assignment.requirementsSnapshot === identity.requirementsSnapshot,
          );
          return (
            matching.length !== 1 ||
            !!this.reviewPolicy.reviewAssignmentBlocker(feature, delivery, matching[0]!, identity)
          );
        });
      })
      .map((finding) => `Delivery finding ${finding.id} remains ${finding.status}.`);
  }
}
