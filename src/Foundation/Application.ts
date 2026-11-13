import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { CommandConstructor } from "@/Commands/Command";
import { ApplicationBuilder } from "@/Foundation/ApplicationBuilder";
import { ApplicationConfiguration } from "@/Foundation/ApplicationConfiguration";
import type { BootstrapperConstructor } from "@/Foundation/Bootstrap/Bootstrapper";
import { Container } from "@/Foundation/Container";
import { FoundationServiceProvider } from "@/Foundation/FoundationServiceProvider";
import type { ServiceProvider } from "@/Foundation/ServiceProvider";
import { GitServiceProvider } from "@/Git/GitServiceProvider";

export type { ServiceConstructor } from "@/Foundation/Container";

export interface ApplicationOptions {
  basePath: string;
}

export type ServiceProviderConstructor<T extends ServiceProvider = ServiceProvider> = {
  new (app: Application): T;
  commands(): readonly CommandConstructor[];
};

export class Application extends Container {
  public readonly config = new ApplicationConfiguration();
  private readonly _basePath: string;
  private readonly providers = new Map<ServiceProviderConstructor, ServiceProvider>();
  private readonly commands = new Set<CommandConstructor>();
  private selectedBootstrapProviders: readonly ServiceProviderConstructor[] | undefined;
  private readonly bootableProviders: ServiceProvider[] = [];
  private bootstrapPromise: Promise<void> | undefined;
  private _hasBeenBootstrapped = false;
  private bootPromise: Promise<void> | undefined;
  private _hasBeenBooted = false;

  public constructor({ basePath }: ApplicationOptions) {
    super();
    this._basePath = resolve(basePath);
    this.instance("path.base", this._basePath);
    this.registerBaseBindings();
    this.registerBaseServiceProviders();
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

  public joinPaths(basePath: string, path = ""): string {
    if (path === "") return basePath;
    return isAbsolute(path) ? path : join(basePath, path);
  }

  public workspacePath(path = ""): string {
    return this.joinPaths(this.workspaceRoot, path);
  }

  public appPath(path = ""): string {
    return this.joinPaths(fileURLToPath(new URL("../", import.meta.url)), path);
  }

  public assetsPath(path = ""): string {
    return this.joinPaths(fileURLToPath(new URL("../../assets/", import.meta.url)), path);
  }

  public basePath(path = ""): string {
    return this.joinPaths(this._basePath, path);
  }

  public get workspaceRoot(): string {
    return this.stringValue("path.workspace");
  }

  public get hasBeenBootstrapped(): boolean {
    return this._hasBeenBootstrapped;
  }

  public get hasBeenBooted(): boolean {
    return this._hasBeenBooted;
  }

  public selectBootstrapProviders(providers: readonly ServiceProviderConstructor[]): void {
    this.selectedBootstrapProviders = [...new Set(providers)];
  }

  public bootstrapProviders(
    fallback: readonly ServiceProviderConstructor[],
  ): readonly ServiceProviderConstructor[] {
    return this.selectedBootstrapProviders ?? fallback;
  }

  public register(Provider: ServiceProviderConstructor): void {
    if (this.providers.has(Provider)) return;
    const provider = new Provider(this);
    this.providers.set(Provider, provider);
    for (const Command of Provider.commands()) {
      if (!this.commands.has(Command)) {
        this.singleton(Command);
        this.commands.add(Command);
      }
    }
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
      this._hasBeenBooted = true;
    });
    await this.bootPromise;
  }

  private registerBaseBindings(): void {
    this.instance("app", this);
    this.instance(Application, this);
    this.instance(Container, this);
  }

  private registerBaseServiceProviders(): void {
    this.register(FoundationServiceProvider);
    this.register(GitServiceProvider);
  }

  private stringValue(key: string): string {
    const value = this.value(key);
    if (typeof value !== "string") {
      throw new Error(`Application path '${key}' must be a string.`);
    }
    return value;
  }
}
