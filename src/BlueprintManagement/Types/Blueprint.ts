import type {
  CatalogDeletion,
  CatalogKind,
  CatalogSelection,
} from "@/BlueprintManagement/Catalog/BlueprintCatalog";
import type { RenderContext } from "@/TemplateRendering/Rendering/RenderText";

export interface BlueprintUpdateInput {
  name: string;
  sourceFiles: { sourcePath: string; outputPath: string }[];
  target: string;
  installed: boolean;
  resolveContext(): Promise<RenderContext | undefined>;
}

export interface BlueprintUpdatePlan {
  status: "new" | "conflict" | "update" | "warning" | "up-to-date";
  warning?: string;
  installedVersion?: string;
  availableVersion?: string;
  versionedEntry?: { sourcePath: string; outputPath: string };
  renderedEntry?: {
    sourcePath: string;
    outputPath: string;
    sourceText: string;
    renderedText: string;
  };
}

export type ApplyPreparedBlueprintInitialization = (
  recordAppliedChange: (description: string) => void,
) => Promise<{ installed: string[]; removed: string[] }>;

export interface PreparedBlueprintInitialization {
  apply: ApplyPreparedBlueprintInitialization;
  dispose(): Promise<void>;
}

export interface BlueprintHandler {
  kind: string;
  catalogKind: CatalogKind;
  sourceDirectory(blueprintSourceRoot: string): string;
  destinationDirectory(githubDirectory: string): string;
  prepareInitialize?(
    githubDirectory: string,
    context: RenderContext,
    selections: CatalogSelection[],
    deletions: CatalogDeletion[],
  ): Promise<PreparedBlueprintInitialization>;
  fileTarget?: boolean;
  entryFile?: string;
  targetPath?(destinationDirectory: string, name: string): string;
  validateMetadata?(relativePath: string, renderedText: string): void;
  planUpdate?(input: BlueprintUpdateInput): Promise<BlueprintUpdatePlan>;
}
