export interface TemplateAsset {
  readonly source: string;
  readonly destination: string;
  readonly createOnce?: boolean;
}

export const templateCatalog = {
  project: [
    { source: "project/copilot-instructions.md", destination: ".github/copilot-instructions.md" },
    { source: "project/domain.md", destination: "docs/agents/domain.md" },
    { source: "project/ticket-tracker.md", destination: "docs/agents/ticket-tracker.md" },
    {
      source: "project/constitution.md",
      destination: "docs/agents/constitution.md",
      createOnce: true,
    },
  ] satisfies readonly TemplateAsset[],
  sdd: {
    spec: "sdd/spec.md",
    design: "sdd/design.md",
    ticket: "sdd/ticket.md",
  },
} as const;
