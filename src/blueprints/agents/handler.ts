import { join } from "node:path";

import { blueprintsRoot } from "../../install.js";
import type { BlueprintHandler } from "../types.js";
import { planVersionedUpdate, validateVersionedMetadata } from "../versioned.js";

export const agentHandler: BlueprintHandler = {
  kind: "Agent",
  sourceDirectory: () => join(blueprintsRoot(), "agents"),
  destinationDirectory: (githubDirectory) => join(githubDirectory, "agents"),
  entryFile: "AGENT.md",
  targetPath: (destinationDirectory, name) => join(destinationDirectory, `${name}.agent.md`),
  validateMetadata: (relativePath, renderedText) =>
    validateVersionedMetadata("Agent", "AGENT.md", relativePath, renderedText),
  planUpdate: (input) =>
    planVersionedUpdate(input, "Agent", "AGENT.md", (target) => target, "warning"),
};
