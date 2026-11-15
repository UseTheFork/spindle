import { join } from "node:path";

import type { BlueprintHandler } from "@/BlueprintManagement/Types/Blueprint";
import { BlueprintVersioning } from "@/BlueprintManagement/Versioning/BlueprintVersioning";

export const skillHandler: BlueprintHandler = {
  kind: "Skill",
  catalogKind: "skills",
  sourceDirectory: (blueprintSourceRoot) => join(blueprintSourceRoot, "skills"),
  destinationDirectory: (githubDirectory) => join(githubDirectory, "skills"),
  validateMetadata: (relativePath, renderedText) =>
    BlueprintVersioning.validateVersionedMetadata("Skill", "SKILL.md", relativePath, renderedText),
  planUpdate: (input) =>
    BlueprintVersioning.planVersionedUpdate(input, "Skill", "SKILL.md", (target) =>
      join(target, "SKILL.md"),
    ),
};
