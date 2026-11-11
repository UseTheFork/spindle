import { Command } from "commander";
import { expect, test } from "vitest";

import { ProjectServiceProvider } from "@/Project/ProjectServiceProvider";
import { StartCommand } from "@/SubagentDrivenDevelopment/Commands/StartCommand";
import { SubagentDrivenDevelopmentServiceProvider } from "@/SubagentDrivenDevelopment/SubagentDrivenDevelopmentServiceProvider";

import { serviceFixture } from "../helpers/helpers";

test("Project command declarations exclude SDD commands", () => {
  for (const command of SubagentDrivenDevelopmentServiceProvider.commands()) {
    expect(ProjectServiceProvider.commands()).not.toContain(command);
  }
});

test("every executable operation is explicitly bound once as an application singleton", async () => {
  const { app } = await serviceFixture();
  app.register(SubagentDrivenDevelopmentServiceProvider);
  const commands = SubagentDrivenDevelopmentServiceProvider.commands();
  expect(commands).toHaveLength(23);
  expect(commands).toContain(StartCommand);
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
  expect(sdd.commands.map((command) => command.name())).not.toContain("triage");
  expect(sdd.commands.map((command) => command.name())).toContain("accept");
  expect(sdd.commands.map((command) => command.name())).toContain("integrate");
  const review = sdd.commands.find((command) => command.name() === "review")!;
  expect(review.registeredArguments.map((argument) => argument.name())).toEqual(["action"]);
  expect(review.commands).toHaveLength(0);
  expect(review.options.map((option) => option.long)).toEqual([
    "--spec",
    "--scope",
    "--inventory",
    "--author",
    "--type",
    "--agent",
    "--details",
  ]);
  expect(
    sdd.commands
      .find((command) => command.name() === "ticket")!
      .commands.map((command) => command.name()),
  ).toEqual(["create", "update", "comment"]);
  expect(
    sdd.commands
      .find((command) => command.name() === "checks")!
      .commands.map((command) => command.name()),
  ).toEqual(["require", "record"]);
});
