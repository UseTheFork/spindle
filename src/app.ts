import { AsyncLocalStorage } from "node:async_hooks";

export interface AppOptions {
  workspaceRoot: string;
  blueprintSourceRoot: string;
}

export type ServiceConstructor<T extends Service = Service> = new (app: App) => T;

interface ServiceToken {
  constructor: ServiceConstructor;
  dependencies: Map<ServiceToken, number>;
}

interface InFlightService {
  token: ServiceToken;
  promise: Promise<Service>;
}

const bootedServices = new WeakSet<object>();

function serviceName(constructor: ServiceConstructor): string {
  return constructor.name || "<anonymous service>";
}

export class App {
  readonly #workspaceRoot: string;
  readonly #blueprintSourceRoot: string;
  readonly #services = new Map<ServiceConstructor, Service>();
  readonly #inFlight = new Map<ServiceConstructor, InFlightService>();
  readonly #resolution = new AsyncLocalStorage<readonly ServiceToken[]>();

  constructor({ workspaceRoot, blueprintSourceRoot }: AppOptions) {
    this.#workspaceRoot = workspaceRoot;
    this.#blueprintSourceRoot = blueprintSourceRoot;
  }

  get workspaceRoot(): string {
    return this.#workspaceRoot;
  }

  get blueprintSourceRoot(): string {
    return this.#blueprintSourceRoot;
  }

  async get<T extends Service>(constructor: ServiceConstructor<T>): Promise<T> {
    const service = this.#services.get(constructor);
    if (service) return service as T;

    const chain = this.#resolution.getStore() ?? [];
    this.#assertNoAncestorCycle(constructor, chain);

    let inFlight = this.#inFlight.get(constructor);
    if (!inFlight) {
      const token: ServiceToken = { constructor, dependencies: new Map() };
      const promise = Promise.resolve().then(() => this.#constructAndBoot(token, chain));
      inFlight = { token, promise };
      this.#inFlight.set(constructor, inFlight);
      void promise.then(
        (initialized) => {
          if (this.#inFlight.get(constructor)?.promise === promise) {
            this.#services.set(constructor, initialized);
            this.#inFlight.delete(constructor);
          }
        },
        () => {
          if (this.#inFlight.get(constructor)?.promise === promise) {
            this.#inFlight.delete(constructor);
          }
        },
      );
    }

    const unlink = this.#linkDependency(chain.at(-1), inFlight.token);
    try {
      return (await inFlight.promise) as T;
    } finally {
      unlink();
    }
  }

  async create<T extends Service>(constructor: ServiceConstructor<T>): Promise<T> {
    const chain = this.#resolution.getStore() ?? [];
    this.#assertNoAncestorCycle(constructor, chain);

    const token: ServiceToken = { constructor, dependencies: new Map() };
    const unlink = this.#linkDependency(chain.at(-1), token);
    try {
      return (await Promise.resolve().then(() => this.#constructAndBoot(token, chain))) as T;
    } finally {
      unlink();
    }
  }

  #assertNoAncestorCycle(constructor: ServiceConstructor, chain: readonly ServiceToken[]): void {
    const cycleStart = chain.findIndex((token) => token.constructor === constructor);
    if (cycleStart < 0) return;

    const cycle = [...chain.slice(cycleStart), { constructor, dependencies: new Map() }];
    throw new Error(
      `Circular service dependency: ${cycle.map((token) => serviceName(token.constructor)).join(" -> ")}`,
    );
  }

  #linkDependency(parent: ServiceToken | undefined, target: ServiceToken): () => void {
    if (!parent) return () => {};

    const pathToParent = this.#findPath(target, parent);
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

  #findPath(start: ServiceToken, target: ServiceToken): ServiceToken[] | undefined {
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

  async #constructAndBoot(
    token: ServiceToken,
    parentChain: readonly ServiceToken[],
  ): Promise<Service> {
    const service = new token.constructor(this);
    await this.#resolution.run([...parentChain, token], () => service.boot());
    bootedServices.add(service);
    return service;
  }
}

export class Service {
  readonly #app: App;

  constructor(app: App) {
    this.#app = app;
  }

  get app(): App {
    return this.#app;
  }

  get isBooted(): boolean {
    return bootedServices.has(this);
  }

  async boot(): Promise<void> {}
}
