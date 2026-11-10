import type { ComputedVariableRegistry } from "@/TemplateRendering/Computed/ComputedVariableProvider";
import { InternalSkillDescriptionProvider } from "@/TemplateRendering/Computed/Providers/InternalSkillDescriptionProvider";
import { SpindlePackageManagerProvider } from "@/TemplateRendering/Computed/Providers/SpindlePackageManagerProvider";

export const computedVariableProviders = {
  internal_skill_description: InternalSkillDescriptionProvider,
  spindle_package_manager: SpindlePackageManagerProvider,
} satisfies ComputedVariableRegistry;
