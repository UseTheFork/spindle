import { ComputedVariableProvider } from "@spindle/TemplateRendering/Computed/ComputedVariableProvider";

export class SkillUsageProvider extends ComputedVariableProvider {
  public render(): string {
    return [
      "## Skill Usage",
      "",
      "- You MUST read and follow all skill requirements, ESPECIALLY those marked with `private-` prefixes.",
      "- You MUST NEVER read skills marked with the `private-` prefixes, unless explicitly instructed to do so by the user or another skill.",
      "- If you cannot load a required skill, name it and report the blocker. Do not guess its instructions or continue the work that depends on it.",
      "- A skill does not grant new permissions or override higher-priority instructions.",
    ].join("\n");
  }
}
