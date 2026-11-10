import type { Application } from "@/Foundation/Application";
import { AssignmentService } from "@/SubagentDrivenDevelopment/Services/AssignmentService";
import { ChecksService } from "@/SubagentDrivenDevelopment/Services/ChecksService";
import { CorrectionService } from "@/SubagentDrivenDevelopment/Services/CorrectionService";
import { DeliveryService } from "@/SubagentDrivenDevelopment/Services/DeliveryService";
import { FeatureCreationService } from "@/SubagentDrivenDevelopment/Services/FeatureCreationService";
import { FeatureInspectionService } from "@/SubagentDrivenDevelopment/Services/FeatureInspectionService";
import { FindingService } from "@/SubagentDrivenDevelopment/Services/FindingService";
import { IntegrationService } from "@/SubagentDrivenDevelopment/Services/IntegrationService";
import { ReadinessService } from "@/SubagentDrivenDevelopment/Services/ReadinessService";
import { RequirementsService } from "@/SubagentDrivenDevelopment/Services/RequirementsService";
import { ReviewService } from "@/SubagentDrivenDevelopment/Services/ReviewService";
import { SubmissionService } from "@/SubagentDrivenDevelopment/Services/SubmissionService";
import { TicketService } from "@/SubagentDrivenDevelopment/Services/TicketService";

export async function workflowServices(app: Application) {
  return {
    assignmentService: await app.make(AssignmentService),
    checksService: await app.make(ChecksService),
    correctionService: await app.make(CorrectionService),
    deliveryService: await app.make(DeliveryService),
    featureCreationService: await app.make(FeatureCreationService),
    featureInspectionService: await app.make(FeatureInspectionService),
    findingService: await app.make(FindingService),
    integrationService: await app.make(IntegrationService),
    ticketService: await app.make(TicketService),
    readinessService: await app.make(ReadinessService),
    requirementsService: await app.make(RequirementsService),
    reviewService: await app.make(ReviewService),
    submissionService: await app.make(SubmissionService),
  };
}

export type WorkflowServices = Awaited<ReturnType<typeof workflowServices>>;
