import type { Application } from "@/foundation/Application";
import { Bootstrapper } from "@/foundation/bootstrap/Bootstrapper";
import { BlueprintSourceRoot } from "@/foundation/tokens";
import { resolveBlueprintSourceRoot } from "@/utilities/blueprint-source-root";

export class ResolveBlueprintSourceRoot extends Bootstrapper {
  public bootstrap(application: Application): void {
    application.instance(
      BlueprintSourceRoot,
      resolveBlueprintSourceRoot(application.workspaceRoot),
    );
  }
}
