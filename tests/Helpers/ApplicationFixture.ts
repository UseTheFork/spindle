import { BlueprintManagementServiceProvider } from "@/BlueprintManagement/BlueprintManagementServiceProvider";
import { Application } from "@/Foundation/Application";
import { ProjectServiceProvider } from "@/Project/ProjectServiceProvider";
import type { ProjectSettingsState } from "@/Settings/Services/ProjectSettingsService";
import { SubagentDrivenDevelopmentServiceProvider } from "@/SubagentDrivenDevelopment/SubagentDrivenDevelopmentServiceProvider";
import { TemplateRenderingServiceProvider } from "@/TemplateRendering/TemplateRenderingServiceProvider";
import { ToolingServiceProvider } from "@/Tooling/ToolingServiceProvider";

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
