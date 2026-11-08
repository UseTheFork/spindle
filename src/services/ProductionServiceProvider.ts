import type { CommandConstructor } from "@/Commands/Command";
import { InitCommand } from "@/Commands/init/init-command";
import { SetupProjectCommand } from "@/Commands/setup-project/setup-project-command";
import { UpdateCommand } from "@/Commands/update/update-command";
import { ComputedContextService } from "@/computed/computed-context";
import { InstallationService } from "@/installation/installation-service";
import { BlueprintReconciliationService } from "@/reconciliation/blueprint-reconciliation-service";
import { ServiceProvider } from "@/Foundation/ServiceProvider";

export class ProductionServiceProvider extends ServiceProvider {
  public static override commands(): readonly CommandConstructor[] {
    return [
      InitCommand,
      UpdateCommand,
      SetupProjectCommand,
    ];
  }

  public register(): void {
    this.app.singleton(BlueprintReconciliationService);
    this.app.singleton(InstallationService);
    this.app.bind(ComputedContextService);
  }

  public async boot(): Promise<void> {}
}
