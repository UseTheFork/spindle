type Default<T> = T | (() => T);
type Lookup = { found: false } | { found: true; value: unknown };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export class Repository {
  private readonly items: Record<string, unknown> = {};

  public get(key: string, defaultValue?: unknown): unknown {
    const result = this.lookup(this.segments(key), key);
    if (result.found) return result.value;
    return typeof defaultValue === "function" ? defaultValue() : defaultValue;
  }

  public set(key: string, value: unknown): void {
    const segments = this.segments(key);
    let parent = this.items;
    for (let index = 0; index < segments.length - 1; index++) {
      const segment = segments[index];
      if (!Object.hasOwn(parent, segment)) {
        const branch: Record<string, unknown> = {};
        let nested = branch;
        for (const remaining of segments.slice(index + 1, -1)) {
          const child: Record<string, unknown> = {};
          this.write(nested, remaining, child);
          nested = child;
        }
        this.write(nested, segments[segments.length - 1], value);
        this.write(parent, segment, branch);
        return;
      }
      parent = this.container(parent[segment], key, segments.slice(0, index + 1));
    }
    this.write(parent, segments[segments.length - 1], value);
  }

  public has(key: string): boolean {
    return this.lookup(this.segments(key), key).found;
  }

  public delete(key: string): boolean {
    const segments = this.segments(key);
    let parent = this.items;
    for (let index = 0; index < segments.length - 1; index++) {
      const segment = segments[index];
      if (!Object.hasOwn(parent, segment)) return false;
      parent = this.container(parent[segment], key, segments.slice(0, index + 1));
    }
    const last = segments[segments.length - 1];
    if (!Object.hasOwn(parent, last)) return false;
    return delete parent[last];
  }

  public string(key: string, defaultValue?: Default<string>): string {
    return this.typed(
      key,
      (value): value is string => typeof value === "string",
      "a string",
      defaultValue,
      arguments.length > 1,
    );
  }

  public integer(key: string, defaultValue?: Default<number>): number {
    return this.typed(
      key,
      (value): value is number => typeof value === "number" && Number.isSafeInteger(value),
      "a safe integer",
      defaultValue,
      arguments.length > 1,
    );
  }

  public float(key: string, defaultValue?: Default<number>): number {
    return this.typed(
      key,
      (value): value is number => typeof value === "number" && Number.isFinite(value),
      "a finite number",
      defaultValue,
      arguments.length > 1,
    );
  }

  public boolean(key: string, defaultValue?: Default<boolean>): boolean {
    return this.typed(
      key,
      (value): value is boolean => typeof value === "boolean",
      "a boolean",
      defaultValue,
      arguments.length > 1,
    );
  }

  public array(key: string, defaultValue?: Default<unknown[]>): unknown[] {
    return this.typed(
      key,
      (value): value is unknown[] => Array.isArray(value),
      "an array",
      defaultValue,
      arguments.length > 1,
    );
  }

  public push(key: string, value: unknown): void {
    const items = this.array(key, () => {
      const items: unknown[] = [];
      this.set(key, items);
      return items;
    });
    items.push(value);
  }

  public prepend(key: string, value: unknown): void {
    const items = this.array(key, () => {
      const items: unknown[] = [];
      this.set(key, items);
      return items;
    });
    items.unshift(value);
  }

  private typed<T>(
    key: string,
    validate: (value: unknown) => value is T,
    expected: string,
    defaultValue: unknown,
    hasDefault: boolean,
  ): T {
    const result = this.lookup(this.segments(key), key);
    if (!result.found && !hasDefault) {
      throw new Error(`Repository key "${key}" is missing; expected ${expected}.`);
    }
    const value = result.found
      ? result.value
      : typeof defaultValue === "function"
        ? defaultValue()
        : defaultValue;
    if (!validate(value)) {
      throw new TypeError(`Repository key "${key}" must contain ${expected}.`);
    }
    return value;
  }

  private segments(key: string): string[] {
    if (typeof key !== "string") throw new TypeError("Repository keys must be strings.");
    const segments = key.split(".");
    if (segments.some((segment) => segment.length === 0)) {
      throw new Error(`Invalid repository key "${key}": empty path segments are not allowed.`);
    }
    const forbidden = segments.find(
      (segment) => segment === "__proto__" || segment === "prototype" || segment === "constructor",
    );
    if (forbidden !== undefined) {
      throw new Error(`Invalid repository key "${key}": forbidden path segment "${forbidden}".`);
    }
    return segments;
  }

  private lookup(segments: string[], key: string): Lookup {
    let parent = this.items;
    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index];
      if (!Object.hasOwn(parent, segment)) return { found: false };
      const value = parent[segment];
      if (index === segments.length - 1) return { found: true, value };
      parent = this.container(value, key, segments.slice(0, index + 1));
    }
    return { found: false };
  }

  private container(
    value: unknown,
    key: string,
    traversed: readonly string[],
  ): Record<string, unknown> {
    if (!isPlainObject(value)) {
      throw new TypeError(
        `Cannot traverse repository key "${key}": "${traversed.join(".")}" is not a plain object.`,
      );
    }
    return value;
  }

  private write(parent: Record<string, unknown>, key: string, value: unknown): void {
    Object.defineProperty(parent, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
}
