import { InitCommand } from "@/BlueprintManagement/Commands/InitCommand";
import { UpdateCommand } from "@/BlueprintManagement/Commands/UpdateCommand";
import { BlueprintReconciliationService } from "@/BlueprintManagement/Services/BlueprintReconciliationService";
import { InstallationService } from "@/BlueprintManagement/Services/InstallationService";
import type { CommandConstructor } from "@/Commands/Command";
import { ServiceProvider } from "@/Foundation/ServiceProvider";

export class BlueprintManagementServiceProvider extends ServiceProvider {
  public static override commands(): readonly CommandConstructor[] {
    return [InitCommand, UpdateCommand];
  }

  public register(): void {
    this.app.singleton(BlueprintReconciliationService);
    this.app.singleton(InstallationService);
  }

  public async boot(): Promise<void> {}
}
