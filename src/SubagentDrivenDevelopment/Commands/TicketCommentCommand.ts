import type { Command as CommanderCommand } from "commander";

import { Command } from "@spindle/Commands/Command";
import { CommandOptions } from "@spindle/Commands/CommandOptions";
import type { Application } from "@spindle/Foundation/Application";
import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import { SddCommandGroups } from "@spindle/SubagentDrivenDevelopment/Commands/SddCommandGroups";
import type { TicketCommentOptions } from "@spindle/SubagentDrivenDevelopment/Models/Options";
import { TicketService } from "@spindle/SubagentDrivenDevelopment/Services/TicketService";

export class TicketCommentCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    SddCommandGroups.group(root, "ticket")
      .command("comment")
      .description("Append an attributed ticket comment.")
      .requiredOption(
        "--feature <directory>",
        "Feature workspace directory",
        CommandOptions.once("--feature"),
      )
      .requiredOption("--ticket <id>", "Ticket ID", CommandOptions.once("--ticket"))
      .requiredOption("--details <details>", "Comment text", CommandOptions.once("--details"))
      .requiredOption("--actor <acting-agent>", "Acting author", CommandOptions.once("--actor"))
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
