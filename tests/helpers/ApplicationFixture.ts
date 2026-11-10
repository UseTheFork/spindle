import { BlueprintManagementServiceProvider } from "@/BlueprintManagement/BlueprintManagementServiceProvider";
import { Application } from "@/Foundation/Application";
import { ProjectServiceProvider } from "@/Project/ProjectServiceProvider";
import { SubagentDrivenDevelopmentServiceProvider } from "@/SubagentDrivenDevelopment/SubagentDrivenDevelopmentServiceProvider";
import { TemplateRenderingServiceProvider } from "@/TemplateRendering/TemplateRenderingServiceProvider";
import { ToolingServiceProvider } from "@/Tooling/ToolingServiceProvider";

export function applicationFixture(
  workspaceRoot: string,
  blueprintSourceRoot: string,
): Application {
  const application = new Application({ basePath: workspaceRoot });
  application.instance("path.workspace", workspaceRoot);
  application.instance("path.blueprints", blueprintSourceRoot);
  application.register(TemplateRenderingServiceProvider);
  application.register(BlueprintManagementServiceProvider);
  application.register(ProjectServiceProvider);
  application.register(ToolingServiceProvider);
  application.register(SubagentDrivenDevelopmentServiceProvider);
  return application;
}
