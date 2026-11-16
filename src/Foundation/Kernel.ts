import type { Application } from "@spindle/Foundation/Application";
import type { BootstrapperConstructor } from "@spindle/Foundation/Bootstrap/Bootstrapper";
import { DiscoverGitRoot } from "@spindle/Foundation/Bootstrap/DiscoverGitRoot";
import { LoadConsoleArgs } from "@spindle/Foundation/Bootstrap/LoadConsoleArgs";
import { LoadProjectSettings } from "@spindle/Foundation/Bootstrap/LoadProjectSettings";
import { RegisterProviders } from "@spindle/Foundation/Bootstrap/RegisterProviders";
import { RequireProjectSettings } from "@spindle/Foundation/Bootstrap/RequireProjectSettings";
import type { ConsoleInvocation } from "@spindle/Foundation/ConsoleInvocation";

export class Kernel {
  public constructor(public readonly app: Application) {}

  protected bootstrappers(): readonly BootstrapperConstructor[] {
    return [
      LoadConsoleArgs,
      DiscoverGitRoot,
      LoadProjectSettings,
      RequireProjectSettings,
      RegisterProviders,
    ];
  }

  public async bootstrap(): Promise<void> {
    await this.app.bootstrapWith(this.bootstrappers());
  }

  public async boot(invocation: ConsoleInvocation): Promise<void> {
    if (!this.app.bound("console.invocation")) {
      this.app.instance("console.invocation", invocation);
    }
    await this.bootstrap();
    await this.app.boot();
  }
}
