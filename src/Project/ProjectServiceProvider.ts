import type { CommandConstructor } from "@/Commands/Command";
import type { Application } from "@/Foundation/Application";
import { ServiceProvider } from "@/Foundation/ServiceProvider";
import { ProjectInitCommand } from "@/Project/Commands/ProjectInitCommand";
import { ToolingAddCommand } from "@/Project/Commands/ToolingAddCommand";
import { ToolingListCommand } from "@/Project/Commands/ToolingListCommand";
import { ToolingRemoveCommand } from "@/Project/Commands/ToolingRemoveCommand";
import { ToolingUpdateCommand } from "@/Project/Commands/ToolingUpdateCommand";
import { ProjectService } from "@/Project/Services/ProjectService";

export class ProjectServiceProvider extends ServiceProvider {
  public static override commands(): readonly CommandConstructor[] {
    return [
      ProjectInitCommand,
      ToolingListCommand,
      ToolingAddCommand,
      ToolingUpdateCommand,
      ToolingRemoveCommand,
    ];
  }

  public register(): void {
    this.app.singleton(
      ProjectService,
      (app: Application): ProjectService => new ProjectService(app),
    );
  }

  public async boot(): Promise<void> {}
}
