import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import { CommandOptions } from "@/Commands/CommandOptions";
import type { Application } from "@/Foundation/Application";
import { group } from "@/SubagentDrivenDevelopment/Commands/groups";
import type { ChecksRequireOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import { ChecksService } from "@/SubagentDrivenDevelopment/Services/ChecksService";

export class ChecksRequireCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    group(root, "checks")
      .command("require")
      .description("Add or remove a required external check.")
      .requiredOption("--spec <path>", "Feature spec path", CommandOptions.once("--spec"))
      .option("--ticket <id>", "Ticket ID", CommandOptions.once("--ticket"))
      .option("--scope <scope>", "Workflow scope: delivery")
      .requiredOption(
        "--command <command>",
        "Exact externally executed command",
        CommandOptions.once("--command"),
      )
      .option("--remove", "Remove the requirement; requires --details rationale")
      .option("--details <details>", "Removal rationale")
      .requiredOption("--author <author>", "Acting controller", CommandOptions.once("--author"))
      .allowExcessArguments(false)
      .action(async (options: ChecksRequireOptions) => {
        if (options.scope !== undefined && options.scope !== "delivery") {
          throw new Error("--scope must be 'delivery'.");
        }
        if (Boolean(options.ticket) === (options.scope === "delivery")) {
          throw new Error("checks require needs exactly one of --ticket or --scope delivery.");
        }
        const command = await (await createApp()).make(ChecksRequireCommand);
        console.log(JSON.stringify(await command.run(options), null, 2));
      });
  }

  public async run(options: ChecksRequireOptions) {
    return (await this.app.make(ChecksService)).checksRequire(options);
  }
}
