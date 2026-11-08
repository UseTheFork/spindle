import { AsyncLocalStorage } from "node:async_hooks";

import { Config } from "../config/Config.js";
import { bootService, type Service } from "../services/Service.js";
import type { ServiceProvider } from "../services/ServiceProvider.js";
import type { BootstrapperConstructor } from "./bootstrap/Bootstrapper.js";

export interface ApplicationOptions {
  workspaceRoot: string;
  blueprintSourceRoot: string;
  readonly providers?: readonly ServiceProviderConstructor[];
}

export type ServiceConstructor<T extends Service = Service> = new (app: Application) => T;
export type ServiceProviderConstructor<T extends ServiceProvider = ServiceProvider> = new (
  app: Application,
) => T;

interface ServiceToken {
  constructor: ServiceConstructor;
  dependencies: Map<ServiceToken, number>;
}

interface InFlightService {
  token: ServiceToken;
  promise: Promise<Service>;
}

function serviceName(constructor: ServiceConstructor): string {
  return constructor.name || "<anonymous service>";
}

export class Application {
  public readonly config = new Config();
  private readonly _workspaceRoot: string;
  private readonly _blueprintSourceRoot: string;
  private readonly services = new Map<ServiceConstructor, Service>();
  private readonly inFlight = new Map<ServiceConstructor, InFlightService>();
  private readonly resolution = new AsyncLocalStorage<readonly ServiceToken[]>();
  private readonly providers: readonly ServiceProvider[];
  private registrationState: "pending" | "registering" | "registered" | "failed" = "pending";
  private registrationFailure: unknown;
  private bootstrapPromise: Promise<void> | undefined;
  private _hasBeenBootstrapped = false;
  private bootPromise: Promise<void> | undefined;

  public constructor({ workspaceRoot, blueprintSourceRoot, providers = [] }: ApplicationOptions) {
    this._workspaceRoot = workspaceRoot;
    this._blueprintSourceRoot = blueprintSourceRoot;
    this.providers = providers.map((Provider) => new Provider(this));
  }

  public get workspaceRoot(): string {
    return this._workspaceRoot;
  }

  public get blueprintSourceRoot(): string {
    return this._blueprintSourceRoot;
  }

  public get hasBeenBootstrapped(): boolean {
    return this._hasBeenBootstrapped;
  }

  public async bootstrapWith(bootstrappers: readonly BootstrapperConstructor[]): Promise<void> {
    if (!this.bootstrapPromise) {
      const constructors = [...bootstrappers];
      this.bootstrapPromise = Promise.resolve().then(async () => {
        for (const Bootstrapper of constructors) {
          await new Bootstrapper().bootstrap(this);
        }
        this._hasBeenBootstrapped = true;
      });
    }
    await this.bootstrapPromise;
  }

  public registerProviders(): void {
    if (this.registrationState === "registered") return;
    if (this.registrationState === "failed") throw this.registrationFailure;
    if (this.registrationState === "registering") {
      throw new Error("Provider registration is already in progress.");
    }

    this.registrationState = "registering";
    try {
      for (const provider of this.providers) provider.register();
      this.registrationState = "registered";
    } catch (error) {
      this.registrationFailure = error;
      this.registrationState = "failed";
      throw error;
    }
  }

  public async boot(): Promise<void> {
    if (this.registrationState === "failed") throw this.registrationFailure;
    if (this.registrationState !== "registered") {
      throw new Error("Providers must be registered before application boot.");
    }
    this.bootPromise ??= Promise.resolve().then(async () => {
      for (const provider of this.providers) await provider.boot();
    });
    await this.bootPromise;
  }

  public async get<T extends Service>(constructor: ServiceConstructor<T>): Promise<T> {
    const service = this.services.get(constructor);
    if (service) return service as T;

    const chain = this.resolution.getStore() ?? [];
    this.assertNoAncestorCycle(constructor, chain);

    let inFlight = this.inFlight.get(constructor);
    if (!inFlight) {
      const token: ServiceToken = { constructor, dependencies: new Map() };
      const promise = Promise.resolve().then(() => this.constructAndBoot(token, chain));
      inFlight = { token, promise };
      this.inFlight.set(constructor, inFlight);
      void promise.then(
        (initialized) => {
          if (this.inFlight.get(constructor)?.promise === promise) {
            this.services.set(constructor, initialized);
            this.inFlight.delete(constructor);
          }
        },
        () => {
          if (this.inFlight.get(constructor)?.promise === promise) {
            this.inFlight.delete(constructor);
          }
        },
      );
    }

    const unlink = this.linkDependency(chain.at(-1), inFlight.token);
    try {
      return (await inFlight.promise) as T;
    } finally {
      unlink();
    }
  }

  public async create<T extends Service>(constructor: ServiceConstructor<T>): Promise<T> {
    const chain = this.resolution.getStore() ?? [];
    this.assertNoAncestorCycle(constructor, chain);

    const token: ServiceToken = { constructor, dependencies: new Map() };
    const unlink = this.linkDependency(chain.at(-1), token);
    try {
      return (await Promise.resolve().then(() => this.constructAndBoot(token, chain))) as T;
    } finally {
      unlink();
    }
  }

  private assertNoAncestorCycle(
    constructor: ServiceConstructor,
    chain: readonly ServiceToken[],
  ): void {
    const cycleStart = chain.findIndex((token) => token.constructor === constructor);
    if (cycleStart < 0) return;

    const cycle = [...chain.slice(cycleStart), { constructor, dependencies: new Map() }];
    throw new Error(
      `Circular service dependency: ${cycle.map((token) => serviceName(token.constructor)).join(" -> ")}`,
    );
  }

  private linkDependency(parent: ServiceToken | undefined, target: ServiceToken): () => void {
    if (!parent) return () => {};

    const pathToParent = this.findPath(target, parent);
    if (pathToParent) {
      const cycle = [parent, ...pathToParent];
      throw new Error(
        `Circular service dependency: ${cycle.map((token) => serviceName(token.constructor)).join(" -> ")}`,
      );
    }

    parent.dependencies.set(target, (parent.dependencies.get(target) ?? 0) + 1);
    return () => {
      const references = parent.dependencies.get(target);
      if (references === 1) parent.dependencies.delete(target);
      else if (references !== undefined) parent.dependencies.set(target, references - 1);
    };
  }

  private findPath(start: ServiceToken, target: ServiceToken): ServiceToken[] | undefined {
    const visit = (
      current: ServiceToken,
      visited: Set<ServiceToken>,
    ): ServiceToken[] | undefined => {
      if (current === target) return [current];
      if (visited.has(current)) return undefined;
      visited.add(current);

      for (const dependency of current.dependencies.keys()) {
        const path = visit(dependency, visited);
        if (path) return [current, ...path];
      }
      return undefined;
    };

    return visit(start, new Set());
  }

  private async constructAndBoot(
    token: ServiceToken,
    parentChain: readonly ServiceToken[],
  ): Promise<Service> {
    const service = new token.constructor(this);
    await this.resolution.run([...parentChain, token], () => bootService(service));
    return service;
  }
}
