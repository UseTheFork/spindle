import type { Application } from "@/foundation/Application";
import type { BootstrapperConstructor } from "@/foundation/bootstrap/Bootstrapper";
import { DiscoverGitRoot } from "@/foundation/bootstrap/DiscoverGitRoot";
import { LoadConsoleArgs } from "@/foundation/bootstrap/LoadConsoleArgs";
import { RegisterProviders } from "@/foundation/bootstrap/RegisterProviders";
import { ResolveBlueprintSourceRoot } from "@/foundation/bootstrap/ResolveBlueprintSourceRoot";
import { Invocation, type ConsoleInvocation } from "@/foundation/tokens";

export class Kernel {
  public constructor(public readonly app: Application) {}

  protected bootstrappers(): readonly BootstrapperConstructor[] {
    return [LoadConsoleArgs, DiscoverGitRoot, ResolveBlueprintSourceRoot, RegisterProviders];
  }

  public async bootstrap(): Promise<void> {
    await this.app.bootstrapWith(this.bootstrappers());
  }

  public async boot(invocation: ConsoleInvocation): Promise<void> {
    if (!this.app.bound(Invocation)) this.app.instance(Invocation, invocation);
    await this.bootstrap();
    await this.app.boot();
  }
}
