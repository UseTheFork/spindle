import { Application } from "@/foundation/Application";
import { BlueprintSourceRoot, WorkspaceRoot } from "@/foundation/tokens";
import { ProductionServiceProvider } from "@/services/ProductionServiceProvider";

export function applicationFixture(
  workspaceRoot: string,
  blueprintSourceRoot: string,
): Application {
  const application = new Application({ basePath: workspaceRoot });
  application.instance(WorkspaceRoot, workspaceRoot);
  application.instance(BlueprintSourceRoot, blueprintSourceRoot);
  application.register(ProductionServiceProvider);
  return application;
}
