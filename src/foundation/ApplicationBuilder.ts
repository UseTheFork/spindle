import type { Application, ServiceProviderConstructor } from "@/foundation/Application";
import { RegisterProviders } from "@/foundation/bootstrap/RegisterProviders";
import { Kernel } from "@/foundation/Kernel";

export class ApplicationBuilder {
  private kernelsRegistered = false;

  public constructor(private readonly application: Application) {}

  public withKernels(): this {
    if (!this.kernelsRegistered) {
      this.application.singleton(Kernel, (application) => new Kernel(application));
      this.kernelsRegistered = true;
    }
    return this;
  }

  public withProviders(
    providers: readonly (ServiceProviderConstructor | null | undefined)[] = [],
  ): this {
    RegisterProviders.merge(providers);
    return this;
  }

  public create(): Application {
    return this.application;
  }
}
