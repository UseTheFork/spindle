import type { Application } from "@/Foundation/Application";
import type { BootstrapperConstructor } from "@/Foundation/Bootstrap/Bootstrapper";
import { DiscoverGitRoot } from "@/Foundation/Bootstrap/DiscoverGitRoot";
import { LoadConsoleArgs } from "@/Foundation/Bootstrap/LoadConsoleArgs";
import { LoadProjectSettings } from "@/Foundation/Bootstrap/LoadProjectSettings";
import { RegisterProviders } from "@/Foundation/Bootstrap/RegisterProviders";
import { RequireProjectSettings } from "@/Foundation/Bootstrap/RequireProjectSettings";
import type { ConsoleInvocation } from "@/Foundation/ConsoleInvocation";

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
