import { loadProjectConfiguration } from "@/config/ProjectConfiguration";
import type { Application } from "@/foundation/Application";
import { Bootstrapper } from "@/foundation/bootstrap/Bootstrapper";

export class LoadProjectConfiguration extends Bootstrapper {
  public async bootstrap(application: Application): Promise<void> {
    application.instance(
      "config.project",
      await loadProjectConfiguration(application.path(".github/spindle.json")),
    );
  }
}
