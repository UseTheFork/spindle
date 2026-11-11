import type { CommandConstructor } from "@/Commands/Command";
import { ServiceProvider } from "@/Foundation/ServiceProvider";
import { GitService } from "@/Git/Services/GitService";
import { AcceptCommand } from "@/SubagentDrivenDevelopment/Commands/AcceptCommand";
import { ChecksRecordCommand } from "@/SubagentDrivenDevelopment/Commands/ChecksRecordCommand";
import { ChecksRequireCommand } from "@/SubagentDrivenDevelopment/Commands/ChecksRequireCommand";
import { ClaimCommand } from "@/SubagentDrivenDevelopment/Commands/ClaimCommand";
import { CorrectCommand } from "@/SubagentDrivenDevelopment/Commands/CorrectCommand";
import { CreateCommand } from "@/SubagentDrivenDevelopment/Commands/CreateCommand";
import { FindingCreateCommand } from "@/SubagentDrivenDevelopment/Commands/FindingCreateCommand";
import { FindingUpdateCommand } from "@/SubagentDrivenDevelopment/Commands/FindingUpdateCommand";
import { FinishCommand } from "@/SubagentDrivenDevelopment/Commands/FinishCommand";
import { ImplementCommand } from "@/SubagentDrivenDevelopment/Commands/ImplementCommand";
import { IntegrateCommand } from "@/SubagentDrivenDevelopment/Commands/IntegrateCommand";
import { NextCommand } from "@/SubagentDrivenDevelopment/Commands/NextCommand";
import { ReadyCommand } from "@/SubagentDrivenDevelopment/Commands/ReadyCommand";
import { RequirementsDecideCommand } from "@/SubagentDrivenDevelopment/Commands/RequirementsDecideCommand";
import { ResumeCommand } from "@/SubagentDrivenDevelopment/Commands/ResumeCommand";
import { ReviewCommand } from "@/SubagentDrivenDevelopment/Commands/ReviewCommand";
import { ReviewRequireCommand } from "@/SubagentDrivenDevelopment/Commands/ReviewRequireCommand";
import { StartCommand } from "@/SubagentDrivenDevelopment/Commands/StartCommand";
import { StatusCommand } from "@/SubagentDrivenDevelopment/Commands/StatusCommand";
import { SubmitCommand } from "@/SubagentDrivenDevelopment/Commands/SubmitCommand";
import { TicketCommentCommand } from "@/SubagentDrivenDevelopment/Commands/TicketCommentCommand";
import { TicketCreateCommand } from "@/SubagentDrivenDevelopment/Commands/TicketCreateCommand";
import { TicketUpdateCommand } from "@/SubagentDrivenDevelopment/Commands/TicketUpdateCommand";
import { GitEvidence } from "@/SubagentDrivenDevelopment/Evidence/GitEvidence";
import { ReportEvidence } from "@/SubagentDrivenDevelopment/Evidence/ReportEvidence";
import { FeatureWorkspace } from "@/SubagentDrivenDevelopment/Persistence/FeatureWorkspace";
import { LedgerRepository } from "@/SubagentDrivenDevelopment/Persistence/LedgerRepository";
import { PathSafety } from "@/SubagentDrivenDevelopment/Persistence/PathSafety";
import { ReadinessReader } from "@/SubagentDrivenDevelopment/Persistence/ReadinessReader";
import { TicketRepository } from "@/SubagentDrivenDevelopment/Persistence/TicketRepository";
import { WorkspaceTransaction } from "@/SubagentDrivenDevelopment/Persistence/WorkspaceTransaction";
import { AcceptancePolicy } from "@/SubagentDrivenDevelopment/Policies/AcceptancePolicy";
import { AssignmentPolicy } from "@/SubagentDrivenDevelopment/Policies/AssignmentPolicy";
import { CheckPolicy } from "@/SubagentDrivenDevelopment/Policies/CheckPolicy";
import { FindingPolicy } from "@/SubagentDrivenDevelopment/Policies/FindingPolicy";
import { ReadinessPolicy } from "@/SubagentDrivenDevelopment/Policies/ReadinessPolicy";
import { ReviewPolicy } from "@/SubagentDrivenDevelopment/Policies/ReviewPolicy";
import { WorkflowPolicy } from "@/SubagentDrivenDevelopment/Policies/WorkflowPolicy";
import { AssignmentService } from "@/SubagentDrivenDevelopment/Services/AssignmentService";
import { ChecksService } from "@/SubagentDrivenDevelopment/Services/ChecksService";
import { CorrectionService } from "@/SubagentDrivenDevelopment/Services/CorrectionService";
import { DeliveryCorrectionService } from "@/SubagentDrivenDevelopment/Services/DeliveryCorrectionService";
import { DeliveryFindingService } from "@/SubagentDrivenDevelopment/Services/DeliveryFindingService";
import { DeliveryService } from "@/SubagentDrivenDevelopment/Services/DeliveryService";
import { DeliverySubmissionService } from "@/SubagentDrivenDevelopment/Services/DeliverySubmissionService";
import { FeatureCreationService } from "@/SubagentDrivenDevelopment/Services/FeatureCreationService";
import { FeatureInspectionService } from "@/SubagentDrivenDevelopment/Services/FeatureInspectionService";
import { FeatureWorktreeService } from "@/SubagentDrivenDevelopment/Services/FeatureWorktreeService";
import { FindingService } from "@/SubagentDrivenDevelopment/Services/FindingService";
import { IntegrationService } from "@/SubagentDrivenDevelopment/Services/IntegrationService";
import { ReadinessService } from "@/SubagentDrivenDevelopment/Services/ReadinessService";
import { RequirementsService } from "@/SubagentDrivenDevelopment/Services/RequirementsService";
import { ReviewService } from "@/SubagentDrivenDevelopment/Services/ReviewService";
import { SubmissionService } from "@/SubagentDrivenDevelopment/Services/SubmissionService";
import { TicketIntegrationService } from "@/SubagentDrivenDevelopment/Services/TicketIntegrationService";
import { TicketService } from "@/SubagentDrivenDevelopment/Services/TicketService";
import { TicketWorktreeService } from "@/SubagentDrivenDevelopment/Services/TicketWorktreeService";

export class SubagentDrivenDevelopmentServiceProvider extends ServiceProvider {
  public static override commands(): readonly CommandConstructor[] {
    return [
      CreateCommand,
      StartCommand,
      TicketCreateCommand,
      TicketUpdateCommand,
      TicketCommentCommand,
      ReadyCommand,
      ClaimCommand,
      ChecksRequireCommand,
      ChecksRecordCommand,
      ImplementCommand,
      CorrectCommand,
      ReviewCommand,
      ReviewRequireCommand,
      FindingCreateCommand,
      FindingUpdateCommand,
      RequirementsDecideCommand,
      SubmitCommand,
      AcceptCommand,
      IntegrateCommand,
      FinishCommand,
      ResumeCommand,
      NextCommand,
      StatusCommand,
    ];
  }
  public register(): void {
    this.app.singleton(
      TicketWorktreeService,
      async (app) => new TicketWorktreeService(app, await app.make(GitService)),
    );
    this.app.singleton(
      FeatureWorktreeService,
      async (app) =>
        new FeatureWorktreeService(
          app,
          await app.make(GitService),
          await app.make(FeatureInspectionService),
          await app.make(WorkspaceTransaction),
        ),
    );
    this.app.singleton(
      ReadinessReader,
      async (app) =>
        new ReadinessReader(
          app,
          await app.make(TicketRepository),
          await app.make(LedgerRepository),
          await app.make(PathSafety),
        ),
    );
    this.app.singleton(
      ReadinessPolicy,
      async (app) => new ReadinessPolicy(app, await app.make(TicketRepository)),
    );
    this.app.singleton(
      FeatureCreationService,
      async (app) =>
        new FeatureCreationService(
          app,
          await app.make(FeatureWorkspace),
          await app.make(PathSafety),
          await app.make(WorkspaceTransaction),
          await app.make(GitEvidence),
        ),
    );
    this.app.singleton(
      FeatureInspectionService,
      async (app) =>
        new FeatureInspectionService(
          app,
          await app.make(GitEvidence),
          await app.make(ReportEvidence),
          await app.make(FeatureWorkspace),
          await app.make(TicketRepository),
          await app.make(AcceptancePolicy),
          await app.make(AssignmentPolicy),
          await app.make(CheckPolicy),
          await app.make(FindingPolicy),
          await app.make(ReviewPolicy),
        ),
    );
    this.app.singleton(
      TicketService,
      async (app) =>
        new TicketService(
          app,
          await app.make(TicketRepository),
          await app.make(LedgerRepository),
          await app.make(PathSafety),
          await app.make(WorkspaceTransaction),
          await app.make(FeatureInspectionService),
        ),
    );
    this.app.singleton(
      ReadinessService,
      async (app) =>
        new ReadinessService(
          app,
          await app.make(FeatureInspectionService),
          await app.make(ReadinessReader),
          await app.make(ReadinessPolicy),
          await app.make(PathSafety),
        ),
    );
    this.app.singleton(
      AssignmentService,
      async (app) =>
        new AssignmentService(
          app,
          await app.make(GitEvidence),
          await app.make(ReportEvidence),
          await app.make(TicketRepository),
          await app.make(LedgerRepository),
          await app.make(WorkspaceTransaction),
          await app.make(AssignmentPolicy),
          await app.make(CheckPolicy),
          await app.make(ReviewPolicy),
          await app.make(WorkflowPolicy),
          await app.make(FeatureInspectionService),
          await app.make(TicketWorktreeService),
        ),
    );
    this.app.singleton(
      CorrectionService,
      async (app) =>
        new CorrectionService(
          app,
          await app.make(GitEvidence),
          await app.make(ReportEvidence),
          await app.make(TicketRepository),
          await app.make(LedgerRepository),
          await app.make(WorkspaceTransaction),
          await app.make(WorkflowPolicy),
          await app.make(DeliveryCorrectionService),
          await app.make(FeatureInspectionService),
        ),
    );
    this.app.singleton(
      DeliveryCorrectionService,
      async (app) =>
        new DeliveryCorrectionService(
          app,
          await app.make(GitEvidence),
          await app.make(ReportEvidence),
          await app.make(TicketRepository),
          await app.make(LedgerRepository),
          await app.make(WorkspaceTransaction),
          await app.make(FeatureInspectionService),
        ),
    );
    this.app.singleton(
      ChecksService,
      async (app) =>
        new ChecksService(
          app,
          await app.make(GitEvidence),
          await app.make(TicketRepository),
          await app.make(LedgerRepository),
          await app.make(WorkspaceTransaction),
          await app.make(WorkflowPolicy),
          await app.make(FeatureInspectionService),
        ),
    );
    this.app.singleton(
      ReviewService,
      async (app) =>
        new ReviewService(
          app,
          await app.make(GitEvidence),
          await app.make(ReportEvidence),
          await app.make(TicketRepository),
          await app.make(LedgerRepository),
          await app.make(WorkspaceTransaction),
          await app.make(AssignmentPolicy),
          await app.make(CheckPolicy),
          await app.make(ReviewPolicy),
          await app.make(WorkflowPolicy),
          await app.make(FeatureInspectionService),
        ),
    );
    this.app.singleton(
      FindingService,
      async (app) =>
        new FindingService(
          app,
          await app.make(GitEvidence),
          await app.make(ReportEvidence),
          await app.make(TicketRepository),
          await app.make(LedgerRepository),
          await app.make(WorkspaceTransaction),
          await app.make(CheckPolicy),
          await app.make(FindingPolicy),
          await app.make(ReviewPolicy),
          await app.make(WorkflowPolicy),
          await app.make(DeliveryFindingService),
          await app.make(FeatureInspectionService),
        ),
    );
    this.app.singleton(
      DeliveryFindingService,
      async (app) =>
        new DeliveryFindingService(
          app,
          await app.make(GitEvidence),
          await app.make(ReportEvidence),
          await app.make(TicketRepository),
          await app.make(LedgerRepository),
          await app.make(WorkspaceTransaction),
          await app.make(CheckPolicy),
          await app.make(FindingPolicy),
          await app.make(ReviewPolicy),
          await app.make(FeatureInspectionService),
        ),
    );
    this.app.singleton(
      RequirementsService,
      async (app) =>
        new RequirementsService(
          app,
          await app.make(GitEvidence),
          await app.make(TicketRepository),
          await app.make(LedgerRepository),
          await app.make(WorkspaceTransaction),
          await app.make(WorkflowPolicy),
          await app.make(FeatureInspectionService),
        ),
    );
    this.app.singleton(
      SubmissionService,
      async (app) =>
        new SubmissionService(
          app,
          await app.make(GitEvidence),
          await app.make(ReportEvidence),
          await app.make(TicketRepository),
          await app.make(LedgerRepository),
          await app.make(WorkspaceTransaction),
          await app.make(CheckPolicy),
          await app.make(ReviewPolicy),
          await app.make(WorkflowPolicy),
          await app.make(DeliverySubmissionService),
          await app.make(FeatureInspectionService),
        ),
    );
    this.app.singleton(
      DeliverySubmissionService,
      async (app) =>
        new DeliverySubmissionService(
          app,
          await app.make(GitEvidence),
          await app.make(ReportEvidence),
          await app.make(TicketRepository),
          await app.make(LedgerRepository),
          await app.make(WorkspaceTransaction),
          await app.make(CheckPolicy),
          await app.make(ReviewPolicy),
          await app.make(FeatureInspectionService),
        ),
    );
    this.app.singleton(
      IntegrationService,
      async (app) =>
        new IntegrationService(
          app,
          await app.make(GitEvidence),
          await app.make(ReportEvidence),
          await app.make(TicketRepository),
          await app.make(LedgerRepository),
          await app.make(WorkspaceTransaction),
          await app.make(AcceptancePolicy),
          await app.make(WorkflowPolicy),
          await app.make(FeatureInspectionService),
        ),
    );
    this.app.singleton(
      TicketIntegrationService,
      async (app) =>
        new TicketIntegrationService(
          app,
          await app.make(GitService),
          await app.make(GitEvidence),
          await app.make(ReportEvidence),
          await app.make(TicketRepository),
          await app.make(LedgerRepository),
          await app.make(WorkspaceTransaction),
          await app.make(AcceptancePolicy),
          await app.make(WorkflowPolicy),
          await app.make(FeatureInspectionService),
        ),
    );
    this.app.singleton(
      DeliveryService,
      async (app) =>
        new DeliveryService(
          app,
          await app.make(GitEvidence),
          await app.make(ReportEvidence),
          await app.make(TicketRepository),
          await app.make(LedgerRepository),
          await app.make(WorkspaceTransaction),
          await app.make(CheckPolicy),
          await app.make(FindingPolicy),
          await app.make(ReviewPolicy),
          await app.make(FeatureInspectionService),
        ),
    );
    this.app.singleton(
      FeatureWorkspace,
      async (app) =>
        new FeatureWorkspace(app, await app.make(LedgerRepository), await app.make(PathSafety)),
    );
    this.app.singleton(LedgerRepository, async (app) => new LedgerRepository(app));
    this.app.singleton(
      TicketRepository,
      async (app) =>
        new TicketRepository(app, await app.make(PathSafety), await app.make(LedgerRepository)),
    );
    this.app.singleton(
      WorkspaceTransaction,
      async (app) => new WorkspaceTransaction(app, await app.make(PathSafety)),
    );
    this.app.singleton(PathSafety, async (app) => new PathSafety(app, await app.make(GitService)));
    this.app.singleton(
      GitEvidence,
      async (app) =>
        new GitEvidence(app, await app.make(GitService), await app.make(LedgerRepository)),
    );
    this.app.singleton(
      ReportEvidence,
      async (app) => new ReportEvidence(app, await app.make(PathSafety)),
    );
    this.app.singleton(
      CheckPolicy,
      async (app) => new CheckPolicy(app, await app.make(GitEvidence)),
    );
    this.app.singleton(
      ReviewPolicy,
      async (app) =>
        new ReviewPolicy(app, await app.make(GitEvidence), await app.make(ReportEvidence)),
    );
    this.app.singleton(
      FindingPolicy,
      async (app) => new FindingPolicy(app, await app.make(ReviewPolicy)),
    );
    this.app.singleton(
      AcceptancePolicy,
      async (app) =>
        new AcceptancePolicy(
          app,
          await app.make(AssignmentPolicy),
          await app.make(CheckPolicy),
          await app.make(FindingPolicy),
          await app.make(ReviewPolicy),
        ),
    );
    this.app.singleton(
      AssignmentPolicy,
      async (app) => new AssignmentPolicy(app, await app.make(ReportEvidence)),
    );
    this.app.singleton(WorkflowPolicy, async (app) => new WorkflowPolicy(app));
  }
  public async boot(): Promise<void> {}
}
