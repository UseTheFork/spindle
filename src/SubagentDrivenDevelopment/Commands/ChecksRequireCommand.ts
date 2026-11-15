import type { Command as CommanderCommand } from "commander";

import { Command } from "@spindle/Commands/Command";
import { CommandOptions } from "@spindle/Commands/CommandOptions";
import type { Application } from "@spindle/Foundation/Application";
import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import { SddCommandGroups } from "@spindle/SubagentDrivenDevelopment/Commands/SddCommandGroups";
import type { ChecksRequireOptions } from "@spindle/SubagentDrivenDevelopment/Models/Options";
import { ChecksService } from "@spindle/SubagentDrivenDevelopment/Services/ChecksService";
import { FeatureFinalizationService } from "@spindle/SubagentDrivenDevelopment/Services/FeatureFinalizationService";

export class ChecksRequireCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    SddCommandGroups.group(root, "checks")
      .command("require")
      .description("Add or remove a required external check.")
      .requiredOption(
        "--feature <directory>",
        "Feature workspace directory",
        CommandOptions.once("--feature"),
      )
      .option("--ticket <id>", "Ticket ID", CommandOptions.once("--ticket"))
      .option("--scope <scope>", "Workflow scope: delivery, post-merge or final")
      .requiredOption(
        "--command <command>",
        "Exact externally executed command; repeat for post-merge or final lists",
        (value: string, previous: string[] = []) => [...previous, value],
        [],
      )
      .option("--remove", "Remove the requirement; requires --details rationale")
      .option("--details <details>", "Removal rationale")
      .requiredOption("--actor <acting-agent>", "Acting controller", CommandOptions.once("--actor"))
      .allowExcessArguments(false)
      .action(async (options: Omit<ChecksRequireOptions, "command"> & { command: string[] }) => {
        if (
          options.scope !== undefined &&
          options.scope !== "delivery" &&
          options.scope !== "post-merge" &&
          options.scope !== "final"
        ) {
          throw new Error("--scope must be 'delivery', 'post-merge' or 'final'.");
        }
        if (
          (options.scope === "delivery" || options.scope === "final") === Boolean(options.ticket)
        ) {
          throw new Error(
            "checks require needs --ticket or --scope delivery/final; scope post-merge also needs --ticket.",
          );
        }
        if (
          options.scope !== "post-merge" &&
          options.scope !== "final" &&
          options.command.length !== 1
        )
          throw new Error("Exactly one --command is required outside scopes post-merge and final.");
        const app = await createApp();
        const command = await app.make(ChecksRequireCommand);
        const data = await command.run({
          ...options,
          command:
            options.scope === "post-merge" || options.scope === "final"
              ? options.command
              : options.command[0]!,
        });
        const output = await app.make(ConsoleOutputService);
        output.result({
          level: "success",
          human: `${options.remove ? "Removed" : "Updated"} required checks for ${options.ticket ? `ticket ${options.ticket}` : `${options.scope ?? "delivery"} scope`}.`,
          data,
        });
      });
  }

  public async run(
    options: Omit<ChecksRequireOptions, "command"> & { command: string | string[] },
  ) {
    this.assertApplicationBooted();
    if (options.scope === "final") {
      if (options.ticket || options.remove || options.details) {
        throw new Error("Final declarations do not accept ticket, removal or coverage options.");
      }
      return (await this.app.make(FeatureFinalizationService)).declare({
        spec: options.spec,
        command: Array.isArray(options.command) ? options.command : [options.command],
        author: options.author,
      });
    }
    return (await this.app.make(ChecksService)).checksRequire(options);
  }
}
