import { Application } from "./Application.js";
import type { BootstrapperConstructor } from "./bootstrap/Bootstrapper.js";
import { RegisterProviders } from "./bootstrap/RegisterProviders.js";

export class Kernel {
  public constructor(public readonly app: Application) {}

  protected bootstrappers(): readonly BootstrapperConstructor[] {
    return [RegisterProviders];
  }

  public async bootstrap(): Promise<void> {
    await this.app.bootstrapWith(this.bootstrappers());
  }

  public async boot(): Promise<void> {
    await this.bootstrap();
    await this.app.boot();
  }
}
