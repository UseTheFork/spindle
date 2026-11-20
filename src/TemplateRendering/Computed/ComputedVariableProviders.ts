import type { ComputedVariableRegistry } from "@spindle/TemplateRendering/Computed/ComputedVariableProvider";
import { CommitGuidanceProvider } from "@spindle/TemplateRendering/Computed/Providers/CommitGuidanceProvider";
import { PrivateSkillDescriptionProvider } from "@spindle/TemplateRendering/Computed/Providers/PrivateSkillDescriptionProvider";
import { ProjectGuidanceProvider } from "@spindle/TemplateRendering/Computed/Providers/ProjectGuidanceProvider";
import { SkillUsageProvider } from "@spindle/TemplateRendering/Computed/Providers/SkillUsageProvider";
import { SpindlePackageManagerProvider } from "@spindle/TemplateRendering/Computed/Providers/SpindlePackageManagerProvider";
import { SubworkflowStepGuidanceProvider } from "@spindle/TemplateRendering/Computed/Providers/SubworkflowStepGuidanceProvider";
import { WorkflowStepGuidanceProvider } from "@spindle/TemplateRendering/Computed/Providers/WorkflowStepGuidanceProvider";

export const computedVariableProviders = {
  commit_guidance: CommitGuidanceProvider,
  private_skill_description: PrivateSkillDescriptionProvider,
  project_guidance: ProjectGuidanceProvider,
  skill_usage: SkillUsageProvider,
  spindle_package_manager: SpindlePackageManagerProvider,
  subworkflow_step_guidance: SubworkflowStepGuidanceProvider,
  workflow_step_guidance: WorkflowStepGuidanceProvider,
} satisfies ComputedVariableRegistry;
