import { AsyncLocalStorage } from "node:async_hooks";

import type { Application } from "@/Foundation/Application";
import { bootService, Service } from "@/services/Service";

export type Constructor<T = unknown> = new (...args: never[]) => T;
export type AbstractConstructor<T = unknown> = abstract new (...args: never[]) => T;
export type Key<T = unknown> = string | AbstractConstructor<T>;
export type Factory<T> = (application: Application) => T | Promise<T>;
export type ServiceConstructor<T extends Service = Service> = new (app: Application) => T;

interface NormalizedKey {
  name: string;
  classKey?: AbstractConstructor<unknown>;
}

interface Resolution {
  key: string;
  dependencies: Map<Resolution, number>;
}

interface InFlight {
  token: Resolution;
  promise: Promise<unknown>;
}

type Binding =
  | { kind: "instance"; value: unknown; classKey?: AbstractConstructor<unknown> }
  | {
      kind: "singleton" | "transient";
      factory: Factory<unknown>;
      classKey?: AbstractConstructor<unknown>;
    };

function isClassConstructor(value: unknown): value is AbstractConstructor<unknown> {
  return (
    typeof value === "function" &&
    /^class(?:\s|\{)/.test(Function.prototype.toString.call(value)) &&
    typeof value.prototype === "object"
  );
}

function normalizeKey(key: Key): NormalizedKey {
  if (typeof key === "string") {
    if (key.length === 0) throw new TypeError("Dependency keys must be non-empty strings.");
    return { name: key };
  }
  if (!isClassConstructor(key)) {
    throw new TypeError("Dependency keys must be strings or class constructors.");
  }
  if (key.name.length === 0) {
    throw new TypeError("Class dependency keys must have a name.");
  }
  return { name: key.name, classKey: key };
}

function isServiceConstructor(key: AbstractConstructor<unknown>): key is ServiceConstructor {
  return key === Service || key.prototype instanceof Service;
}

export abstract class Container {
  private readonly bindings = new Map<string, Binding>();
  private readonly singletons = new Map<string, unknown>();
  private readonly inFlight = new Map<string, InFlight>();
  private readonly resolution = new AsyncLocalStorage<readonly Resolution[]>();

  protected abstract get owner(): Application;

  public bind<T extends Service>(key: ServiceConstructor<T>, factory?: Factory<NoInfer<T>>): void;
  public bind<T>(key: Constructor<T>, factory: Factory<NoInfer<T>>): void;
  public bind<T>(key: string, factory: Factory<T>): void;
  public bind(key: Key, factory?: Factory<unknown>): void {
    this.registerFactory(key, "transient", factory);
  }

  public singleton<T extends Service>(
    key: ServiceConstructor<T>,
    factory?: Factory<NoInfer<T>>,
  ): void;
  public singleton<T>(key: Constructor<T>, factory: Factory<NoInfer<T>>): void;
  public singleton<T>(key: string, factory: Factory<T>): void;
  public singleton(key: Key, factory?: Factory<unknown>): void {
    this.registerFactory(key, "singleton", factory);
  }

  public instance<T>(key: AbstractConstructor<T>, value: NoInfer<T>): void;
  public instance(key: string, value: unknown): void;
  public instance(key: Key, value: unknown): void {
    const normalized = normalizeKey(key);
    this.assertUnbound(normalized);
    this.assertInstanceType(normalized, value);
    if (value instanceof Service && !value.isBooted) {
      throw new Error(`Supplied service instance '${normalized.name}' must already be booted.`);
    }
    this.bindings.set(normalized.name, {
      kind: "instance",
      value,
      classKey: normalized.classKey,
    });
  }

  public bound(key: Key): boolean {
    return this.bindings.has(normalizeKey(key).name);
  }

  public value(key: Key): unknown {
    const normalized = normalizeKey(key);
    const binding = this.binding(normalized);
    if (binding.kind !== "instance") {
      throw new Error(
        `Value '${normalized.name}' must be registered as an instance for synchronous access.`,
      );
    }
    return binding.value;
  }

  public make<T extends Service>(key: ServiceConstructor<T>): Promise<T>;
  public make<T>(key: AbstractConstructor<T>): Promise<T>;
  public make(key: string): Promise<unknown>;
  public async make(key: Key): Promise<unknown> {
    const normalized = normalizeKey(key);
    const binding = this.binding(normalized);
    if (binding.kind === "instance") {
      this.assertInstanceType(normalized, binding.value);
      return binding.value;
    }
    if (this.singletons.has(normalized.name)) {
      const value = this.singletons.get(normalized.name);
      this.assertInstanceType(normalized, value);
      return value;
    }

    const chain = this.resolution.getStore() ?? [];
    this.assertNoAncestorCycle(normalized.name, chain);
    let initialization =
      binding.kind === "singleton" ? this.inFlight.get(normalized.name) : undefined;
    if (!initialization) {
      const token: Resolution = { key: normalized.name, dependencies: new Map() };
      const promise = Promise.resolve().then(() =>
        this.constructAndBoot(token, chain, binding.factory, normalized.classKey),
      );
      initialization = { token, promise };
      if (binding.kind === "singleton") {
        this.inFlight.set(normalized.name, initialization);
        void promise.then(
          (initialized) => {
            if (this.inFlight.get(normalized.name)?.promise === promise) {
              this.singletons.set(normalized.name, initialized);
              this.inFlight.delete(normalized.name);
            }
          },
          () => {
            if (this.inFlight.get(normalized.name)?.promise === promise) {
              this.inFlight.delete(normalized.name);
            }
          },
        );
      }
    }
    const unlink = this.linkDependency(chain.at(-1), initialization.token);
    try {
      const value = await initialization.promise;
      this.assertInstanceType(normalized, value);
      return value;
    } finally {
      unlink();
    }
  }

  private binding(key: NormalizedKey): Binding {
    const binding = this.bindings.get(key.name);
    if (!binding) throw new Error(`Unbound dependency: ${key.name}.`);
    if (key.classKey && binding.classKey && key.classKey !== binding.classKey) {
      throw new Error(`Dependency '${key.name}' is bound to a different constructor.`);
    }
    return binding;
  }

  private assertUnbound(key: NormalizedKey): void {
    if (this.bindings.has(key.name)) {
      throw new Error(`Dependency '${key.name}' is already bound.`);
    }
  }

  private assertInstanceType(key: NormalizedKey, value: unknown): void {
    if (key.classKey && !(value instanceof key.classKey)) {
      throw new Error(`Dependency '${key.name}' did not produce an instance of its class key.`);
    }
  }

  private registerFactory(
    key: Key,
    kind: "singleton" | "transient",
    factory?: Factory<unknown>,
  ): void {
    const normalized = normalizeKey(key);
    this.assertUnbound(normalized);
    if (!factory) {
      if (!normalized.classKey || !isServiceConstructor(normalized.classKey)) {
        throw new Error(`Dependency '${normalized.name}' requires an explicit factory.`);
      }
      const ServiceType = normalized.classKey;
      factory = (application) => new ServiceType(application);
    }
    this.bindings.set(normalized.name, {
      kind,
      factory,
      classKey: normalized.classKey,
    });
  }

  private assertNoAncestorCycle(key: string, chain: readonly Resolution[]): void {
    const start = chain.findIndex((token) => token.key === key);
    if (start >= 0) {
      throw new Error(
        `Circular service dependency: ${[...chain.slice(start).map((token) => token.key), key].join(" -> ")}`,
      );
    }
  }

  private linkDependency(parent: Resolution | undefined, target: Resolution): () => void {
    if (!parent) return () => {};
    const path = this.findPath(target, parent);
    if (path) {
      throw new Error(
        `Circular service dependency: ${[parent, ...path].map((token) => token.key).join(" -> ")}`,
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
    constructor: AbstractConstructor<unknown> | undefined,
  ): Promise<unknown> {
    return this.resolution.run([...parentChain, token], async () => {
      const value = await factory(this.owner);
      this.assertInstanceType({ name: token.key, classKey: constructor }, value);
      if (value instanceof Service && !value.isBooted) await bootService(value);
      return value;
    });
  }
}
