import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import { CommandOptions } from "@/Commands/CommandOptions";
import type { Application } from "@/Foundation/Application";
import { group } from "@/SubagentDrivenDevelopment/Commands/groups";
import type { ChecksRequireOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import { ChecksService } from "@/SubagentDrivenDevelopment/Services/ChecksService";
import { FeatureFinalizationService } from "@/SubagentDrivenDevelopment/Services/FeatureFinalizationService";

export class ChecksRequireCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    group(root, "checks")
      .command("require")
      .description("Add or remove a required external check.")
      .requiredOption("--spec <path>", "Feature spec path", CommandOptions.once("--spec"))
      .option("--ticket <id>", "Ticket ID", CommandOptions.once("--ticket"))
      .option("--scope <scope>", "Workflow scope: delivery, post-merge or final")
      .requiredOption(
        "--command <command>",
        "Exact externally executed command; repeat for post-merge or final lists",
        (value: string, previous: string[] = []) => [...previous, value],
        [],
      )
      .option("--remove", "Remove the requirement; requires --details rationale")
      .option(
        "--rebase-baseline",
        "Adopt current feature HEAD after manually rebasing the ticket worktree",
      )
      .option("--details <details>", "Removal rationale")
      .requiredOption("--author <author>", "Acting controller", CommandOptions.once("--author"))
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
        const command = await (await createApp()).make(ChecksRequireCommand);
        console.log(
          JSON.stringify(
            await command.run({
              ...options,
              command:
                options.scope === "post-merge" || options.scope === "final"
                  ? options.command
                  : options.command[0]!,
            }),
            null,
            2,
          ),
        );
      });
  }

  public async run(
    options: Omit<ChecksRequireOptions, "command"> & { command: string | string[] },
  ) {
    this.assertApplicationBooted();
    if (options.scope === "final") {
      if (options.ticket || options.remove || options.details || options.rebaseBaseline) {
        throw new Error(
          "Final declarations do not accept ticket, removal, rebase or coverage options.",
        );
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
