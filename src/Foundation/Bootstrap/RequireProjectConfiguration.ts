import type { Application } from "@/Foundation/Application";
import { Bootstrapper } from "@/Foundation/Bootstrap/Bootstrapper";
import { LoadProjectConfiguration } from "@/Foundation/Bootstrap/LoadProjectConfiguration";
import { Repository } from "@/Support/Repository";

export class RequireProjectConfiguration extends Bootstrapper {
  public bootstrap(application: Application): void {
    const args = application.value("console.args");
    if (!(args instanceof Repository)) {
      throw new Error("Console arguments must be loaded before requiring project Config.");
    }
    if (args.array("commandPath")[0] === "init") return;
    LoadProjectConfiguration.requireCurrent(application);
  }
}
