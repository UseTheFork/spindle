import { InitCommand } from "@spindle/BlueprintManagement/Commands/InitCommand";
import { UpdateCommand } from "@spindle/BlueprintManagement/Commands/UpdateCommand";
import { BlueprintLifecycleService } from "@spindle/BlueprintManagement/Services/BlueprintLifecycleService";
import { BlueprintReconciliationService } from "@spindle/BlueprintManagement/Services/BlueprintReconciliationService";
import { InstallationService } from "@spindle/BlueprintManagement/Services/InstallationService";
import type { CommandConstructor } from "@spindle/Commands/Command";
import { ServiceProvider } from "@spindle/Foundation/ServiceProvider";

export class BlueprintManagementServiceProvider extends ServiceProvider {
  public static override commands(): readonly CommandConstructor[] {
    return [InitCommand, UpdateCommand];
  }

  public register(): void {
    this.app.singleton(BlueprintLifecycleService);
    this.app.singleton(BlueprintReconciliationService);
    this.app.singleton(InstallationService);
  }

  public async boot(): Promise<void> {}
}
