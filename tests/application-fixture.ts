import { Application } from "@/Foundation/Application";
import { SubagentDrivenDevelopmentServiceProvider } from "@/SubagentDrivenDevelopment/SubagentDrivenDevelopmentServiceProvider";
import { ProductionServiceProvider } from "@/services/ProductionServiceProvider";

export function applicationFixture(
  workspaceRoot: string,
  blueprintSourceRoot: string,
): Application {
  const application = new Application({ basePath: workspaceRoot });
  application.instance("path.workspace", workspaceRoot);
  application.instance("path.blueprints", blueprintSourceRoot);
  application.register(ProductionServiceProvider);
  application.register(SubagentDrivenDevelopmentServiceProvider);
  return application;
}
