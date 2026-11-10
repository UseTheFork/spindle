import type { Application, ServiceProviderConstructor } from "@/Foundation/Application";
import { Bootstrapper } from "@/Foundation/Bootstrap/Bootstrapper";

export class RegisterProviders extends Bootstrapper {
  private static providers: ServiceProviderConstructor[] = [];

  public static merge(providers: readonly (ServiceProviderConstructor | null | undefined)[]): void {
    this.providers = [...new Set(providers.filter((provider) => provider != null))];
  }

  public bootstrap(application: Application): void {
    for (const Provider of application.bootstrapProviders(RegisterProviders.providers)) {
      application.register(Provider);
    }
  }
}
