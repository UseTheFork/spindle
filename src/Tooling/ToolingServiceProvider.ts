import type { CommandConstructor } from "@spindle/Commands/Command";
import type { ProjectLifecycleContext } from "@spindle/Foundation/ProjectLifecycleContext";
import { ServiceProvider } from "@spindle/Foundation/ServiceProvider";
import { ToolingAddCommand } from "@spindle/Tooling/Commands/ToolingAddCommand";
import { ToolingListCommand } from "@spindle/Tooling/Commands/ToolingListCommand";
import { ToolingRemoveCommand } from "@spindle/Tooling/Commands/ToolingRemoveCommand";
import { ToolingUpdateCommand } from "@spindle/Tooling/Commands/ToolingUpdateCommand";
import { ToolingService } from "@spindle/Tooling/Services/ToolingService";

export class ToolingServiceProvider extends ServiceProvider {
  public static override commands(): readonly CommandConstructor[] {
    return [ToolingListCommand, ToolingAddCommand, ToolingUpdateCommand, ToolingRemoveCommand];
  }

  public register(): void {
    this.app.singleton(ToolingService);
  }

  public async boot(): Promise<void> {}

  public override async beforeInit(_context: ProjectLifecycleContext): Promise<void> {
    await this.prepareTooling();
  }

  public override async beforeUpdate(_context: ProjectLifecycleContext): Promise<void> {
    await this.prepareTooling();
  }

  public override async afterInit(context: ProjectLifecycleContext): Promise<void> {
    await this.initializeTooling(context);
  }

  public override async afterUpdate(context: ProjectLifecycleContext): Promise<void> {
    await this.initializeTooling(context);
  }

  private async prepareTooling(): Promise<void> {
    (await this.app.make(ToolingService)).prepare();
  }

  private async initializeTooling(context: ProjectLifecycleContext): Promise<void> {
    context.recordChanges(await (await this.app.make(ToolingService)).initialize(context.settings));
  }
}
