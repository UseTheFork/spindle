import { ServiceProvider } from "@spindle/Foundation/ServiceProvider";
import { VsCodeIntegrationService } from "@spindle/VsCodeIntegration/Services/VsCodeIntegrationService";

export class VsCodeIntegrationServiceProvider extends ServiceProvider {
  public register(): void {
    this.app.singleton(VsCodeIntegrationService);
  }

  public async boot(): Promise<void> {}
}
