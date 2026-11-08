import { resolve } from "node:path";

import { Config } from "@/config/Config";
import { ApplicationBuilder } from "@/foundation/ApplicationBuilder";
import type { BootstrapperConstructor } from "@/foundation/bootstrap/Bootstrapper";
import { Container, type Key, type ValueToken } from "@/foundation/Container";
import { BlueprintSourceRoot, WorkspaceRoot } from "@/foundation/tokens";
import type { ServiceProvider } from "@/services/ServiceProvider";

export type { ServiceConstructor } from "@/foundation/Container";

export interface ApplicationOptions {
  basePath: string;
}

export type ServiceProviderConstructor<T extends ServiceProvider = ServiceProvider> = new (
  app: Application,
) => T;

export class Application {
  public readonly config = new Config();
  public readonly container = new Container(this);
  public readonly bind = this.container.bind.bind(this.container);
  public readonly singleton = this.container.singleton.bind(this.container);
  private readonly _basePath: string;
  private readonly providers = new Map<ServiceProviderConstructor, ServiceProvider>();
  private readonly bootableProviders: ServiceProvider[] = [];
  private bootstrapPromise: Promise<void> | undefined;
  private _hasBeenBootstrapped = false;
  private bootPromise: Promise<void> | undefined;

  public constructor({ basePath }: ApplicationOptions) {
    this._basePath = resolve(basePath);
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
    return this._basePath;
  }

  public get workspaceRoot(): string {
    return this.value(WorkspaceRoot);
  }

  public get blueprintSourceRoot(): string {
    return this.value(BlueprintSourceRoot);
  }

  public get hasBeenBootstrapped(): boolean {
    return this._hasBeenBootstrapped;
  }

  public instance<T>(key: Key<T>, value: NoInfer<T>): void {
    this.container.instance(key, value);
  }

  public bound<T>(key: Key<T>): boolean {
    return this.container.bound(key);
  }

  public make<T>(key: Key<T>): Promise<T> {
    return this.container.make(key);
  }

  public value<T>(key: ValueToken<T>): T {
    return this.container.value(key);
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
}
