import type { ModelProfileName } from "@spindle/Settings/Models/ModelSettings";
import { ProjectSettingsService } from "@spindle/Settings/Services/ProjectSettingsService";
import { ComputedVariableProvider } from "@spindle/TemplateRendering/Computed/ComputedVariableProvider";

export abstract class ModelProfileProvider extends ComputedVariableProvider {
  protected abstract readonly profile: ModelProfileName;

  public render(): string | undefined {
    const state = ProjectSettingsService.current(this.app);
    if (state.status === "absent") return undefined;
    if (state.status === "invalid") throw new Error(state.reason, { cause: state.error });
    if (!state.data.models.enabled) return undefined;
    return JSON.stringify(state.data.models.profiles[this.profile]);
  }
}
