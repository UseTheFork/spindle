import { LoadProjectConfiguration } from "@/Foundation/Bootstrap/LoadProjectConfiguration";
import { ComputedVariableProvider } from "@/TemplateRendering/Computed/ComputedVariableProvider";

export class SpindlePackageManagerProvider extends ComputedVariableProvider {
  public render(): string {
    const { config } = LoadProjectConfiguration.requireCurrent(this.app);
    if (config.spindle_package_manager === undefined) {
      throw new Error(
        'Missing "spindle_package_manager" in project Config; run `spindle init` before rendering Blueprints.',
      );
    }
    return config.spindle_package_manager;
  }
}
