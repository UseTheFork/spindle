import type { ComputedVariableRegistry } from "@/BlueprintManagement/Computed/ComputedVariableProvider";
import { InternalSkillDescriptionProvider } from "@/BlueprintManagement/Computed/Providers/InternalSkillDescriptionProvider";

export const computedVariableProviders = {
  internal_skill_description: InternalSkillDescriptionProvider,
} satisfies ComputedVariableRegistry;
