import { expect, test } from "vitest";

import { CommandOptions } from "@/Commands/CommandOptions";

test("once rejects repeated flags without sharing state between invocations or options", () => {
  const first = CommandOptions.once("--spec");
  const second = CommandOptions.once("--spec");
  const other = CommandOptions.once("--ticket");
  expect(first("/workspace/spec.md")).toBe("/workspace/spec.md");
  expect(() => first("/workspace/another.md")).toThrow(
    "Option '--spec' may only be provided once.",
  );
  expect(second("/workspace/spec.md")).toBe("/workspace/spec.md");
  expect(other("T-1")).toBe("T-1");
});
