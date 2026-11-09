import type { SpecialistReviewRequirement } from "@/SubagentDrivenDevelopment/Models/Assignments";
import type {
  TicketProgress,
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

export function requiredTicketReviewers(
  ledger: FeatureLedger,
  progress: TicketProgress,
): RequiredReviewer[] {
  return requiredReviewers(ledger.reviewPolicy.ticket, progress.reviewRequirements ?? []);
}

export function requiredDeliveryReviewers(
  ledger: FeatureLedger,
  progress: DeliveryProgress,
): RequiredReviewer[] {
  return requiredReviewers(ledger.reviewPolicy.delivery, progress.reviewRequirements ?? []);
}
