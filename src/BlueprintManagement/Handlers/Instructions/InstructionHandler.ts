import { join } from "node:path";

import type { BlueprintHandler } from "@/BlueprintManagement/Types/Blueprint";
import {
  planVersionedUpdate,
  validateVersionedMetadata,
} from "@/BlueprintManagement/Versioning/BlueprintVersioning";

export const instructionHandler: BlueprintHandler = {
  kind: "Instruction",
  catalogKind: "instructions",
  sourceDirectory: (blueprintSourceRoot) => join(blueprintSourceRoot, "instructions"),
  destinationDirectory: (githubDirectory) => join(githubDirectory, "instructions"),
  fileTarget: true,
  targetPath: (destinationDirectory, name) => join(destinationDirectory, name),
  validateMetadata: (relativePath, renderedText) => {
    if (relativePath.toLowerCase().endsWith(".md")) {
      validateVersionedMetadata("Instruction", relativePath, relativePath, renderedText);
    }
  },
  planUpdate: (input) => {
    const entry = input.sourceFiles[0].outputPath;
    return entry.toLowerCase().endsWith(".md")
      ? planVersionedUpdate(input, "Instruction", entry, (target) => target)
      : Promise.resolve({ status: input.installed ? "conflict" : "new" });
  },
};
