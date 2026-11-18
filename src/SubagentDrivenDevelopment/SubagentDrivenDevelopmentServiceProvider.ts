import { ServiceProvider } from "@spindle/Foundation/ServiceProvider";
import { WorkGraphService } from "@spindle/SubagentDrivenDevelopment/Services/WorkGraphService";

export class SubagentDrivenDevelopmentServiceProvider extends ServiceProvider {
  public register(): void {
    this.app.singleton(WorkGraphService);
  }

  public async boot(): Promise<void> {}
}
