import { text } from "node:stream/consumers";

import { Command } from "@spindle/Commands/Command";
import { CommandOptions } from "@spindle/Commands/CommandOptions";
import type { Application } from "@spindle/Foundation/Application";
import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import { SddCommandGroup } from "@spindle/SubagentDrivenDevelopment/Commands/SddCommandGroup";
import { FeatureWorkspaceService } from "@spindle/SubagentDrivenDevelopment/Services/FeatureWorkspaceService";
import type { Command as CommanderCommand } from "commander";

type Options = { feature: string; ticket: string; comment: string };

export class SddTicketCommentAddCommand extends Command {
  public static register(program: CommanderCommand, createApp: () => Promise<Application>): void {
    SddCommandGroup.subgroup(program, "ticket", "Manage feature tickets.")
      .command("comment")
      .description("Manage ticket comments.")
      .command("add")
      .description("Append a comment to a ticket.")
      .requiredOption(
        "--feature <directory>",
        "Feature workspace",
        CommandOptions.once("--feature"),
      )
      .requiredOption("--ticket <id>", "Ticket ID", CommandOptions.once("--ticket"))
      .requiredOption(
        "--comment <text>",
        "Comment text, or - for stdin",
        CommandOptions.once("--comment"),
      )
      .allowExcessArguments(false)
      .action(async ({ feature, ticket, comment }: Options) => {
        const app = await createApp();
        const data = await (
          await app.make(SddTicketCommentAddCommand)
        ).run({
          feature,
          ticket,
          comment: comment === "-" ? await text(process.stdin) : comment,
        });
        (await app.make(ConsoleOutputService)).result({
          level: "success",
          human: `Added a comment to ticket ${data.ticket}.`,
          data,
        });
      });
  }

  public async run({ feature, ticket, comment }: Options) {
    this.assertApplicationBooted();
    return (await this.app.make(FeatureWorkspaceService)).addTicketComment(
      feature,
      ticket,
      comment,
    );
  }
}
