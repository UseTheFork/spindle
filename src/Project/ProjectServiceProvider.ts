import type { Application } from "@spindle/Foundation/Application";
import { ServiceProvider } from "@spindle/Foundation/ServiceProvider";
import { ProjectService } from "@spindle/Project/Services/ProjectService";

export class ProjectServiceProvider extends ServiceProvider {
  public register(): void {
    this.app.singleton(
      ProjectService,
      (app: Application): ProjectService => new ProjectService(app),
    );
  }

  public async boot(): Promise<void> {}
}
