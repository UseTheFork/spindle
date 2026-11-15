import type { Command } from "commander";

import { CommandOptions } from "@/Commands/CommandOptions";

const normalizedPrograms = new WeakSet<Command>();

const descriptions: Record<string, string> = {
  ticket: "Create and maintain feature tickets.",
  finding: "Register canonical review findings and explicit rulings.",
  requirements: "Record explicit requirements decisions before fresh review.",
  checks: "Declare and record required checks.",
};

export class SddCommandGroups {
  public static group(root: Command, name?: string): Command {
    const program =
      root.commands.find((command) => command.name() === "sdd") ??
      root
        .command("sdd")
        .description("Subagent-driven development workflow")
        .allowExcessArguments(false);
    if (!normalizedPrograms.has(program)) {
      program.hook("preAction", (_program, command) => {
        const feature = command.getOptionValue("feature");
        if (typeof feature === "string") {
          command.setOptionValue("spec", CommandOptions.featureSpec(feature));
        }
        const actor = command.getOptionValue("actor");
        if (typeof actor === "string") command.setOptionValue("author", actor);
      });
      normalizedPrograms.add(program);
    }
    if (!name) return program;
    return (
      program.commands.find((command) => command.name() === name) ??
      program.command(name).description(descriptions[name]!)
    );
  }

  public static reviewSchema(root: Command): Command {
    const program = SddCommandGroups.group(root);
    const existing = program.commands.find((command) => command.name() === "review");
    if (existing) return existing;
    return program
      .command("review")
      .description("Require a specialist or dispatch a ticket or feature review.")
      .argument("[action]", "Use 'require' to pin a justified specialist reviewer")
      .option(
        "--feature <directory>",
        "Feature workspace directory",
        CommandOptions.once("--feature"),
      )
      .option("--ticket <id>", "Ticket ID", CommandOptions.once("--ticket"))
      .option("--scope <scope>", "Workflow scope: delivery", CommandOptions.once("--scope"))
      .option("--actor <acting-agent>", "Controller author", CommandOptions.once("--actor"))
      .option(
        "--type <name>",
        "Review-eligible Blueprint agent key to require",
        CommandOptions.once("--type"),
      )
      .option(
        "--details <text>",
        "Justified specialist review objective",
        CommandOptions.once("--details"),
      )
      .allowExcessArguments(false);
  }
}
