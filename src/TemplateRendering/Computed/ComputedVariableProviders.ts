import type { ComputedVariableRegistry } from "@spindle/TemplateRendering/Computed/ComputedVariableProvider";
import { BalancedModelProfileProvider } from "@spindle/TemplateRendering/Computed/Providers/BalancedModelProfileProvider";
import { CommitGuidanceProvider } from "@spindle/TemplateRendering/Computed/Providers/CommitGuidanceProvider";
import { DeepModelProfileProvider } from "@spindle/TemplateRendering/Computed/Providers/DeepModelProfileProvider";
import { FastModelProfileProvider } from "@spindle/TemplateRendering/Computed/Providers/FastModelProfileProvider";
import { PrivateSkillDescriptionProvider } from "@spindle/TemplateRendering/Computed/Providers/PrivateSkillDescriptionProvider";
import { ProjectGuidanceProvider } from "@spindle/TemplateRendering/Computed/Providers/ProjectGuidanceProvider";
import { SkillUsageProvider } from "@spindle/TemplateRendering/Computed/Providers/SkillUsageProvider";
import { SpindlePackageManagerProvider } from "@spindle/TemplateRendering/Computed/Providers/SpindlePackageManagerProvider";
import { SubworkflowStepGuidanceProvider } from "@spindle/TemplateRendering/Computed/Providers/SubworkflowStepGuidanceProvider";
import { WorkflowStepGuidanceProvider } from "@spindle/TemplateRendering/Computed/Providers/WorkflowStepGuidanceProvider";

export const computedVariableProviders = {
  model_balanced: BalancedModelProfileProvider,
  commit_guidance: CommitGuidanceProvider,
  model_deep: DeepModelProfileProvider,
  model_fast: FastModelProfileProvider,
  private_skill_description: PrivateSkillDescriptionProvider,
  project_guidance: ProjectGuidanceProvider,
  skill_usage: SkillUsageProvider,
  spindle_package_manager: SpindlePackageManagerProvider,
  subworkflow_step_guidance: SubworkflowStepGuidanceProvider,
  workflow_step_guidance: WorkflowStepGuidanceProvider,
} satisfies ComputedVariableRegistry;
