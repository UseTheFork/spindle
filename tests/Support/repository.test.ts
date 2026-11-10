import { describe, expect, expectTypeOf, test, vi } from "vitest";

import { Repository } from "@/Support/Repository";

const getters = ["string", "integer", "float", "boolean", "array"] as const;

test("get returns unknown and preserves present values, including null, undefined, and functions", () => {
  const repository = new Repository();
  expectTypeOf(repository.get("missing")).toEqualTypeOf<unknown>();
  expect(repository.get("missing")).toBeUndefined();
  const fallback = vi.fn(() => "default");
  expect(repository.get("missing", fallback)).toBe("default");
  expect(fallback).toHaveBeenCalledTimes(1);
  expect(repository.has("missing")).toBe(false);
  expect(repository.get("missing", null)).toBeNull();
  expect(repository.get("missing", false)).toBe(false);
  const storedFunction = vi.fn();
  for (const value of [null, undefined, "", 0, false, storedFunction]) {
    repository.set("present", value);
    expect(repository.has("present")).toBe(true);
    expect(repository.get("present", fallback)).toBe(value);
  }
  expect(fallback).toHaveBeenCalledTimes(1);
  expect(storedFunction).not.toHaveBeenCalled();
});

describe.each(getters)("%s getter", (getter) => {
  const valid = { string: "text", integer: 42, float: 1.5, boolean: false, array: [1] };

  test("requires a value or default and validates literal and lazy defaults without storing them", () => {
    const repository = new Repository();
    const invoke = (...args: unknown[]): unknown =>
      Reflect.apply(repository[getter], repository, args);
    expect(() => invoke("missing")).toThrow(/missing.*expected/);
    expect(invoke("missing", valid[getter])).toBe(valid[getter]);
    const fallback = vi.fn(() => valid[getter]);
    expect(invoke("missing", fallback)).toBe(valid[getter]);
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(repository.has("missing")).toBe(false);
    for (const value of [undefined, null, {}, () => undefined, () => null, () => ({})]) {
      expect(() => invoke("missing", value)).toThrow(/missing.*must contain/);
    }
    const failure = new Error("default failed");
    expect(() =>
      invoke("missing", () => {
        throw failure;
      }),
    ).toThrow(failure);
  });

  test("never replaces or coerces a present value and never calls its default", () => {
    const repository = new Repository();
    const fallback = vi.fn(() => valid[getter]);
    repository.set("value", valid[getter]);
    expect(Reflect.apply(repository[getter], repository, ["value", fallback])).toBe(valid[getter]);
    for (const value of [null, undefined, {}, new String("text")]) {
      repository.set("value", value);
      expect(() => Reflect.apply(repository[getter], repository, ["value", fallback])).toThrow(
        /value.*must contain/,
      );
      expect(repository.get("value")).toBe(value);
    }
    expect(fallback).not.toHaveBeenCalled();
  });
});

test("typed getters expose checked types and accept falsy typed defaults", () => {
  const repository = new Repository();
  expectTypeOf(repository.string("text", "")).toEqualTypeOf<string>();
  expectTypeOf(repository.integer("count", 0)).toEqualTypeOf<number>();
  expectTypeOf(repository.float("amount", 0)).toEqualTypeOf<number>();
  expectTypeOf(repository.boolean("enabled", false)).toEqualTypeOf<boolean>();
  expectTypeOf(repository.array("items", [])).toEqualTypeOf<unknown[]>();
  expect(repository.string("text", "")).toBe("");
  expect(repository.integer("count", 0)).toBe(0);
  expect(repository.float("amount", 0)).toBe(0);
  expect(repository.boolean("enabled", false)).toBe(false);
  expect(repository.array("items", [])).toEqual([]);
});

test("integers must be safe and floats must be finite numbers without coercion", () => {
  const repository = new Repository();
  for (const value of [0, -0, -1, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]) {
    repository.set("number", value);
    expect(repository.integer("number")).toBe(value);
    expect(repository.float("number")).toBe(value);
  }
  for (const value of [0.5, -2.5, Number.MAX_SAFE_INTEGER + 1, Number.MAX_VALUE]) {
    repository.set("number", value);
    expect(repository.float("number")).toBe(value);
    expect(() => repository.integer("number", 1)).toThrow(/safe integer/);
    expect(() => repository.integer("missing", () => value)).toThrow(/safe integer/);
  }
  for (const value of [NaN, Infinity, -Infinity, "1", "", true, false, 1n, new Number(1)]) {
    repository.set("number", value);
    expect(() => repository.integer("number")).toThrow(/safe integer/);
    expect(() => repository.float("number")).toThrow(/finite number/);
  }
  for (const value of [NaN, Infinity, -Infinity]) {
    expect(() => repository.float("missing", value)).toThrow(/finite number/);
    expect(() => repository.float("missing", () => value)).toThrow(/finite number/);
  }
  repository.set("boolean", "false");
  expect(() => repository.boolean("boolean")).toThrow(/boolean/);
  repository.set("string", 1);
  expect(() => repository.string("string")).toThrow(/string/);
});

test("arrays are live leaf values; push and prepend create only missing arrays", () => {
  const repository = new Repository();
  repository.push("nested.items", "middle");
  repository.prepend("nested.items", "first");
  repository.push("nested.items", ["last"]);
  const items = repository.array("nested.items");
  expect(items).toEqual(["first", "middle", ["last"]]);
  items.push(null);
  expect(repository.get("nested.items")).toBe(items);
  expect(repository.array("nested.items")).toEqual(["first", "middle", ["last"], null]);
  repository.prepend("other.items", undefined);
  expect(repository.array("other.items")).toEqual([undefined]);
  const supplied: unknown[] = [];
  repository.set("supplied", supplied);
  repository.push("supplied", false);
  expect(supplied).toEqual([false]);
  const fallback: unknown[] = [];
  expect(repository.array("absent", () => fallback)).toBe(fallback);
  expect(repository.has("absent")).toBe(false);
  for (const value of [null, undefined, {}, "items", { 0: "item", length: 1 }]) {
    repository.set("wrong", value);
    expect(() => repository.array("wrong", [])).toThrow(/array/);
    expect(() => repository.push("wrong", 1)).toThrow(/array/);
    expect(() => repository.prepend("wrong", 1)).toThrow(/array/);
    expect(repository.get("wrong")).toBe(value);
  }
});

test("nested writes preserve siblings and references; deletion tracks presence without pruning", () => {
  const repository = new Repository();
  const settings = { existing: "kept" };
  repository.set("settings", settings);
  repository.set("settings.nested.value", undefined);
  repository.set("settings.nested.other", null);
  expect(repository.get("settings")).toBe(settings);
  expect(settings).toEqual({ existing: "kept", nested: { value: undefined, other: null } });
  expect(repository.has("settings.nested.value")).toBe(true);
  expect(repository.delete("settings.nested.value")).toBe(true);
  expect(repository.delete("settings.nested.value")).toBe(false);
  expect(repository.get("settings.nested.other")).toBeNull();
  expect(repository.delete("settings.nested.other")).toBe(true);
  expect(repository.get("settings.nested")).toEqual({});
  expect(repository.delete("absent.child")).toBe(false);
  expect(repository.delete("settings")).toBe(true);
  expect(repository.has("settings")).toBe(false);
  expect(new Repository().has("settings")).toBe(false);
});

test.each([
  "",
  ".",
  ".key",
  "key.",
  "a..b",
  "__proto__",
  "a.__proto__.b",
  "prototype",
  "a.constructor.b",
])("rejects unsafe path %j before any lookup, default, or mutation", (key) => {
  const repository = new Repository();
  const fallback = vi.fn(() => "fallback");
  expect(() => repository.get(key, fallback)).toThrow(/Invalid repository key/);
  expect(fallback).not.toHaveBeenCalled();
  expect(() => repository.set(key, "value")).toThrow(/Invalid repository key/);
  expect(() => repository.has(key)).toThrow(/Invalid repository key/);
  expect(() => repository.delete(key)).toThrow(/Invalid repository key/);
  for (const getter of getters) {
    expect(() => Reflect.apply(repository[getter], repository, [key])).toThrow(
      /Invalid repository key/,
    );
  }
  expect(() => repository.push(key, "value")).toThrow(/Invalid repository key/);
  expect(() => repository.prepend(key, "value")).toThrow(/Invalid repository key/);
  expect(repository.has("a")).toBe(false);
  expect(Object.hasOwn(Object.prototype, "b")).toBe(false);
});

test("only own properties of plain objects are traversed and inherited names can be stored safely", () => {
  const repository = new Repository();
  expect(repository.has("toString")).toBe(false);
  expect(repository.get("toString.child", "default")).toBe("default");
  expect(repository.delete("toString")).toBe(false);
  repository.set("toString.child", "own");
  expect(repository.string("toString.child")).toBe("own");
  const plain = { child: "value" };
  const nullPrototype: Record<string, unknown> = Object.create(null);
  repository.set("plain", plain);
  expect(repository.has("plain.toString")).toBe(false);
  repository.set("plain.toString", "own");
  expect(repository.string("plain.toString")).toBe("own");
  repository.set("nullPrototype", nullPrototype);
  repository.set("nullPrototype.child", "value");
  expect(repository.string("nullPrototype.child")).toBe("value");
  expect(Object.getPrototypeOf(nullPrototype)).toBeNull();
});

test("existing invalid intermediates fail explicitly for every operation without invoking defaults or overwriting", () => {
  class Instance {
    public child = "value";
  }
  const repository = new Repository();
  for (const value of [
    null,
    undefined,
    0,
    false,
    "text",
    [],
    new Date(),
    new Instance(),
    Object.create({ child: "inherited" }),
  ]) {
    repository.set("existing", value);
    const fallback = vi.fn(() => []);
    expect(() => repository.get("existing.child", fallback)).toThrow(
      /existing.child.*existing.*plain object/,
    );
    expect(() => repository.has("existing.child")).toThrow(/plain object/);
    expect(() => repository.delete("existing.child")).toThrow(/plain object/);
    expect(() => repository.set("existing.child", 1)).toThrow(/plain object/);
    expect(() => repository.push("existing.child", 1)).toThrow(/plain object/);
    expect(() => repository.prepend("existing.child", 1)).toThrow(/plain object/);
    for (const getter of getters) {
      expect(() =>
        Reflect.apply(repository[getter], repository, ["existing.child", fallback]),
      ).toThrow(/plain object/);
    }
    expect(fallback).not.toHaveBeenCalled();
    expect(repository.get("existing")).toBe(value);
  }
  repository.set("array", ["value"]);
  expect(() => repository.get("array.0")).toThrow(/plain object/);
  const frozen = Object.freeze({});
  repository.set("frozen", frozen);
  expect(() => repository.set("frozen.missing.nested", 1)).toThrow(TypeError);
  expect(repository.get("frozen")).toBe(frozen);
  expect(Object.hasOwn(frozen, "missing")).toBe(false);
});
