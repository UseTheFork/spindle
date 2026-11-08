import type { Command } from "commander";

import { once } from "@/commands/shared-options";

const descriptions: Record<string, string> = {
  issue: "Create and maintain feature issues.",
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
    .description("Require a specialist or freeze issue/delivery inventory for review.")
    .argument("[action]", "Use 'require' to pin a justified specialist reviewer")
    .option("--spec <path>", "Feature spec path", once("--spec"))
    .option("--issue <id>", "Issue ID", once("--issue"))
    .option("--scope <scope>", "Workflow scope: delivery")
    .option(
      "--inventory <json>",
      "Controller-confirmed Git-derived inventory as a JSON string array",
      once("--inventory"),
    )
    .option("--author <author>", "Controller author", once("--author"))
    .option("--agent <name>", "Known review-eligible Blueprint agent", once("--agent"))
    .option("--details <text>", "Justified specialist review objective", once("--details"))
    .allowExcessArguments(false);
}
