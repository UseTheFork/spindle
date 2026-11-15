import type { Application } from "@spindle/Foundation/Application";
import { Bootstrapper } from "@spindle/Foundation/Bootstrap/Bootstrapper";
import { ProjectSettingsService } from "@spindle/Settings/Services/ProjectSettingsService";

export class LoadProjectSettings extends Bootstrapper {
  public async bootstrap(application: Application): Promise<void> {
    await ProjectSettingsService.refresh(application);
  }
}
