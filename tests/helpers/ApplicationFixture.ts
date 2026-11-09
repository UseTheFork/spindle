import { BlueprintManagementServiceProvider } from "@/BlueprintManagement/BlueprintManagementServiceProvider";
import { Application } from "@/Foundation/Application";
import { ProjectSetupServiceProvider } from "@/ProjectSetup/ProjectSetupServiceProvider";
import { SubagentDrivenDevelopmentServiceProvider } from "@/SubagentDrivenDevelopment/SubagentDrivenDevelopmentServiceProvider";

export function applicationFixture(
  workspaceRoot: string,
  blueprintSourceRoot: string,
): Application {
  const application = new Application({ basePath: workspaceRoot });
  application.instance("path.workspace", workspaceRoot);
  application.instance("path.blueprints", blueprintSourceRoot);
  application.register(BlueprintManagementServiceProvider);
  application.register(ProjectSetupServiceProvider);
  application.register(SubagentDrivenDevelopmentServiceProvider);
  return application;
}
