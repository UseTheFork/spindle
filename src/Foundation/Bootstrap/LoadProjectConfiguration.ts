import { loadProjectConfiguration } from "@/Config/ProjectConfiguration";
import type { Application } from "@/Foundation/Application";
import { Bootstrapper } from "@/Foundation/Bootstrap/Bootstrapper";

export class LoadProjectConfiguration extends Bootstrapper {
  public async bootstrap(application: Application): Promise<void> {
    application.instance(
      "config.project",
      await loadProjectConfiguration(application.path(".github/spindle.json")),
    );
  }
}
