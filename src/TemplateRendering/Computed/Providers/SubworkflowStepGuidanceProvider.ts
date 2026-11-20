import { ComputedVariableProvider } from "@spindle/TemplateRendering/Computed/ComputedVariableProvider";

export class SubworkflowStepGuidanceProvider extends ComputedVariableProvider {
  public render(): string {
    return "While following a subworkflow, announce each step as `Step <node ID> - <node label> (<subworkflow title>)`. Use the node ID and label from the active flowchart and the title of the subworkflow, not a generic section heading such as `Workflow`. Use this format for resumed steps and loop re-entries too. When you return to the parent workflow, use its announcement format again. All other workflow guidance still applies.";
  }
}
