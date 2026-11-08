import type { SpecialistReviewRequirement } from "@/SubagentDrivenDevelopment/Models/Assignments";
import type {
  IssueProgress,
  FeatureLedger,
  DeliveryProgress,
} from "@/SubagentDrivenDevelopment/Models/Workflow";

export interface RequiredReviewer {
  agent: string;
  details?: string;
}

export function requiredReviewers(
  policy: string[],
  requirements: SpecialistReviewRequirement[] = [],
): RequiredReviewer[] {
  return [
    ...policy.map((agent) => ({ agent })),
    ...requirements.map(({ agent, details }) => ({ agent, details })),
  ];
}

export function requiredIssueReviewers(
  ledger: FeatureLedger,
  progress: IssueProgress,
): RequiredReviewer[] {
  return requiredReviewers(ledger.reviewPolicy.issue, progress.reviewRequirements ?? []);
}

export function requiredDeliveryReviewers(
  ledger: FeatureLedger,
  progress: DeliveryProgress,
): RequiredReviewer[] {
  return requiredReviewers(ledger.reviewPolicy.delivery, progress.reviewRequirements ?? []);
}
