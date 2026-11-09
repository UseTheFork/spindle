import { Command } from "commander";
import { expect, test } from "vitest";

import { ProjectSetupServiceProvider } from "@/ProjectSetup/ProjectSetupServiceProvider";
import { SubagentDrivenDevelopmentServiceProvider } from "@/SubagentDrivenDevelopment/SubagentDrivenDevelopmentServiceProvider";

import { serviceFixture } from "../helpers/helpers";

test("ProjectSetup command declarations exclude SDD commands", () => {
  for (const command of SubagentDrivenDevelopmentServiceProvider.commands()) {
    expect(ProjectSetupServiceProvider.commands()).not.toContain(command);
  }
});

test("every executable operation is explicitly bound once as an application singleton", async () => {
  const { app } = await serviceFixture();
  app.register(SubagentDrivenDevelopmentServiceProvider);
  const commands = SubagentDrivenDevelopmentServiceProvider.commands();
  expect(commands).toHaveLength(23);
  for (const command of commands) {
    expect(app.bound(command)).toBe(true);
    const instance = await app.make(command);
    expect(await app.make(command)).toBe(instance);
  }
});

test("schema-only registration reuses groups and preserves positional review require", () => {
  const root = new Command("spindle");
  const never = async () => {
    throw new Error("Application must not be constructed for schema registration");
  };
  for (const command of SubagentDrivenDevelopmentServiceProvider.commands()) {
    command.register(root, never);
  }
  expect(root.commands.map((command) => command.name())).toEqual(["sdd"]);
  const sdd = root.commands[0]!;
  const review = sdd.commands.find((command) => command.name() === "review")!;
  expect(review.registeredArguments.map((argument) => argument.name())).toEqual(["action"]);
  expect(review.commands).toHaveLength(0);
  expect(review.options.map((option) => option.long)).toEqual([
    "--spec",
    "--issue",
    "--scope",
    "--inventory",
    "--author",
    "--type",
    "--agent",
    "--details",
  ]);
  expect(
    sdd.commands
      .find((command) => command.name() === "issue")!
      .commands.map((command) => command.name()),
  ).toEqual(["create", "update", "comment"]);
  expect(
    sdd.commands
      .find((command) => command.name() === "checks")!
      .commands.map((command) => command.name()),
  ).toEqual(["require", "record"]);
});
