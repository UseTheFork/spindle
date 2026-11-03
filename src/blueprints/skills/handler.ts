import { join } from "node:path";

import { blueprintsRoot } from "../../install.js";
import type { BlueprintHandler } from "../types.js";
import { planVersionedUpdate, validateVersionedMetadata } from "../versioned.js";

export const skillHandler: BlueprintHandler = {
  kind: "Skill",
  catalogKind: "skills",
  sourceDirectory: () => join(blueprintsRoot(), "skills"),
  destinationDirectory: (githubDirectory) => join(githubDirectory, "skills"),
  validateMetadata: (relativePath, renderedText) =>
    validateVersionedMetadata("Skill", "SKILL.md", relativePath, renderedText),
  planUpdate: (input) =>
    planVersionedUpdate(input, "Skill", "SKILL.md", (target) => join(target, "SKILL.md"), "error"),
};
