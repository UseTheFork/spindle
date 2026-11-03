import type { RenderContext } from "../render.js";
import type { CatalogKind, CatalogSelection } from "./catalog.js";

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

export interface BlueprintHandler {
  kind: string;
  catalogKind: CatalogKind;
  sourceDirectory(): string;
  destinationDirectory(githubDirectory: string): string;
  initialize?(
    githubDirectory: string,
    context: RenderContext,
    selections: CatalogSelection[],
  ): Promise<string[]>;
  fileTarget?: boolean;
  entryFile?: string;
  targetPath?(destinationDirectory: string, name: string): string;
  validateMetadata?(relativePath: string, renderedText: string): void;
  planUpdate?(input: BlueprintUpdateInput): Promise<BlueprintUpdatePlan>;
}
