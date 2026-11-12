import { Command } from "commander";
import { expect, test } from "vitest";

import { ReviewCommand } from "@/SubagentDrivenDevelopment/Commands/ReviewCommand";

function review(args: string[]): Promise<Command> {
  const program = new Command("spindle").exitOverride();
  ReviewCommand.register(program, async () => {
    throw new Error("review dispatched");
  });
  return program.parseAsync(["sdd", "review", ...args], { from: "user" });
}

test.each([
  ["--ticket", "T-0001"],
  ["--scope", "delivery"],
])("review dispatch accepts the %s selector", async (...selector) => {
  await expect(
    review(["--spec", "/feature/spec.md", ...selector, "--inventory", "[]", "--author", "owner"]),
  ).rejects.toThrow("review dispatched");
});

test("review require accepts a ticket selector", async () => {
  await expect(
    review([
      "require",
      "--spec",
      "/feature/spec.md",
      "--ticket",
      "T-0001",
      "--type",
      "sdd-code-reviewer",
      "--details",
      "Inspect the change",
      "--author",
      "owner",
    ]),
  ).rejects.toThrow("review dispatched");
});

test.each([[], ["--ticket", "T-0001", "--scope", "delivery"]])(
  "review rejects missing or conflicting scope selectors",
  async (...selector) => {
    await expect(
      review(["--spec", "/feature/spec.md", ...selector, "--inventory", "[]", "--author", "owner"]),
    ).rejects.toThrow("exactly one of --ticket or --scope delivery");
  },
);
