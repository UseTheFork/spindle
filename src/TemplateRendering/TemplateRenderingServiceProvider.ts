import { ServiceProvider } from "@spindle/Foundation/ServiceProvider";
import { ComputedContextService } from "@spindle/TemplateRendering/Computed/ComputedContextService";

export class TemplateRenderingServiceProvider extends ServiceProvider {
  public register(): void {
    this.app.bind(ComputedContextService);
  }

  public async boot(): Promise<void> {}
}
