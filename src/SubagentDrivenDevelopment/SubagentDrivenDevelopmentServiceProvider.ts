import type { CommandConstructor } from "@spindle/Commands/Command";
import { ServiceProvider } from "@spindle/Foundation/ServiceProvider";
import { SddCreateCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SddCreateCommand";
import { SddNextCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SddNextCommand";
import { FeatureWorkspaceService } from "@spindle/SubagentDrivenDevelopment/Services/FeatureWorkspaceService";
import { WorkGraphService } from "@spindle/SubagentDrivenDevelopment/Services/WorkGraphService";

export class SubagentDrivenDevelopmentServiceProvider extends ServiceProvider {
  public static override commands(): readonly CommandConstructor[] {
    return [SddCreateCommand, SddNextCommand];
  }

  public register(): void {
    this.app.singleton(WorkGraphService);
    this.app.singleton(FeatureWorkspaceService);
  }

  public async boot(): Promise<void> {}
}
