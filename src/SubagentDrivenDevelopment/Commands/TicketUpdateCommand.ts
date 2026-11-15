import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import { CommandOptions } from "@/Commands/CommandOptions";
import type { Application } from "@/Foundation/Application";
import { ConsoleOutputService } from "@/Foundation/ConsoleOutputService";
import { SddCommandGroups } from "@/SubagentDrivenDevelopment/Commands/SddCommandGroups";
import type { TicketUpdateOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import { TicketService } from "@/SubagentDrivenDevelopment/Services/TicketService";

export class TicketUpdateCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    SddCommandGroups.group(root, "ticket")
      .command("update")
      .description("Update ticket fields, blockers, or dependencies.")
      .requiredOption(
        "--feature <directory>",
        "Feature workspace directory",
        CommandOptions.once("--feature"),
      )
      .requiredOption("--ticket <id>", "Ticket ID", CommandOptions.once("--ticket"))
      .option("--title <title>", "Updated ticket title", CommandOptions.once("--title"))
      .option("--reporter <reporter>", "Updated ticket reporter", CommandOptions.once("--reporter"))
      .option("--category <category>", "Ticket category: bug or enhancement")
      .option("--blocker <reason>", "Explicit reason the ticket cannot proceed")
      .option("--clear-blocker", "Remove the explicit ticket blocker")
      .option("--blocked-by <tickets...>", "Authoritative dependency ticket IDs")
      .option("--clear-blocked-by", "Remove all ticket dependencies")
      .requiredOption("--actor <acting-agent>", "Acting author", CommandOptions.once("--actor"))
      .allowExcessArguments(false)
      .action(async (options: TicketUpdateOptions) => {
        const app = await createApp();
        const command = await app.make(TicketUpdateCommand);
        const data = await command.run(options);
        const output = await app.make(ConsoleOutputService);
        output.result({
          level: "success",
          human: `Updated ticket ${options.ticket}.`,
          data,
        });
      });
  }

  public async run(options: TicketUpdateOptions) {
    this.assertApplicationBooted();
    return (await this.app.make(TicketService)).ticketUpdate(options);
  }
}
