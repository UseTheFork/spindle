import type { CommandConstructor } from "@/Commands/Command";
import { ServiceProvider } from "@/Foundation/ServiceProvider";
import { ToolingAddCommand } from "@/Tooling/Commands/ToolingAddCommand";
import { ToolingListCommand } from "@/Tooling/Commands/ToolingListCommand";
import { ToolingRemoveCommand } from "@/Tooling/Commands/ToolingRemoveCommand";
import { ToolingUpdateCommand } from "@/Tooling/Commands/ToolingUpdateCommand";
import { ToolingService } from "@/Tooling/Services/ToolingService";

export class ToolingServiceProvider extends ServiceProvider {
  public static override commands(): readonly CommandConstructor[] {
    return [ToolingListCommand, ToolingAddCommand, ToolingUpdateCommand, ToolingRemoveCommand];
  }

  public register(): void {
    this.app.singleton(ToolingService);
  }

  public async boot(): Promise<void> {}
}
