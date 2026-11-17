import { CorrectCommand } from "@spindle/SubagentDrivenDevelopment/Commands/CorrectCommand";
import { SubagentDrivenDevelopmentServiceProvider } from "@spindle/SubagentDrivenDevelopment/SubagentDrivenDevelopmentServiceProvider";
import { Command } from "commander";
import { expect, test } from "vitest";

test("SDD schemas allocate independent parsers on registration", () => {
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
        if (path === "spindle sdd checks require" && option.long === "--command") {
          expect(option.parseArg("first", [])).toEqual(["first"]);
          expect(option.parseArg("second", ["first"])).toEqual(["first", "second"]);
          expect(counterpart.parseArg!("fresh", [])).toEqual(["fresh"]);
          continue;
        }
        expect(option.parseArg("first", undefined)).toBe("first");
        expect(() => option.parseArg!("second", undefined)).toThrow(
          `Option '${option.long}' may only be provided once.`,
        );
        expect(counterpart.parseArg!("fresh", undefined)).toBe("fresh");
      }
    }
  }
});

test("correct exposes the explicit approved task-plan exception option", () => {
  const root = new Command("spindle");
  CorrectCommand.register(root, async () => {
    throw new Error("Option schema inspection must not construct an Application.");
  });
  const sdd = root.commands.find((command) => command.name() === "sdd");
  const correct = sdd?.commands.find((command) => command.name() === "correct");
  expect(correct?.options.find((option) => option.long === "--approved-exception")?.flags).toBe(
    "--approved-exception",
  );
});
