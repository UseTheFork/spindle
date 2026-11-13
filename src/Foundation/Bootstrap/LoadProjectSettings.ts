import type { Application } from "@/Foundation/Application";
import { Bootstrapper } from "@/Foundation/Bootstrap/Bootstrapper";
import { ProjectSettingsService } from "@/Settings/Services/ProjectSettingsService";

export class LoadProjectSettings extends Bootstrapper {
  public async bootstrap(application: Application): Promise<void> {
    await ProjectSettingsService.refresh(application);
  }
}
