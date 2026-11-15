import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import { CommandOptions } from "@/Commands/CommandOptions";
import type { Application } from "@/Foundation/Application";
import { ConsoleOutputService } from "@/Foundation/ConsoleOutputService";
import { SddCommandGroups } from "@/SubagentDrivenDevelopment/Commands/SddCommandGroups";
import type { NextOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import { DeliveryService } from "@/SubagentDrivenDevelopment/Services/DeliveryService";
import { StatusSummaryService } from "@/SubagentDrivenDevelopment/Services/StatusSummaryService";

export class NextCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    SddCommandGroups.group(root)
      .command("next")
      .description("Show permitted ticket and whole-spec delivery actions without changing state.")
      .requiredOption(
        "--feature <directory>",
        "Feature workspace directory",
        CommandOptions.once("--feature"),
      )
      .allowExcessArguments(false)
      .action(async (options: NextOptions) => {
        const app = await createApp();
        const command = await app.make(NextCommand);
        const data = await command.run(options);
        const output = await app.make(ConsoleOutputService);
        const summary = await app.make(StatusSummaryService);
        output.result({
          level: "info",
          human: summary.nextSummary(data),
          data,
        });
      });
  }

  public async run(options: NextOptions) {
    this.assertApplicationBooted();
    return (await this.app.make(DeliveryService)).next(options);
  }
}
