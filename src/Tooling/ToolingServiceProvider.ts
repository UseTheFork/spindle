import type { CommandConstructor } from "@spindle/Commands/Command";
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
}
