import { expect, test } from "vitest";

import { BlueprintCommandOptions } from "@/BlueprintManagement/Commands/BlueprintCommandOptions";

test("Blueprint options retain conflict choices and negated interactive defaults", () => {
  const conflict = BlueprintCommandOptions.conflictPolicyOption("Conflict policy");
  expect(conflict.flags).toBe("--on-conflict <overwrite|skip>");
  expect(conflict.argChoices).toEqual(["overwrite", "skip"]);
  expect(conflict.description).toBe("Conflict policy");
  expect(conflict.parseArg!("overwrite", undefined)).toBe("overwrite");
  expect(conflict.parseArg!("skip", undefined)).toBe("skip");
  expect(() => conflict.parseArg!("other", undefined)).toThrow();
  const interactive = BlueprintCommandOptions.noInteractiveOption("Never prompt");
  expect(interactive.flags).toBe("--no-interactive");
  expect(interactive.negate).toBe(true);
  expect(interactive.description).toBe("Never prompt");
});
