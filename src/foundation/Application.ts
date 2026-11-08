import { resolve } from "node:path";

import { Config } from "@/config/Config";
import { ApplicationBuilder } from "@/foundation/ApplicationBuilder";
import type { BootstrapperConstructor } from "@/foundation/bootstrap/Bootstrapper";
import { Container } from "@/foundation/Container";
import type { ServiceProvider } from "@/services/ServiceProvider";

export type { ServiceConstructor } from "@/foundation/Container";

export interface ApplicationOptions {
  basePath: string;
}

export type ServiceProviderConstructor<T extends ServiceProvider = ServiceProvider> = new (
  app: Application,
) => T;

export class Application extends Container {
  public readonly config = new Config();
  private readonly _basePath: string;
  private readonly providers = new Map<ServiceProviderConstructor, ServiceProvider>();
  private readonly bootableProviders: ServiceProvider[] = [];
  private bootstrapPromise: Promise<void> | undefined;
  private _hasBeenBootstrapped = false;
  private bootPromise: Promise<void> | undefined;

  public constructor({ basePath }: ApplicationOptions) {
    super();
    this._basePath = resolve(basePath);
    this.instance("path.base", this._basePath);
  }

  protected override get owner(): Application {
    return this;
  }

  public static configure(
    basePath: string,
    providers: readonly ServiceProviderConstructor[] = [],
  ): ApplicationBuilder {
    return new ApplicationBuilder(new Application({ basePath }))
      .withKernels()
      .withProviders(providers);
  }

  public get basePath(): string {
    return this.stringValue("path.base");
  }

  public get workspaceRoot(): string {
    return this.stringValue("path.workspace");
  }

  public get blueprintSourceRoot(): string {
    return this.stringValue("path.blueprints");
  }

  public get hasBeenBootstrapped(): boolean {
    return this._hasBeenBootstrapped;
  }

  public register(Provider: ServiceProviderConstructor): void {
    if (this.providers.has(Provider)) return;
    const provider = new Provider(this);
    this.providers.set(Provider, provider);
    provider.register();
    this.bootableProviders.push(provider);
  }

  public async bootstrapWith(bootstrappers: readonly BootstrapperConstructor[]): Promise<void> {
    if (!this.bootstrapPromise) {
      const constructors = [...bootstrappers];
      this.bootstrapPromise = Promise.resolve().then(async () => {
        for (const Bootstrapper of constructors) await new Bootstrapper().bootstrap(this);
        this._hasBeenBootstrapped = true;
      });
    }
    await this.bootstrapPromise;
  }

  public async boot(): Promise<void> {
    this.bootPromise ??= Promise.resolve().then(async () => {
      for (const provider of this.bootableProviders) await provider.boot();
    });
    await this.bootPromise;
  }

  private stringValue(key: string): string {
    const value = this.value(key);
    if (typeof value !== "string") {
      throw new Error(`Application path '${key}' must be a string.`);
    }
    return value;
  }
}
