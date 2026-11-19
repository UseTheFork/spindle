import type { CommandConstructor } from "@spindle/Commands/Command";
import { ServiceProvider } from "@spindle/Foundation/ServiceProvider";
import { SddAssignmentCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SddAssignmentCommand";
import { SddCreateCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SddCreateCommand";
import { SddDeliveryCreateCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SddDeliveryCreateCommand";
import { SddDispatchCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SddDispatchCommand";
import { SddFindingDismissCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SddFindingDismissCommand";
import { SddFindingFixCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SddFindingFixCommand";
import { SddFinishCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SddFinishCommand";
import { SddIntegrateCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SddIntegrateCommand";
import { SddMergeRecordCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SddMergeRecordCommand";
import { SddNextCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SddNextCommand";
import { SddReviewCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SddReviewCommand";
import { SddReviewSubmitCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SddReviewSubmitCommand";
import { SddStartCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SddStartCommand";
import { SddTaskCreateCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SddTaskCreateCommand";
import { SddTaskRemoveCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SddTaskRemoveCommand";
import { SddTaskSubmitCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SddTaskSubmitCommand";
import { SddTaskUpdateCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SddTaskUpdateCommand";
import { SddTicketCommentAddCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SddTicketCommentAddCommand";
import { SddTicketCommitCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SddTicketCommitCommand";
import { SddTicketCreateCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SddTicketCreateCommand";
import { SddTicketStartCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SddTicketStartCommand";
import { SddTicketUpdateCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SddTicketUpdateCommand";
import { DeliveryService } from "@spindle/SubagentDrivenDevelopment/Services/DeliveryService";
import { FeatureWorkspaceService } from "@spindle/SubagentDrivenDevelopment/Services/FeatureWorkspaceService";
import { MergeOperationService } from "@spindle/SubagentDrivenDevelopment/Services/MergeOperationService";
import { SddReviewService } from "@spindle/SubagentDrivenDevelopment/Services/SddReviewService";
import { TaskDispatchService } from "@spindle/SubagentDrivenDevelopment/Services/TaskDispatchService";
import { TicketCommitService } from "@spindle/SubagentDrivenDevelopment/Services/TicketCommitService";
import { WorkGraphService } from "@spindle/SubagentDrivenDevelopment/Services/WorkGraphService";
import { WorktreeStartService } from "@spindle/SubagentDrivenDevelopment/Services/WorktreeStartService";

export class SubagentDrivenDevelopmentServiceProvider extends ServiceProvider {
  public static override commands(): readonly CommandConstructor[] {
    return [
      SddCreateCommand,
      SddNextCommand,
      SddDeliveryCreateCommand,
      SddFinishCommand,
      SddTicketCreateCommand,
      SddTicketUpdateCommand,
      SddTicketCommentAddCommand,
      SddTaskCreateCommand,
      SddTaskUpdateCommand,
      SddTaskRemoveCommand,
      SddStartCommand,
      SddTicketStartCommand,
      SddDispatchCommand,
      SddAssignmentCommand,
      SddTaskSubmitCommand,
      SddTicketCommitCommand,
      SddReviewCommand,
      SddReviewSubmitCommand,
      SddFindingDismissCommand,
      SddFindingFixCommand,
      SddIntegrateCommand,
      SddMergeRecordCommand,
    ];
  }

  public register(): void {
    this.app.singleton(WorkGraphService);
    this.app.singleton(FeatureWorkspaceService);
    this.app.singleton(DeliveryService);
    this.app.singleton(MergeOperationService);
    this.app.singleton(WorktreeStartService);
    this.app.singleton(TaskDispatchService);
    this.app.singleton(TicketCommitService);
    this.app.singleton(SddReviewService);
  }

  public async boot(): Promise<void> {}
}
