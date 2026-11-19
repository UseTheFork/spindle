import { ComputedVariableProvider } from "@spindle/TemplateRendering/Computed/ComputedVariableProvider";

export class WorkflowStepGuidanceProvider extends ComputedVariableProvider {
  public render(): string {
    return "Before acting on each node, announce `Step <node ID> - <node label>`. Announce resumed steps and loop re-entries. After each decision, state its result and selected branch before entering the next node. Select the mode from the calling context before entering A.";
  }
}
