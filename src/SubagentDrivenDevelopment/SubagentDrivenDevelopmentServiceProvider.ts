import type { CommandConstructor } from "@spindle/Commands/Command";
import { ServiceProvider } from "@spindle/Foundation/ServiceProvider";
import { GitService } from "@spindle/Git/Services/GitService";
import { ChecksRecordCommand } from "@spindle/SubagentDrivenDevelopment/Commands/ChecksRecordCommand";
import { ChecksRequireCommand } from "@spindle/SubagentDrivenDevelopment/Commands/ChecksRequireCommand";
import { ChecksRevalidateCommand } from "@spindle/SubagentDrivenDevelopment/Commands/ChecksRevalidateCommand";
import { ClaimCommand } from "@spindle/SubagentDrivenDevelopment/Commands/ClaimCommand";
import { CorrectCommand } from "@spindle/SubagentDrivenDevelopment/Commands/CorrectCommand";
import { CreateCommand } from "@spindle/SubagentDrivenDevelopment/Commands/CreateCommand";
import { FindingCreateCommand } from "@spindle/SubagentDrivenDevelopment/Commands/FindingCreateCommand";
import { FindingUpdateCommand } from "@spindle/SubagentDrivenDevelopment/Commands/FindingUpdateCommand";
import { FinishCommand } from "@spindle/SubagentDrivenDevelopment/Commands/FinishCommand";
import { ImplementCommand } from "@spindle/SubagentDrivenDevelopment/Commands/ImplementCommand";
import { IntegrateCommand } from "@spindle/SubagentDrivenDevelopment/Commands/IntegrateCommand";
import { NextCommand } from "@spindle/SubagentDrivenDevelopment/Commands/NextCommand";
import { ReadyCommand } from "@spindle/SubagentDrivenDevelopment/Commands/ReadyCommand";
import { RequirementsDecideCommand } from "@spindle/SubagentDrivenDevelopment/Commands/RequirementsDecideCommand";
import { ResumeCommand } from "@spindle/SubagentDrivenDevelopment/Commands/ResumeCommand";
import { ReviewCommand } from "@spindle/SubagentDrivenDevelopment/Commands/ReviewCommand";
import { ReviewRequireCommand } from "@spindle/SubagentDrivenDevelopment/Commands/ReviewRequireCommand";
import { StartCommand } from "@spindle/SubagentDrivenDevelopment/Commands/StartCommand";
import { StatusCommand } from "@spindle/SubagentDrivenDevelopment/Commands/StatusCommand";
import { SubmitCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SubmitCommand";
import { SyncCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SyncCommand";
import { TaskAcceptCommand } from "@spindle/SubagentDrivenDevelopment/Commands/TaskAcceptCommand";
import { TaskAssignCommand } from "@spindle/SubagentDrivenDevelopment/Commands/TaskAssignCommand";
import { TaskCreateCommand } from "@spindle/SubagentDrivenDevelopment/Commands/TaskCreateCommand";
import { TaskInstructionsCommand } from "@spindle/SubagentDrivenDevelopment/Commands/TaskInstructionsCommand";
import { TaskRequestChangesCommand } from "@spindle/SubagentDrivenDevelopment/Commands/TaskRequestChangesCommand";
import { TaskSubmitCommand } from "@spindle/SubagentDrivenDevelopment/Commands/TaskSubmitCommand";
import { TaskUpdateCommand } from "@spindle/SubagentDrivenDevelopment/Commands/TaskUpdateCommand";
import { TicketCommentCommand } from "@spindle/SubagentDrivenDevelopment/Commands/TicketCommentCommand";
import { TicketCreateCommand } from "@spindle/SubagentDrivenDevelopment/Commands/TicketCreateCommand";
import { TicketUpdateCommand } from "@spindle/SubagentDrivenDevelopment/Commands/TicketUpdateCommand";
import { GitEvidence } from "@spindle/SubagentDrivenDevelopment/Evidence/GitEvidence";
import { ReportEvidence } from "@spindle/SubagentDrivenDevelopment/Evidence/ReportEvidence";
import { FeatureWorkspace } from "@spindle/SubagentDrivenDevelopment/Persistence/FeatureWorkspace";
import { LedgerRepository } from "@spindle/SubagentDrivenDevelopment/Persistence/LedgerRepository";
import { PathSafety } from "@spindle/SubagentDrivenDevelopment/Persistence/PathSafety";
import { ReadinessReader } from "@spindle/SubagentDrivenDevelopment/Persistence/ReadinessReader";
import { TicketRepository } from "@spindle/SubagentDrivenDevelopment/Persistence/TicketRepository";
import { WorkspaceTransaction } from "@spindle/SubagentDrivenDevelopment/Persistence/WorkspaceTransaction";
import { AcceptancePolicy } from "@spindle/SubagentDrivenDevelopment/Policies/AcceptancePolicy";
import { AssignmentPolicy } from "@spindle/SubagentDrivenDevelopment/Policies/AssignmentPolicy";
import { CheckPolicy } from "@spindle/SubagentDrivenDevelopment/Policies/CheckPolicy";
import { FindingPolicy } from "@spindle/SubagentDrivenDevelopment/Policies/FindingPolicy";
import { ReadinessPolicy } from "@spindle/SubagentDrivenDevelopment/Policies/ReadinessPolicy";
import { ReviewPolicy } from "@spindle/SubagentDrivenDevelopment/Policies/ReviewPolicy";
import { WorkflowPolicy } from "@spindle/SubagentDrivenDevelopment/Policies/WorkflowPolicy";
import { AssignmentService } from "@spindle/SubagentDrivenDevelopment/Services/AssignmentService";
import { ChecksService } from "@spindle/SubagentDrivenDevelopment/Services/ChecksService";
import { CorrectionService } from "@spindle/SubagentDrivenDevelopment/Services/CorrectionService";
import { DeliveryCorrectionService } from "@spindle/SubagentDrivenDevelopment/Services/DeliveryCorrectionService";
import { DeliveryFindingService } from "@spindle/SubagentDrivenDevelopment/Services/DeliveryFindingService";
import { DeliveryService } from "@spindle/SubagentDrivenDevelopment/Services/DeliveryService";
import { DeliverySubmissionService } from "@spindle/SubagentDrivenDevelopment/Services/DeliverySubmissionService";
import { FeatureCreationService } from "@spindle/SubagentDrivenDevelopment/Services/FeatureCreationService";
import { FeatureFinalizationService } from "@spindle/SubagentDrivenDevelopment/Services/FeatureFinalizationService";
import { FeatureInspectionService } from "@spindle/SubagentDrivenDevelopment/Services/FeatureInspectionService";
import { FeatureWorktreeService } from "@spindle/SubagentDrivenDevelopment/Services/FeatureWorktreeService";
import { FindingService } from "@spindle/SubagentDrivenDevelopment/Services/FindingService";
import { ReadinessService } from "@spindle/SubagentDrivenDevelopment/Services/ReadinessService";
import { RequirementsService } from "@spindle/SubagentDrivenDevelopment/Services/RequirementsService";
import { ReviewService } from "@spindle/SubagentDrivenDevelopment/Services/ReviewService";
import { StatusSummaryService } from "@spindle/SubagentDrivenDevelopment/Services/StatusSummaryService";
import { SubmissionService } from "@spindle/SubagentDrivenDevelopment/Services/SubmissionService";
import { TaskService } from "@spindle/SubagentDrivenDevelopment/Services/TaskService";
import { TicketIntegrationService } from "@spindle/SubagentDrivenDevelopment/Services/TicketIntegrationService";
import { TicketService } from "@spindle/SubagentDrivenDevelopment/Services/TicketService";
import { TicketSyncService } from "@spindle/SubagentDrivenDevelopment/Services/TicketSyncService";
import { TicketWorktreeService } from "@spindle/SubagentDrivenDevelopment/Services/TicketWorktreeService";
import { WorkflowRecordsCommitter } from "@spindle/SubagentDrivenDevelopment/Services/WorkflowRecordsCommitter";

export class SubagentDrivenDevelopmentServiceProvider extends ServiceProvider {
  public static override commands(): readonly CommandConstructor[] {
    return [
      CreateCommand,
      StartCommand,
      TicketCreateCommand,
      TicketUpdateCommand,
      TicketCommentCommand,
      TaskCreateCommand,
      TaskUpdateCommand,
      TaskAssignCommand,
      TaskInstructionsCommand,
      TaskSubmitCommand,
      TaskAcceptCommand,
      TaskRequestChangesCommand,
      ReadyCommand,
      ChecksRequireCommand,
      ChecksRecordCommand,
      ChecksRevalidateCommand,
      ImplementCommand,
      ClaimCommand,
      CorrectCommand,
      ReviewCommand,
      ReviewRequireCommand,
      FindingCreateCommand,
      FindingUpdateCommand,
      RequirementsDecideCommand,
      SubmitCommand,
      IntegrateCommand,
      FinishCommand,
      ResumeCommand,
      NextCommand,
      StatusCommand,
      SyncCommand,
    ];
  }
  public register(): void {
    this.app.singleton(StatusSummaryService);
    this.app.singleton(
      FeatureFinalizationService,
      async (app) =>
        new FeatureFinalizationService(
          app,
          await app.make(GitService),
          await app.make(LedgerRepository),
          await app.make(WorkspaceTransaction),
        ),
    );
    this.app.singleton(
      TicketWorktreeService,
      async (app) =>
        new TicketWorktreeService(app, await app.make(GitService), await app.make(GitEvidence)),
    );
    this.app.singleton(
      TicketSyncService,
      async (app) =>
        new TicketSyncService(
          app,
          await app.make(GitService),
          await app.make(GitEvidence),
          await app.make(LedgerRepository),
          await app.make(WorkspaceTransaction),
          await app.make(WorkflowPolicy),
          await app.make(ChecksService),
          await app.make(FeatureInspectionService),
        ),
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
      TaskService,
      async (app) =>
        new TaskService(
          app,
          await app.make(TicketRepository),
          await app.make(LedgerRepository),
          await app.make(WorkspaceTransaction),
          await app.make(FeatureInspectionService),
          await app.make(ReportEvidence),
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
          await app.make(ReadinessPolicy),
          await app.make(WorkflowPolicy),
          await app.make(FeatureInspectionService),
          await app.make(TicketWorktreeService),
          await app.make(WorkflowRecordsCommitter),
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
          await app.make(ChecksService),
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
          await app.make(WorkflowRecordsCommitter),
        ),
    );
    this.app.singleton(
      WorkflowRecordsCommitter,
      async (app) => new WorkflowRecordsCommitter(app, await app.make(GitService)),
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
          await app.make(FeatureFinalizationService),
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
      async (app) =>
        new WorkspaceTransaction(
          app,
          await app.make(PathSafety),
          await app.make(WorkflowRecordsCommitter),
        ),
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
      async (app) =>
        new FindingPolicy(app, await app.make(GitEvidence), await app.make(ReviewPolicy)),
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
