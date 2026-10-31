import type { RenderContext } from "../render.js";

export interface BlueprintHandler {
  kind: string;
  sourceDirectory(): string;
  destinationDirectory(githubDirectory: string): string;
  validateMetadata?(relativePath: string, renderedText: string): void;
  planUpdate?(input: {
    name: string;
    sourceFiles: { sourcePath: string; outputPath: string }[];
    target: string;
    installed: boolean;
    resolveContext(): Promise<RenderContext | undefined>;
  }): Promise<{
    status: "new" | "update" | "warning" | "up-to-date";
    warning?: string;
    installedVersion?: string;
    availableVersion?: string;
  }>;
}
