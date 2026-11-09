import { ComputedVariableProvider } from "@/TemplateRendering/Computed/ComputedVariableProvider";

export class InternalSkillDescriptionProvider extends ComputedVariableProvider {
  public render(): string {
    return "This is an internal skill do not load it unless explicitly required by the user or another skill.";
  }
}
