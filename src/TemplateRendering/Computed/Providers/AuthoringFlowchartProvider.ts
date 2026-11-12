import { ComputedVariableProvider } from "@/TemplateRendering/Computed/ComputedVariableProvider";

export class AuthoringFlowchartProvider extends ComputedVariableProvider {
  public render(): string {
    return [
      "```mermaid",
      "flowchart TD",
      '    A["Read and consider only the `int-writing-for-agents` and `ref-asd-ste100` skills"]',
      '    A --> B["Use the `grill` skill on the user request"]',
      '    B --> C{"Shared understanding confirmed?"}',
      '    C -- "No" --> B',
      '    C -- "Yes" --> D["Load the remaining required skills"]',
      '    D --> E["Run the core and expanded baselines"]',
      '    E --> F{"Baseline shows a gap?"}',
      '    F -- "No" --> J["Report that no change is needed"]',
      '    F -- "Yes" --> G["Create or update the requested artifact"]',
      '    G --> H["Run the core and expanded retests"]',
      '    H --> I{"All criteria pass?"}',
      '    I -- "No" --> G',
      '    I -- "Yes" --> K["Report the artifact and validation"]',
      "```",
      "",
      "During the grill exchange, ask one question per turn and wait for the answer.",
      "Do not load other skills or announce the current flowchart step until the user confirms shared understanding.",
    ].join("\n");
  }
}
