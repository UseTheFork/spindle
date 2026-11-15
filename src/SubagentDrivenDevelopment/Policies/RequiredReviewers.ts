import type { SpecialistReviewRequirement } from "@spindle/SubagentDrivenDevelopment/Models/Assignments";
import type {
  TicketProgress,
  FeatureLedger,
  DeliveryProgress,
} from "@spindle/SubagentDrivenDevelopment/Models/Workflow";

export interface RequiredReviewer {
  agent: string;
  details?: string;
}

export class RequiredReviewers {
  public static requiredReviewers(
    policy: string[],
    requirements: SpecialistReviewRequirement[] = [],
  ): RequiredReviewer[] {
    return [
      ...policy.map((agent) => ({ agent })),
      ...requirements.map(({ agent, details }) => ({ agent, details })),
    ];
  }

  public static requiredTicketReviewers(
    ledger: FeatureLedger,
    progress: TicketProgress,
  ): RequiredReviewer[] {
    return RequiredReviewers.requiredReviewers(
      ledger.reviewPolicy.ticket,
      progress.reviewRequirements ?? [],
    );
  }

  public static requiredDeliveryReviewers(
    ledger: FeatureLedger,
    progress: DeliveryProgress,
  ): RequiredReviewer[] {
    return RequiredReviewers.requiredReviewers(
      ledger.reviewPolicy.delivery,
      progress.reviewRequirements ?? [],
    );
  }
}
