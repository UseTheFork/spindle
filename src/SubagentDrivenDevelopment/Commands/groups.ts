import type { Command } from "commander";

import { CommandOptions } from "@/Commands/CommandOptions";

const descriptions: Record<string, string> = {
  ticket: "Create and maintain feature tickets.",
  finding: "Register canonical review findings and explicit rulings.",
  requirements: "Record explicit requirements decisions before fresh review.",
  checks: "Declare and record required checks.",
};

export function group(root: Command, name?: string): Command {
  const program =
    root.commands.find((command) => command.name() === "sdd") ??
    root
      .command("sdd")
      .description("Subagent-driven development workflow")
      .allowExcessArguments(false);
  if (!name) return program;
  return (
    program.commands.find((command) => command.name() === name) ??
    program.command(name).description(descriptions[name]!)
  );
}

export function reviewSchema(root: Command): Command {
  const program = group(root);
  const existing = program.commands.find((command) => command.name() === "review");
  if (existing) return existing;
  return program
    .command("review")
    .description("Require a specialist or freeze a ticket or feature inventory for review.")
    .argument("[action]", "Use 'require' to pin a justified specialist reviewer")
    .option("--spec <path>", "Feature spec path", CommandOptions.once("--spec"))
    .option("--ticket <id>", "Ticket ID", CommandOptions.once("--ticket"))
    .option("--scope <scope>", "Workflow scope: delivery", CommandOptions.once("--scope"))
    .option(
      "--inventory <json>",
      "Controller-confirmed Git-derived inventory as a JSON string array",
      CommandOptions.once("--inventory"),
    )
    .option("--author <author>", "Controller author", CommandOptions.once("--author"))
    .option(
      "--type <name>",
      "Review-eligible Blueprint agent key to require",
      CommandOptions.once("--type"),
    )
    .option("--agent <name>", "Alias for --type", CommandOptions.once("--agent"))
    .option(
      "--details <text>",
      "Justified specialist review objective",
      CommandOptions.once("--details"),
    )
    .allowExcessArguments(false);
}
