import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Application } from "@/Foundation/Application";
import { Bootstrapper } from "@/Foundation/Bootstrap/Bootstrapper";

export class ResolveBlueprintSourceRoot extends Bootstrapper {
  public static resolveBlueprintSourceRoot(): string {
    const adjacent = fileURLToPath(new URL("../../Blueprints/", import.meta.url));
    if (existsSync(join(adjacent, "skills"))) return adjacent;
    return fileURLToPath(new URL("../../../src/Blueprints/", import.meta.url));
  }

  public bootstrap(application: Application): void {
    application.instance(
      "path.blueprints",
      ResolveBlueprintSourceRoot.resolveBlueprintSourceRoot(),
    );
  }
}
