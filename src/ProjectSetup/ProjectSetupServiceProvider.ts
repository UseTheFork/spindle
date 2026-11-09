import type { CommandConstructor } from "@/Commands/Command";
import type { Application } from "@/Foundation/Application";
import { ServiceProvider } from "@/Foundation/ServiceProvider";
import { SetupProjectCommand } from "@/ProjectSetup/Commands/SetupProjectCommand";
import { ProjectSetupService } from "@/ProjectSetup/Services/ProjectSetupService";

export class ProjectSetupServiceProvider extends ServiceProvider {
  public static override commands(): readonly CommandConstructor[] {
    return [SetupProjectCommand];
  }

  public register(): void {
    this.app.singleton(
      ProjectSetupService,
      (app: Application): ProjectSetupService => new ProjectSetupService(app),
    );
  }

  public async boot(): Promise<void> {}
}
