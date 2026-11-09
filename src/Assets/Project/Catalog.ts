export interface ProjectAsset {
  readonly source: string;
  readonly destination: string;
}

export const projectCatalog = [
  { source: "templates/domain.md", destination: "docs/agents/domain.md" },
] satisfies readonly ProjectAsset[];
