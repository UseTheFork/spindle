import type { Application } from "@/foundation/Application";
import { Bootstrapper } from "@/foundation/bootstrap/Bootstrapper";
import { resolveBlueprintSourceRoot } from "@/utilities/blueprint-source-root";

export class ResolveBlueprintSourceRoot extends Bootstrapper {
  public bootstrap(application: Application): void {
    application.instance("path.blueprints", resolveBlueprintSourceRoot(application.workspaceRoot));
  }
}
