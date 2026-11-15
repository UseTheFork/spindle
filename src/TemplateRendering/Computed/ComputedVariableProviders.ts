import type { ComputedVariableRegistry } from "@/TemplateRendering/Computed/ComputedVariableProvider";
import { AuthoringFlowchartProvider } from "@/TemplateRendering/Computed/Providers/AuthoringFlowchartProvider";
import { CommitGuidanceProvider } from "@/TemplateRendering/Computed/Providers/CommitGuidanceProvider";
import { PrivateSkillDescriptionProvider } from "@/TemplateRendering/Computed/Providers/PrivateSkillDescriptionProvider";
import { SpindlePackageManagerProvider } from "@/TemplateRendering/Computed/Providers/SpindlePackageManagerProvider";

export const computedVariableProviders = {
  authoring_flowchart: AuthoringFlowchartProvider,
  commit_guidance: CommitGuidanceProvider,
  private_skill_description: PrivateSkillDescriptionProvider,
  spindle_package_manager: SpindlePackageManagerProvider,
} satisfies ComputedVariableRegistry;
