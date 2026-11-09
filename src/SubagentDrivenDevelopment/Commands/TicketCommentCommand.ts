import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import { CommandOptions } from "@/Commands/CommandOptions";
import type { Application } from "@/Foundation/Application";
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
        const command = await (await createApp()).make(TicketCommentCommand);
        console.log(JSON.stringify(await command.run(options), null, 2));
      });
  }

  public async run(options: TicketCommentOptions) {
    return (await this.app.make(TicketService)).ticketComment(options);
  }
}
