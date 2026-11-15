import { BlueprintManagementServiceProvider } from "@spindle/BlueprintManagement/BlueprintManagementServiceProvider";
import { Application } from "@spindle/Foundation/Application";
import { ProjectServiceProvider } from "@spindle/Project/ProjectServiceProvider";
import type { ProjectSettingsState } from "@spindle/Settings/Services/ProjectSettingsService";
import { SubagentDrivenDevelopmentServiceProvider } from "@spindle/SubagentDrivenDevelopment/SubagentDrivenDevelopmentServiceProvider";
import { TemplateRenderingServiceProvider } from "@spindle/TemplateRendering/TemplateRenderingServiceProvider";
import { ToolingServiceProvider } from "@spindle/Tooling/ToolingServiceProvider";

export function applicationFixture(
  workspaceRoot: string,
  blueprintSourceRoot: string,
  projectSettings: ProjectSettingsState = { status: "absent" },
): Application {
  const application = new Application({ basePath: workspaceRoot });
  application.instance("path.workspace", workspaceRoot);
  application.instance("settings.project", projectSettings);
  const assetsPath = application.assetsPath.bind(application);
  Object.defineProperty(application, "assetsPath", {
    value: (path = "") => (path === "Blueprints" ? blueprintSourceRoot : assetsPath(path)),
  });
  application.register(TemplateRenderingServiceProvider);
  application.register(BlueprintManagementServiceProvider);
  application.register(ProjectServiceProvider);
  application.register(ToolingServiceProvider);
  application.register(SubagentDrivenDevelopmentServiceProvider);
  return application;
}
