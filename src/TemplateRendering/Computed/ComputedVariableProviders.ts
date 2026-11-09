import type { ComputedVariableRegistry } from "@/TemplateRendering/Computed/ComputedVariableProvider";
import { InternalSkillDescriptionProvider } from "@/TemplateRendering/Computed/Providers/InternalSkillDescriptionProvider";

export const computedVariableProviders = {
  internal_skill_description: InternalSkillDescriptionProvider,
} satisfies ComputedVariableRegistry;
