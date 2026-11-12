import { join } from "node:path";

import type { BlueprintHandler } from "@/BlueprintManagement/Types/Blueprint";
import {
  planVersionedUpdate,
  validateVersionedMetadata,
} from "@/BlueprintManagement/Versioning/BlueprintVersioning";

export const skillHandler: BlueprintHandler = {
  kind: "Skill",
  catalogKind: "skills",
  sourceDirectory: (blueprintSourceRoot) => join(blueprintSourceRoot, "skills"),
  destinationDirectory: (githubDirectory) => join(githubDirectory, "skills"),
  validateMetadata: (relativePath, renderedText) =>
    validateVersionedMetadata("Skill", "SKILL.md", relativePath, renderedText),
  planUpdate: (input) =>
    planVersionedUpdate(input, "Skill", "SKILL.md", (target) => join(target, "SKILL.md")),
};
