import { Command } from "commander";
import { expect, test } from "vitest";

import { CommandOptions } from "@/Commands/CommandOptions";
import { SubagentDrivenDevelopmentServiceProvider } from "@/SubagentDrivenDevelopment/SubagentDrivenDevelopmentServiceProvider";

test("once rejects repeated flags without sharing state between invocations or options", () => {
  const first = CommandOptions.once("--spec");
  const second = CommandOptions.once("--spec");
  const other = CommandOptions.once("--issue");
  expect(first("/workspace/spec.md")).toBe("/workspace/spec.md");
  expect(() => first("/workspace/another.md")).toThrow(
    "Option '--spec' may only be provided once.",
  );
  expect(second("/workspace/spec.md")).toBe("/workspace/spec.md");
  expect(other("I-1")).toBe("I-1");
});

test("all SDD schemas allocate independent single-value parsers on registration", () => {
  const never = async () => {
    throw new Error("Schema registration must not construct an Application.");
  };
  for (const command of SubagentDrivenDevelopmentServiceProvider.commands()) {
    const first = new Command("spindle");
    const second = new Command("spindle");
    command.register(first, never);
    command.register(second, never);
    const options = (root: Command): Map<string, Command["options"]> => {
      const result = new Map<string, Command["options"]>();
      const visit = (entry: Command, path: string) => {
        result.set(path, entry.options);
        for (const child of entry.commands) visit(child, `${path} ${child.name()}`);
      };
      visit(root, root.name());
      return result;
    };
    const fresh = options(second);
    for (const [path, registered] of options(first)) {
      for (const option of registered) {
        if (!option.parseArg) continue;
        const counterpart = fresh.get(path)!.find((entry) => entry.long === option.long)!;
        expect(counterpart.flags).toBe(option.flags);
        expect(counterpart.argChoices).toEqual(option.argChoices);
        if (option.argChoices) continue;
        expect(option.parseArg("first", undefined)).toBe("first");
        expect(() => option.parseArg!("second", undefined)).toThrow(
          `Option '${option.long}' may only be provided once.`,
        );
        expect(counterpart.parseArg!("fresh", undefined)).toBe("fresh");
      }
    }
  }
});
