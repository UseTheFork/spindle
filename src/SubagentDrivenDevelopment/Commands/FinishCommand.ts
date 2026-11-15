import type { Command as CommanderCommand } from "commander";

import { Command } from "@spindle/Commands/Command";
import { CommandOptions } from "@spindle/Commands/CommandOptions";
import type { Application } from "@spindle/Foundation/Application";
import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import { SddCommandGroups } from "@spindle/SubagentDrivenDevelopment/Commands/SddCommandGroups";
import { DeliveryService } from "@spindle/SubagentDrivenDevelopment/Services/DeliveryService";
import type { FeatureFinishOptions } from "@spindle/SubagentDrivenDevelopment/Services/FeatureFinalizationService";
import { StatusSummaryService } from "@spindle/SubagentDrivenDevelopment/Services/StatusSummaryService";

export class FinishCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    SddCommandGroups.group(root)
      .command("finish")
      .description(
        "Merge approved feature delivery, then clean up only after final checks pass for the validation target.",
      )
      .requiredOption(
        "--feature <directory>",
        "Feature workspace directory",
        CommandOptions.once("--feature"),
      )
      .option(
        "--report <path>",
        "Optional or policy-required Markdown report inside feature reports/",
        CommandOptions.once("--report"),
      )
      .requiredOption("--actor <acting-agent>", "Controller author", CommandOptions.once("--actor"))
      .allowExcessArguments(false)
      .action(async (options: FeatureFinishOptions) => {
        const app = await createApp();
        const command = await app.make(FinishCommand);
        const data = await command.run(options);
        const output = await app.make(ConsoleOutputService);
        const summary = await app.make(StatusSummaryService);
        output.result({
          level: "success",
          human: summary.finishSummary(data),
          data,
        });
      });
  }

  public async run(options: FeatureFinishOptions) {
    this.assertApplicationBooted();
    return (await this.app.make(DeliveryService)).finish(options);
  }
}
