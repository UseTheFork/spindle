import type { CommandConstructor } from "@spindle/Commands/Command";
import { ServiceProvider } from "@spindle/Foundation/ServiceProvider";
import { SddCreateCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SddCreateCommand";
import { SddNextCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SddNextCommand";
import { SddStartCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SddStartCommand";
import { SddTaskCreateCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SddTaskCreateCommand";
import { SddTicketCreateCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SddTicketCreateCommand";
import { SddTicketStartCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SddTicketStartCommand";
import { FeatureWorkspaceService } from "@spindle/SubagentDrivenDevelopment/Services/FeatureWorkspaceService";
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
    ];
  }

  public register(): void {
    this.app.singleton(WorkGraphService);
    this.app.singleton(FeatureWorkspaceService);
    this.app.singleton(WorktreeStartService);
  }

  public async boot(): Promise<void> {}
}
