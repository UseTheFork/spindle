import type { CommandConstructor } from "@spindle/Commands/Command";
import { ServiceProvider } from "@spindle/Foundation/ServiceProvider";
import { SddAssignmentCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SddAssignmentCommand";
import { SddCreateCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SddCreateCommand";
import { SddDispatchCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SddDispatchCommand";
import { SddFindingDismissCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SddFindingDismissCommand";
import { SddFindingFixCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SddFindingFixCommand";
import { SddNextCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SddNextCommand";
import { SddReviewCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SddReviewCommand";
import { SddReviewSubmitCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SddReviewSubmitCommand";
import { SddStartCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SddStartCommand";
import { SddTaskCreateCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SddTaskCreateCommand";
import { SddTaskSubmitCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SddTaskSubmitCommand";
import { SddTicketCommitCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SddTicketCommitCommand";
import { SddTicketCreateCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SddTicketCreateCommand";
import { SddTicketStartCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SddTicketStartCommand";
import { FeatureWorkspaceService } from "@spindle/SubagentDrivenDevelopment/Services/FeatureWorkspaceService";
import { TaskDispatchService } from "@spindle/SubagentDrivenDevelopment/Services/TaskDispatchService";
import { TicketCommitService } from "@spindle/SubagentDrivenDevelopment/Services/TicketCommitService";
import { TicketReviewService } from "@spindle/SubagentDrivenDevelopment/Services/TicketReviewService";
import { WorkGraphService } from "@spindle/SubagentDrivenDevelopment/Services/WorkGraphService";
import { WorktreeStartService } from "@spindle/SubagentDrivenDevelopment/Services/WorktreeStartService";

export class SubagentDrivenDevelopmentServiceProvider extends ServiceProvider {
  public static override commands(): readonly CommandConstructor[] {
    return [
      SddCreateCommand,
      SddNextCommand,
      SddTicketCreateCommand,
      SddTaskCreateCommand,
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
    ];
  }

  public register(): void {
    this.app.singleton(WorkGraphService);
    this.app.singleton(FeatureWorkspaceService);
    this.app.singleton(WorktreeStartService);
    this.app.singleton(TaskDispatchService);
    this.app.singleton(TicketCommitService);
    this.app.singleton(TicketReviewService);
  }

  public async boot(): Promise<void> {}
}
