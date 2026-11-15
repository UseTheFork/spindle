import type { Application } from "@spindle/Foundation/Application";
import { Bootstrapper } from "@spindle/Foundation/Bootstrap/Bootstrapper";
import { ProjectSettingsService } from "@spindle/Settings/Services/ProjectSettingsService";
import { Repository } from "@spindle/Support/Repository";

export class RequireProjectSettings extends Bootstrapper {
  public bootstrap(application: Application): void {
    const args = application.value("console.args");
    if (!(args instanceof Repository)) {
      throw new Error("Console arguments must be loaded before requiring Project Settings.");
    }
    if (args.array("commandPath")[0] === "init") return;
    ProjectSettingsService.requireCurrent(application);
  }
}
