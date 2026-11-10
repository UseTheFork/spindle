import { ComputedVariableProvider } from "@/TemplateRendering/Computed/ComputedVariableProvider";

export class SpindlePackageManagerProvider extends ComputedVariableProvider {
  public render(): string | undefined {
    return this.inputs.variables.spindle_package_manager;
  }
}
