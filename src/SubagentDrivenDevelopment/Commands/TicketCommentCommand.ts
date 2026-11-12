import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import { CommandOptions } from "@/Commands/CommandOptions";
import type { Application } from "@/Foundation/Application";
import { ConsoleOutputService } from "@/Foundation/ConsoleOutputService";
import { group } from "@/SubagentDrivenDevelopment/Commands/groups";
import type { TicketCommentOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import { TicketService } from "@/SubagentDrivenDevelopment/Services/TicketService";

export class TicketCommentCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    group(root, "ticket")
      .command("comment")
      .description("Append an attributed ticket comment.")
      .requiredOption("--spec <path>", "Feature spec path", CommandOptions.once("--spec"))
      .requiredOption("--ticket <id>", "Ticket ID", CommandOptions.once("--ticket"))
      .requiredOption("--details <details>", "Comment text", CommandOptions.once("--details"))
      .requiredOption("--author <author>", "Acting author", CommandOptions.once("--author"))
      .allowExcessArguments(false)
      .action(async (options: TicketCommentOptions) => {
        const app = await createApp();
        const command = await app.make(TicketCommentCommand);
        const data = await command.run(options);
        const output = await app.make(ConsoleOutputService);
        output.result({
          level: "success",
          human: `Added a comment to ticket ${options.ticket}.`,
          data,
        });
      });
  }

  public async run(options: TicketCommentOptions) {
    this.assertApplicationBooted();
    return (await this.app.make(TicketService)).ticketComment(options);
  }
}
