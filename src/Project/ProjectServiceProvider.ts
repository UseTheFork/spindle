import type { Application } from "@/Foundation/Application";
import { ServiceProvider } from "@/Foundation/ServiceProvider";
import { ProjectService } from "@/Project/Services/ProjectService";

export class ProjectServiceProvider extends ServiceProvider {
  public register(): void {
    this.app.singleton(
      ProjectService,
      (app: Application): ProjectService => new ProjectService(app),
    );
  }

  public async boot(): Promise<void> {}
}
