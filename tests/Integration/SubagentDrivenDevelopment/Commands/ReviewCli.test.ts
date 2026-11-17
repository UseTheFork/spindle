import { Command } from "commander";
import { expect, test } from "vitest";

import { ChecksRecordCommand } from "@spindle/SubagentDrivenDevelopment/Commands/ChecksRecordCommand";
import { ReviewCommand } from "@spindle/SubagentDrivenDevelopment/Commands/ReviewCommand";

function review(args: string[], suppressExpectedStderr = false): Promise<Command> {
  const program = new Command("spindle").exitOverride();
  if (suppressExpectedStderr) {
    program.configureOutput({ writeErr: () => {} });
  }
  ReviewCommand.register(program, async () => {
    throw new Error("review dispatched");
  });
  return program.parseAsync(["sdd", "review", ...args], { from: "user" });
}

test.each([
  ["--ticket", "T-0001"],
  ["--scope", "delivery"],
])("review dispatch accepts the %s selector", async (...selector) => {
  await expect(review(["--feature", "/feature", ...selector, "--actor", "owner"])).rejects.toThrow(
    "review dispatched",
  );
});

test("review require accepts a ticket selector", async () => {
  await expect(
    review([
      "require",
      "--feature",
      "/feature",
      "--ticket",
      "T-0001",
      "--type",
      "sdd-code-reviewer",
      "--details",
      "Inspect the change",
      "--actor",
      "owner",
    ]),
  ).rejects.toThrow("review dispatched");
});

test("review require rejects the removed agent alias", async () => {
  await expect(
    review(
      [
        "require",
        "--feature",
        "/feature",
        "--ticket",
        "T-0001",
        "--agent",
        "sdd-code-reviewer",
        "--details",
        "Inspect the change",
        "--actor",
        "owner",
      ],
      true,
    ),
  ).rejects.toThrow(/unknown option.*--agent/i);
});

test.each([
  ["--ticket", "T-0001"],
  ["--ticket", "T-0001", "--scope", "post-merge"],
  ["--scope", "delivery"],
  ["--scope", "final"],
])("checks record rejects removed paths for %s", async (...selector) => {
  const program = new Command("spindle").exitOverride();
  program.configureOutput({ writeErr: () => {} });
  ChecksRecordCommand.register(program, async () => {
    throw new Error("checks dispatched");
  });
  await expect(
    program.parseAsync(
      [
        "sdd",
        "checks",
        "record",
        "--feature",
        "/feature",
        ...selector,
        "--command",
        "pnpm test",
        "--result",
        "passed",
        "--paths",
        "src/example.ts",
        "--actor",
        "owner",
      ],
      { from: "user" },
    ),
  ).rejects.toThrow(/unknown option.*--paths/i);
});

test("review rejects caller-supplied inventory", async () => {
  await expect(
    review(
      [
        "--feature",
        "/feature",
        "--ticket",
        "T-0001",
        "--inventory",
        "[]",
        "--actor",
        "owner",
      ],
      true,
    ),
  ).rejects.toThrow(/unknown option.*inventory/i);
});

test.each([[], ["--ticket", "T-0001", "--scope", "delivery"]])(
  "review rejects missing or conflicting scope selectors",
  async (...selector) => {
    await expect(
      review(["--feature", "/feature", ...selector, "--actor", "owner"]),
    ).rejects.toThrow("exactly one of --ticket or --scope delivery");
  },
);
