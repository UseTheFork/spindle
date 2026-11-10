import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import { CommandOptions } from "@/Commands/CommandOptions";
import type { Application } from "@/Foundation/Application";
import { group } from "@/SubagentDrivenDevelopment/Commands/groups";
import type { ChecksRecordOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import { ChecksService } from "@/SubagentDrivenDevelopment/Services/ChecksService";

export class ChecksRecordCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    group(root, "checks")
      .command("record")
      .description("Record an externally executed check against a current snapshot.")
      .requiredOption("--spec <path>", "Feature spec path", CommandOptions.once("--spec"))
      .option("--ticket <id>", "Ticket ID", CommandOptions.once("--ticket"))
      .option("--scope <scope>", "Workflow scope: delivery")
      .requiredOption(
        "--snapshot <snapshot>",
        "CLI-returned content snapshot identity",
        CommandOptions.once("--snapshot"),
      )
      .requiredOption(
        "--command <command>",
        "Exact required command",
        CommandOptions.once("--command"),
      )
      .requiredOption(
        "--result <result>",
        "Check result: passed, failed, unavailable",
        CommandOptions.once("--result"),
      )
      .option("--details <details>", "Failure or unavailability details")
      .option("--paths <paths...>", "Paths whose content this check explicitly covers")
      .requiredOption("--author <author>", "Acting controller", CommandOptions.once("--author"))
      .allowExcessArguments(false)
      .action(async (options: ChecksRecordOptions) => {
        if (options.scope !== undefined && options.scope !== "delivery") {
          throw new Error("--scope must be 'delivery'.");
        }
        if (Boolean(options.ticket) === (options.scope === "delivery")) {
          throw new Error("checks record needs exactly one of --ticket or --scope delivery.");
        }
        const command = await (await createApp()).make(ChecksRecordCommand);
        console.log(JSON.stringify(await command.run(options), null, 2));
      });
  }

  public async run(options: ChecksRecordOptions) {
    this.assertApplicationBooted();
    return (await this.app.make(ChecksService)).checksRecord(options);
  }
}
