import { ComputedVariableProvider } from "@/TemplateRendering/Computed/ComputedVariableProvider";

export class PrivateSkillDescriptionProvider extends ComputedVariableProvider {
  public render(): string {
    return "This is a private skill do not load it unless explicitly required by the user or another skill.";
  }
}
