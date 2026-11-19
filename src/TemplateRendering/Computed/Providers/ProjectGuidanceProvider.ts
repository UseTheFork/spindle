import { ComputedVariableProvider } from "@spindle/TemplateRendering/Computed/ComputedVariableProvider";

export class ProjectGuidanceProvider extends ComputedVariableProvider {
  public render(): string {
    return [
      "## Project Guidance",
      "",
      "- Before starting your assignment, read and follow `docs/agents/constitution.md` and `docs/agents/tooling.md`.",
    ].join("\n");
  }
}
