import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import { CommandOptions } from "@/Commands/CommandOptions";
import type { Application } from "@/Foundation/Application";
import { ConsoleOutputService } from "@/Foundation/ConsoleOutputService";
import { group } from "@/SubagentDrivenDevelopment/Commands/groups";
import { DeliveryService } from "@/SubagentDrivenDevelopment/Services/DeliveryService";
import type { FeatureFinishOptions } from "@/SubagentDrivenDevelopment/Services/FeatureFinalizationService";

export class FinishCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    group(root)
      .command("finish")
      .description(
        "Merge approved feature delivery, then clean up only after exact final-merge checks pass.",
      )
      .requiredOption("--spec <path>", "Feature spec path", CommandOptions.once("--spec"))
      .option(
        "--report <path>",
        "Optional or policy-required Markdown report inside feature reports/",
        CommandOptions.once("--report"),
      )
      .requiredOption("--author <author>", "Controller author", CommandOptions.once("--author"))
      .option("--confirm-records", "Confirm inspected canonical records may be committed")
      .allowExcessArguments(false)
      .action(async (options: FeatureFinishOptions) => {
        const app = await createApp();
        const command = await app.make(FinishCommand);
        const data = await command.run(options);
        const output = await app.make(ConsoleOutputService);
        output.result({
          level: "success",
          human: `Finished feature delivery for ${options.spec}.`,
          data,
        });
      });
  }

  public async run(options: FeatureFinishOptions) {
    this.assertApplicationBooted();
    return (await this.app.make(DeliveryService)).finish(options);
  }
}
