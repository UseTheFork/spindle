import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Application } from "@/foundation/Application";
import { Bootstrapper } from "@/foundation/bootstrap/Bootstrapper";

export class ResolveBlueprintSourceRoot extends Bootstrapper {
  public static resolveBlueprintSourceRoot(): string {
    const adjacent = fileURLToPath(new URL("../../blueprints/", import.meta.url));
    if (existsSync(join(adjacent, "skills"))) return adjacent;
    return fileURLToPath(new URL("../../../src/blueprints/", import.meta.url));
  }

  public bootstrap(application: Application): void {
    application.instance(
      "path.blueprints",
      ResolveBlueprintSourceRoot.resolveBlueprintSourceRoot(),
    );
  }
}
