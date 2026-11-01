import { join } from "node:path";

import { blueprintsRoot } from "../../install.js";
import type { BlueprintHandler } from "../types.js";
import { planVersionedUpdate, validateVersionedMetadata } from "../versioned.js";

export const instructionHandler: BlueprintHandler = {
  kind: "Instruction",
  sourceDirectory: () => join(blueprintsRoot(), "instructions"),
  destinationDirectory: (githubDirectory) => join(githubDirectory, "instructions"),
  entryFile: "INSTRUCTION.md",
  targetPath: (destinationDirectory, name) => join(destinationDirectory, `${name}.instructions.md`),
  validateMetadata: (relativePath, renderedText) =>
    validateVersionedMetadata("Instruction", "INSTRUCTION.md", relativePath, renderedText),
  planUpdate: (input) =>
    planVersionedUpdate(input, "Instruction", "INSTRUCTION.md", (target) => target, "warning"),
};
