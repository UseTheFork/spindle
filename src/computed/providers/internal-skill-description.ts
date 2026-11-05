import { ComputedVariableProvider } from "../provider.js";

export class InternalSkillDescriptionProvider extends ComputedVariableProvider {
  render() {
    return "This is an internal skill do not load it unless explicitly required by the user or another skill.";
  }
}
