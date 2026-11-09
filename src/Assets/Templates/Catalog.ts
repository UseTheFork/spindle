export interface TemplateAsset {
  readonly source: string;
  readonly destination: string;
}

export const templateCatalog = {
  project: [
    { source: "project/domain.md", destination: "docs/agents/domain.md" },
    { source: "project/ticket-tracker.md", destination: "docs/agents/ticket-tracker.md" },
  ] satisfies readonly TemplateAsset[],
  sdd: {
    spec: "sdd/spec.md",
    design: "sdd/design.md",
    ticket: "sdd/ticket.md",
  },
} as const;
