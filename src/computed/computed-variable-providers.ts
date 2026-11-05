import type { ComputedVariableRegistry } from "./provider.js";
import { InternalSkillDescriptionProvider } from "./providers/internal-skill-description.js";

export const computedVariableProviders = {
  internal_skill_description: InternalSkillDescriptionProvider,
} satisfies ComputedVariableRegistry;
