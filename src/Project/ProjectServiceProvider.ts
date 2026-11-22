import type { Application } from "@spindle/Foundation/Application";
import type { ProjectLifecycleContext } from "@spindle/Foundation/ProjectLifecycleContext";
import { ServiceProvider } from "@spindle/Foundation/ServiceProvider";
import { PreparedProjectGuidance } from "@spindle/Project/Models/PreparedProjectGuidance";
import { ProjectService } from "@spindle/Project/Services/ProjectService";

export class ProjectServiceProvider extends ServiceProvider {
  public register(): void {
    this.app.singleton(
      ProjectService,
      (app: Application): ProjectService => new ProjectService(app),
    );
  }

  public async boot(): Promise<void> {}

  public override async beforeInit(context: ProjectLifecycleContext): Promise<void> {
    await this.prepareGuidance(context);
  }

  public override async beforeUpdate(context: ProjectLifecycleContext): Promise<void> {
    await this.prepareGuidance(context);
  }

  public override async afterInit(context: ProjectLifecycleContext): Promise<void> {
    await this.applyGuidance(context);
  }

  public override async afterUpdate(context: ProjectLifecycleContext): Promise<void> {
    await this.applyGuidance(context);
  }

  private async prepareGuidance(context: ProjectLifecycleContext): Promise<void> {
    const project = await this.app.make(ProjectService);
    context.instance(
      PreparedProjectGuidance,
      await project.prepare(context.settings, context.mode),
    );
  }

  private async applyGuidance(context: ProjectLifecycleContext): Promise<void> {
    const project = await this.app.make(ProjectService);
    context.recordChanges(await project.apply(await context.make(PreparedProjectGuidance)));
  }
}
