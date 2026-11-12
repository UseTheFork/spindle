import { join } from "node:path";

import type { BlueprintHandler } from "@/BlueprintManagement/Types/Blueprint";
import {
  planVersionedUpdate,
  validateVersionedMetadata,
} from "@/BlueprintManagement/Versioning/BlueprintVersioning";

export const agentHandler: BlueprintHandler = {
  kind: "Agent",
  catalogKind: "agents",
  sourceDirectory: (blueprintSourceRoot) => join(blueprintSourceRoot, "agents"),
  destinationDirectory: (githubDirectory) => join(githubDirectory, "agents"),
  fileTarget: true,
  targetPath: (destinationDirectory, name) => join(destinationDirectory, name),
  validateMetadata: (relativePath, renderedText) => {
    if (relativePath.toLowerCase().endsWith(".md")) {
      validateVersionedMetadata("Agent", relativePath, relativePath, renderedText);
    }
  },
  planUpdate: (input) => {
    const entry = input.sourceFiles[0].outputPath;
    return entry.toLowerCase().endsWith(".md")
      ? planVersionedUpdate(input, "Agent", entry, (target) => target)
      : Promise.resolve({ status: input.installed ? "conflict" : "new" });
  },
};
