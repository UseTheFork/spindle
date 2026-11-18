import { text } from "node:stream/consumers";

import { Command } from "@spindle/Commands/Command";
import { CommandOptions } from "@spindle/Commands/CommandOptions";
import type { Application } from "@spindle/Foundation/Application";
import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import { SddCommandGroup } from "@spindle/SubagentDrivenDevelopment/Commands/SddCommandGroup";
import { TicketReviewService } from "@spindle/SubagentDrivenDevelopment/Services/TicketReviewService";
import type { Command as CommanderCommand } from "commander";

type Options = { feature: string; finding: string; reason: string };

export class SddFindingDismissCommand extends Command {
  public static register(program: CommanderCommand, createApp: () => Promise<Application>): void {
    SddCommandGroup.subgroup(program, "finding", "Decide ticket review findings.")
      .command("dismiss")
      .description("Dismiss an open ticket review finding with a reason.")
      .requiredOption(
        "--feature <directory>",
        "Feature workspace",
        CommandOptions.once("--feature"),
      )
      .requiredOption("--finding <id>", "Finding ID", CommandOptions.once("--finding"))
      .requiredOption(
        "--reason <text>",
        "Dismissal reason, or - for stdin",
        CommandOptions.once("--reason"),
      )
      .allowExcessArguments(false)
      .action(async (options: Options) => {
        const app = await createApp();
        const data = await (
          await app.make(SddFindingDismissCommand)
        ).run({
          ...options,
          reason: options.reason === "-" ? await text(process.stdin) : options.reason,
        });
        (await app.make(ConsoleOutputService)).result({
          level: "success",
          human: `Dismissed finding ${data.finding}.`,
          data,
        });
      });
  }

  public async run({ feature, finding, reason }: Options) {
    return (await this.app.make(TicketReviewService)).dismissFinding(feature, finding, reason);
  }
}
