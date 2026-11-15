import { dirname, join } from "node:path";

import type { Application } from "@spindle/Foundation/Application";
import type { ImplementOptions } from "@spindle/SubagentDrivenDevelopment/Models/Options";
import { AssignmentService } from "@spindle/SubagentDrivenDevelopment/Services/AssignmentService";
import { ChecksService } from "@spindle/SubagentDrivenDevelopment/Services/ChecksService";
import { CorrectionService } from "@spindle/SubagentDrivenDevelopment/Services/CorrectionService";
import { DeliveryService } from "@spindle/SubagentDrivenDevelopment/Services/DeliveryService";
import { FeatureCreationService } from "@spindle/SubagentDrivenDevelopment/Services/FeatureCreationService";
import { FeatureInspectionService } from "@spindle/SubagentDrivenDevelopment/Services/FeatureInspectionService";
import { FeatureWorktreeService } from "@spindle/SubagentDrivenDevelopment/Services/FeatureWorktreeService";
import { FindingService } from "@spindle/SubagentDrivenDevelopment/Services/FindingService";
import { ReadinessService } from "@spindle/SubagentDrivenDevelopment/Services/ReadinessService";
import { RequirementsService } from "@spindle/SubagentDrivenDevelopment/Services/RequirementsService";
import { ReviewService } from "@spindle/SubagentDrivenDevelopment/Services/ReviewService";
import { SubmissionService } from "@spindle/SubagentDrivenDevelopment/Services/SubmissionService";
import { TicketIntegrationService } from "@spindle/SubagentDrivenDevelopment/Services/TicketIntegrationService";
import { TicketService } from "@spindle/SubagentDrivenDevelopment/Services/TicketService";

export async function workflowServices(app: Application) {
  const assignments = await app.make(AssignmentService);
  const ticketIntegration = await app.make(TicketIntegrationService);
  const testWorktreeParent = join(dirname(dirname(app.workspaceRoot)), "ticket-workspaces");
  return {
    assignmentService: {
      implement: (options: Omit<ImplementOptions, "workspace"> & { workspace?: string }) =>
        assignments.implement({
          ...options,
          workspace: options.workspace ?? testWorktreeParent,
        }),
      resume: assignments.resume.bind(assignments),
      deliveryResume: assignments.deliveryResume.bind(assignments),
      claim: assignments.claim.bind(assignments),
    },
    checksService: await app.make(ChecksService),
    correctionService: await app.make(CorrectionService),
    deliveryService: await app.make(DeliveryService),
    featureCreationService: await app.make(FeatureCreationService),
    featureInspectionService: await app.make(FeatureInspectionService),
    featureWorktreeService: await app.make(FeatureWorktreeService),
    findingService: await app.make(FindingService),
    ticketService: await app.make(TicketService),
    ticketIntegrationService: ticketIntegration,
    readinessService: await app.make(ReadinessService),
    requirementsService: await app.make(RequirementsService),
    reviewService: await app.make(ReviewService),
    submissionService: await app.make(SubmissionService),
  };
}

export type WorkflowServices = Awaited<ReturnType<typeof workflowServices>>;
