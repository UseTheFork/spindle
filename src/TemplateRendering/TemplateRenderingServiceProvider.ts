import { ServiceProvider } from "@/Foundation/ServiceProvider";
import { ComputedContextService } from "@/TemplateRendering/Computed/ComputedContextService";

export class TemplateRenderingServiceProvider extends ServiceProvider {
  public register(): void {
    this.app.bind(ComputedContextService);
  }

  public async boot(): Promise<void> {}
}
