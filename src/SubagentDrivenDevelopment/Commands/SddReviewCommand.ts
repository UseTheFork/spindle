import { Command } from "@spindle/Commands/Command";
import { CommandOptions } from "@spindle/Commands/CommandOptions";
import type { Application } from "@spindle/Foundation/Application";
import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import { SddCommandGroup } from "@spindle/SubagentDrivenDevelopment/Commands/SddCommandGroup";
import { TicketReviewService } from "@spindle/SubagentDrivenDevelopment/Services/TicketReviewService";
import type { Command as CommanderCommand } from "commander";

type Options = { feature: string; ticket?: string; scope?: string; focus?: string };

export class SddReviewCommand extends Command {
  public static register(program: CommanderCommand, createApp: () => Promise<Application>): void {
    SddCommandGroup.subgroup(program, "review", "Manage ticket acceptance reviews.")
      .requiredOption(
        "--feature <directory>",
        "Feature workspace",
        CommandOptions.once("--feature"),
      )
      .option("--ticket <id>", "Ticket ID", CommandOptions.once("--ticket"))
      .option("--scope <text>", "Review scope", CommandOptions.once("--scope"))
      .option("--focus <text>", "Optional review focus", CommandOptions.once("--focus"))
      .allowExcessArguments(false)
      .action(async ({ feature, ticket, scope, focus }: Options) => {
        if (!ticket) throw new Error("Review requires --ticket.");
        const app = await createApp();
        const data = await (await app.make(SddReviewCommand)).run(feature, ticket, scope, focus);
        (await app.make(ConsoleOutputService)).result({
          level: "success",
          human: [`Created review ${data.review} for ${data.ticket}.`, data.assignmentCommand],
          data,
        });
      });
  }

  public async run(
    feature: string,
    ticket: string,
    scope = "Combined ticket changes",
    focus?: string,
  ) {
    return (await this.app.make(TicketReviewService)).start(feature, ticket, scope, focus);
  }
}
