import { ProjectSettingsService } from "@/Settings/Services/ProjectSettingsService";
import { ComputedVariableProvider } from "@/TemplateRendering/Computed/ComputedVariableProvider";

export class SpindlePackageManagerProvider extends ComputedVariableProvider {
  public render(): string {
    const { settings } = ProjectSettingsService.requireCurrent(this.app);
    if (settings.spindle_package_manager === undefined) {
      throw new Error(
        'Missing "spindle_package_manager" in Project Settings; run `spindle init` before rendering Blueprints.',
      );
    }
    return settings.spindle_package_manager;
  }
}
