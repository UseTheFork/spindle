import { InitCommand } from "@/commands/init/init-command";
import { SddCommand } from "@/commands/sdd/sdd-command";
import { SetupProjectCommand } from "@/commands/setup-project/setup-project-command";
import { UpdateCommand } from "@/commands/update/update-command";
import { ComputedContextService } from "@/computed/computed-context";
import { InstallationService } from "@/installation/installation-service";
import { BlueprintReconciliationService } from "@/reconciliation/blueprint-reconciliation-service";
import { ServiceProvider } from "@/services/ServiceProvider";

export class ProductionServiceProvider extends ServiceProvider {
  public register(): void {
    this.app.singleton(InitCommand);
    this.app.singleton(UpdateCommand);
    this.app.singleton(SddCommand);
    this.app.singleton(SetupProjectCommand);
    this.app.singleton(BlueprintReconciliationService);
    this.app.singleton(InstallationService);
    this.app.bind(ComputedContextService);
  }

  public async boot(): Promise<void> {}
}
