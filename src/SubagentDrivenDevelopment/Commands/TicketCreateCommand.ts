import type { Command as CommanderCommand } from "commander";

import { Command } from "@spindle/Commands/Command";
import { CommandOptions } from "@spindle/Commands/CommandOptions";
import type { Application } from "@spindle/Foundation/Application";
import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import { SddCommandGroups } from "@spindle/SubagentDrivenDevelopment/Commands/SddCommandGroups";
import type { TicketCreateOptions } from "@spindle/SubagentDrivenDevelopment/Models/Options";
import { TicketService } from "@spindle/SubagentDrivenDevelopment/Services/TicketService";

export class TicketCreateCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    SddCommandGroups.group(root, "ticket")
      .command("create")
      .description("Create an attributed ticket in the selected feature.")
      .requiredOption(
        "--feature <directory>",
        "Feature workspace directory",
        CommandOptions.once("--feature"),
      )
      .requiredOption("--title <title>", "Ticket title", CommandOptions.once("--title"))
      .requiredOption("--reporter <reporter>", "Ticket reporter", CommandOptions.once("--reporter"))
      .requiredOption("--category <category>", "Ticket category", CommandOptions.once("--category"))
      .requiredOption("--actor <acting-agent>", "Acting author", CommandOptions.once("--actor"))
      .allowExcessArguments(false)
      .action(async (options: TicketCreateOptions) => {
        const app = await createApp();
        const command = await app.make(TicketCreateCommand);
        const data = await command.run(options);
        const output = await app.make(ConsoleOutputService);
        output.result({
          level: "success",
          human: `Created ticket for "${options.title}".`,
          data,
        });
      });
  }

  public async run(options: TicketCreateOptions) {
    this.assertApplicationBooted();
    return (await this.app.make(TicketService)).ticketCreate(options);
  }
}
