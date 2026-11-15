import type { ComputedVariableRegistry } from "@spindle/TemplateRendering/Computed/ComputedVariableProvider";
import { AuthoringFlowchartProvider } from "@spindle/TemplateRendering/Computed/Providers/AuthoringFlowchartProvider";
import { CommitGuidanceProvider } from "@spindle/TemplateRendering/Computed/Providers/CommitGuidanceProvider";
import { PrivateSkillDescriptionProvider } from "@spindle/TemplateRendering/Computed/Providers/PrivateSkillDescriptionProvider";
import { SpindlePackageManagerProvider } from "@spindle/TemplateRendering/Computed/Providers/SpindlePackageManagerProvider";

export const computedVariableProviders = {
  authoring_flowchart: AuthoringFlowchartProvider,
  commit_guidance: CommitGuidanceProvider,
  private_skill_description: PrivateSkillDescriptionProvider,
  spindle_package_manager: SpindlePackageManagerProvider,
} satisfies ComputedVariableRegistry;
