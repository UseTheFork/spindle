import type { ProjectLifecycleContext } from "@spindle/Foundation/ProjectLifecycleContext";
import { ServiceProvider } from "@spindle/Foundation/ServiceProvider";
import { PreparedVsCodeIntegration } from "@spindle/VsCodeIntegration/Models/PreparedVsCodeIntegration";
import { VsCodeIntegrationService } from "@spindle/VsCodeIntegration/Services/VsCodeIntegrationService";

export class VsCodeIntegrationServiceProvider extends ServiceProvider {
  public register(): void {
    this.app.singleton(VsCodeIntegrationService);
  }

  public async boot(): Promise<void> {}

  public override async beforeInit(context: ProjectLifecycleContext): Promise<void> {
    await this.prepareIntegration(context);
  }

  public override async beforeUpdate(context: ProjectLifecycleContext): Promise<void> {
    await this.prepareIntegration(context);
  }

  public override async afterInit(context: ProjectLifecycleContext): Promise<void> {
    await this.applyIntegration(context);
  }

  public override async afterUpdate(context: ProjectLifecycleContext): Promise<void> {
    await this.applyIntegration(context);
  }

  private async prepareIntegration(context: ProjectLifecycleContext): Promise<void> {
    const service = await this.app.make(VsCodeIntegrationService);
    context.instance(PreparedVsCodeIntegration, await service.prepare(context.settings));
  }

  private async applyIntegration(context: ProjectLifecycleContext): Promise<void> {
    const service = await this.app.make(VsCodeIntegrationService);
    context.recordChanges(await service.apply(await context.make(PreparedVsCodeIntegration)));
  }
}
