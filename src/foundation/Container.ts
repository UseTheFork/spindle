import { AsyncLocalStorage } from "node:async_hooks";

import type { Application } from "@/foundation/Application";
import { bootService, Service } from "@/services/Service";

export class ValueToken<T> {
  declare public readonly valueType: T;

  public constructor(public readonly name: string) {}
}

export type Constructor<T> = new (...args: never[]) => T;
export type Key<T> = Constructor<T> | ValueToken<T>;
export type Factory<T> = (application: Application) => T | Promise<T>;
export type ServiceConstructor<T extends Service = Service> = new (app: Application) => T;

interface Resolution {
  key: Key<unknown>;
  dependencies: Map<Resolution, number>;
}

interface InFlight {
  token: Resolution;
  promise: Promise<unknown>;
}

type Binding =
  | { kind: "instance"; value: unknown }
  | { kind: "singleton" | "transient"; factory: Factory<unknown> };

function keyName(key: Key<unknown>): string {
  return key.name || "<anonymous>";
}

function isServiceConstructor(key: Key<unknown>): key is ServiceConstructor {
  return typeof key === "function" && (key === Service || key.prototype instanceof Service);
}

export class Container {
  private readonly bindings = new Map<Key<unknown>, Binding>();
  private readonly singletons = new Map<Key<unknown>, unknown>();
  private readonly inFlight = new Map<Key<unknown>, InFlight>();
  private readonly resolution = new AsyncLocalStorage<readonly Resolution[]>();

  public constructor(private readonly application: Application) {}

  public bind<T extends Service>(key: ServiceConstructor<T>, factory?: Factory<NoInfer<T>>): void;
  public bind<T>(key: Key<T>, factory: Factory<NoInfer<T>>): void;
  public bind<T>(key: Key<T>, factory?: Factory<T>): void {
    this.registerFactory(key, "transient", factory);
  }

  public singleton<T extends Service>(
    key: ServiceConstructor<T>,
    factory?: Factory<NoInfer<T>>,
  ): void;
  public singleton<T>(key: Key<T>, factory: Factory<NoInfer<T>>): void;
  public singleton<T>(key: Key<T>, factory?: Factory<T>): void {
    this.registerFactory(key, "singleton", factory);
  }

  public instance<T>(key: Key<T>, value: NoInfer<T>): void {
    this.assertUnbound(key);
    if (value instanceof Service && !value.isBooted) {
      throw new Error(`Supplied service instance '${keyName(key)}' must already be booted.`);
    }
    this.bindings.set(key, { kind: "instance", value });
  }

  public bound<T>(key: Key<T>): boolean {
    return this.bindings.has(key);
  }

  public value<T>(key: ValueToken<T>): T {
    const binding = this.binding(key);
    if (binding.kind !== "instance") {
      throw new Error(
        `Value '${keyName(key)}' must be registered as an instance for synchronous access.`,
      );
    }
    return binding.value as T;
  }

  public async make<T>(key: Key<T>): Promise<T> {
    const binding = this.binding(key);
    if (binding.kind === "instance") return binding.value as T;
    if (this.singletons.has(key)) return this.singletons.get(key) as T;

    const chain = this.resolution.getStore() ?? [];
    this.assertNoAncestorCycle(key, chain);
    let initialization = binding.kind === "singleton" ? this.inFlight.get(key) : undefined;
    if (!initialization) {
      const token: Resolution = { key, dependencies: new Map() };
      const promise = Promise.resolve().then(() =>
        this.constructAndBoot(token, chain, binding.factory),
      );
      initialization = { token, promise };
      if (binding.kind === "singleton") {
        this.inFlight.set(key, initialization);
        void promise.then(
          (initialized) => {
            if (this.inFlight.get(key)?.promise === promise) {
              this.singletons.set(key, initialized);
              this.inFlight.delete(key);
            }
          },
          () => {
            if (this.inFlight.get(key)?.promise === promise) this.inFlight.delete(key);
          },
        );
      }
    }
    const unlink = this.linkDependency(chain.at(-1), initialization.token);
    try {
      return (await initialization.promise) as T;
    } finally {
      unlink();
    }
  }

  private binding(key: Key<unknown>): Binding {
    const binding = this.bindings.get(key);
    if (!binding) throw new Error(`Unbound dependency: ${keyName(key)}.`);
    return binding;
  }

  private assertUnbound(key: Key<unknown>): void {
    if (this.bound(key)) throw new Error(`Dependency '${keyName(key)}' is already bound.`);
  }

  private registerFactory(
    key: Key<unknown>,
    kind: "singleton" | "transient",
    factory?: Factory<unknown>,
  ): void {
    this.assertUnbound(key);
    if (!factory) {
      if (!isServiceConstructor(key)) {
        throw new Error(`Dependency '${keyName(key)}' requires an explicit factory.`);
      }
      factory = (application) => new key(application);
    }
    this.bindings.set(key, { kind, factory });
  }

  private assertNoAncestorCycle(key: Key<unknown>, chain: readonly Resolution[]): void {
    const start = chain.findIndex((token) => token.key === key);
    if (start >= 0) {
      throw new Error(
        `Circular service dependency: ${[...chain.slice(start).map((token) => keyName(token.key)), keyName(key)].join(" -> ")}`,
      );
    }
  }

  private linkDependency(parent: Resolution | undefined, target: Resolution): () => void {
    if (!parent) return () => {};
    const path = this.findPath(target, parent);
    if (path) {
      throw new Error(
        `Circular service dependency: ${[parent, ...path].map((token) => keyName(token.key)).join(" -> ")}`,
      );
    }
    parent.dependencies.set(target, (parent.dependencies.get(target) ?? 0) + 1);
    return () => {
      const references = parent.dependencies.get(target);
      if (references === 1) parent.dependencies.delete(target);
      else if (references !== undefined) parent.dependencies.set(target, references - 1);
    };
  }

  private findPath(start: Resolution, target: Resolution): Resolution[] | undefined {
    const visit = (current: Resolution, visited: Set<Resolution>): Resolution[] | undefined => {
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
    token: Resolution,
    parentChain: readonly Resolution[],
    factory: Factory<unknown>,
  ): Promise<unknown> {
    return this.resolution.run([...parentChain, token], async () => {
      const value = await factory(this.application);
      if (value instanceof Service && !value.isBooted) await bootService(value);
      return value;
    });
  }
}
