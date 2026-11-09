export type ConflictPolicy = "overwrite" | "skip";

export interface PlannedBlueprintFile {
  sourcePath: string;
  outputPath: string;
}

export interface PreparedBlueprintFile extends PlannedBlueprintFile {
  renderedText: string | null;
}
