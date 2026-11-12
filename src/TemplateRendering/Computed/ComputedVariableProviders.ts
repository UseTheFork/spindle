import type { ComputedVariableRegistry } from "@/TemplateRendering/Computed/ComputedVariableProvider";
import { AuthoringFlowchartProvider } from "@/TemplateRendering/Computed/Providers/AuthoringFlowchartProvider";
import { CommitGuidanceProvider } from "@/TemplateRendering/Computed/Providers/CommitGuidanceProvider";
import { InternalSkillDescriptionProvider } from "@/TemplateRendering/Computed/Providers/InternalSkillDescriptionProvider";
import { SpindlePackageManagerProvider } from "@/TemplateRendering/Computed/Providers/SpindlePackageManagerProvider";

export const computedVariableProviders = {
  authoring_flowchart: AuthoringFlowchartProvider,
  commit_guidance: CommitGuidanceProvider,
  internal_skill_description: InternalSkillDescriptionProvider,
  spindle_package_manager: SpindlePackageManagerProvider,
} satisfies ComputedVariableRegistry;
