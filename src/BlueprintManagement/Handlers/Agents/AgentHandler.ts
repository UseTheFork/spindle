import { join } from "node:path";

import type { BlueprintHandler } from "@spindle/BlueprintManagement/Types/Blueprint";
import { BlueprintVersioning } from "@spindle/BlueprintManagement/Versioning/BlueprintVersioning";

export const agentHandler: BlueprintHandler = {
  kind: "Agent",
  catalogKind: "agents",
  sourceDirectory: (blueprintSourceRoot) => join(blueprintSourceRoot, "agents"),
  destinationDirectory: (githubDirectory) => join(githubDirectory, "agents"),
  fileTarget: true,
  targetPath: (destinationDirectory, name) => join(destinationDirectory, name),
  validateMetadata: (relativePath, renderedText) => {
    if (relativePath.toLowerCase().endsWith(".md")) {
      BlueprintVersioning.validateVersionedMetadata(
        "Agent",
        relativePath,
        relativePath,
        renderedText,
      );
    }
  },
  planUpdate: (input) => {
    const entry = input.sourceFiles[0].outputPath;
    return entry.toLowerCase().endsWith(".md")
      ? BlueprintVersioning.planVersionedUpdate(input, "Agent", entry, (target) => target)
      : Promise.resolve({ status: input.installed ? "conflict" : "new" });
  },
};
