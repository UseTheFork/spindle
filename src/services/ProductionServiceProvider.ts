import type { CommandConstructor } from "@/commands/Command";
import { InitCommand } from "@/commands/init/init-command";
import { SetupProjectCommand } from "@/commands/setup-project/setup-project-command";
import { UpdateCommand } from "@/commands/update/update-command";
import { ComputedContextService } from "@/computed/computed-context";
import { InstallationService } from "@/installation/installation-service";
import { BlueprintReconciliationService } from "@/reconciliation/blueprint-reconciliation-service";
import { ServiceProvider } from "@/services/ServiceProvider";
import { SubagentDrivenDevelopmentServiceProvider } from "@/SubagentDrivenDevelopment/SubagentDrivenDevelopmentServiceProvider";

export class ProductionServiceProvider extends ServiceProvider {
  public static override commands(): readonly CommandConstructor[] {
    return [
      InitCommand,
      UpdateCommand,
      ...SubagentDrivenDevelopmentServiceProvider.commands(),
      SetupProjectCommand,
    ];
  }

  public register(): void {
    this.app.register(SubagentDrivenDevelopmentServiceProvider);
    this.app.singleton(BlueprintReconciliationService);
    this.app.singleton(InstallationService);
    this.app.bind(ComputedContextService);
  }

  public async boot(): Promise<void> {}
}
