import { text } from "node:stream/consumers";

import { Command } from "@spindle/Commands/Command";
import { CommandOptions } from "@spindle/Commands/CommandOptions";
import type { Application } from "@spindle/Foundation/Application";
import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import { SddCommandGroup } from "@spindle/SubagentDrivenDevelopment/Commands/SddCommandGroup";
import { TicketCommitService } from "@spindle/SubagentDrivenDevelopment/Services/TicketCommitService";
import type { Command as CommanderCommand } from "commander";

type Options = { feature: string; ticket: string; message: string };

export class SddTicketCommitCommand extends Command {
  public static register(program: CommanderCommand, createApp: () => Promise<Application>): void {
    SddCommandGroup.subgroup(program, "ticket", "Manage feature tickets.")
      .command("commit")
      .description("Commit the completed task round in a ticket worktree.")
      .requiredOption(
        "--feature <directory>",
        "Feature workspace",
        CommandOptions.once("--feature"),
      )
      .requiredOption("--ticket <id>", "Ticket ID", CommandOptions.once("--ticket"))
      .requiredOption(
        "--message <text>",
        "Commit message, or - for stdin",
        CommandOptions.once("--message"),
      )
      .allowExcessArguments(false)
      .action(async ({ feature, ticket, message }: Options) => {
        const app = await createApp();
        const data = await (
          await app.make(SddTicketCommitCommand)
        ).run(feature, ticket, message === "-" ? await text(process.stdin) : message);
        (await app.make(ConsoleOutputService)).result({
          level: "success",
          human: `Recorded work-round commit ${data.commit} for ${data.ticket}.`,
          data,
        });
      });
  }

  public async run(feature: string, ticket: string, message: string) {
    return (await this.app.make(TicketCommitService)).commit(feature, ticket, message);
  }
}
