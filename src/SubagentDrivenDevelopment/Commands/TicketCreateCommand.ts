import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import { CommandOptions } from "@/Commands/CommandOptions";
import type { Application } from "@/Foundation/Application";
import { ConsoleOutputService } from "@/Foundation/ConsoleOutputService";
import { group } from "@/SubagentDrivenDevelopment/Commands/groups";
import type { TicketCreateOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import { TicketService } from "@/SubagentDrivenDevelopment/Services/TicketService";

export class TicketCreateCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    group(root, "ticket")
      .command("create")
      .description("Create an attributed ticket in the selected feature.")
      .requiredOption("--spec <path>", "Feature spec path", CommandOptions.once("--spec"))
      .requiredOption("--title <title>", "Ticket title", CommandOptions.once("--title"))
      .requiredOption("--reporter <reporter>", "Ticket reporter", CommandOptions.once("--reporter"))
      .requiredOption("--category <category>", "Ticket category", CommandOptions.once("--category"))
      .requiredOption("--author <author>", "Acting author", CommandOptions.once("--author"))
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
