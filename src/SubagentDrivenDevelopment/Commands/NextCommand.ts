import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import { CommandOptions } from "@/Commands/CommandOptions";
import type { Application } from "@/Foundation/Application";
import { ConsoleOutputService } from "@/Foundation/ConsoleOutputService";
import { group } from "@/SubagentDrivenDevelopment/Commands/groups";
import { statusSummary } from "@/SubagentDrivenDevelopment/Commands/StatusSummary";
import type { NextOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import { DeliveryService } from "@/SubagentDrivenDevelopment/Services/DeliveryService";

export class NextCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    group(root)
      .command("next")
      .description("Show permitted ticket and whole-spec delivery actions without changing state.")
      .requiredOption("--spec <path>", "Feature spec path", CommandOptions.once("--spec"))
      .allowExcessArguments(false)
      .action(async (options: NextOptions) => {
        const app = await createApp();
        const command = await app.make(NextCommand);
        const data = await command.run(options);
        const output = await app.make(ConsoleOutputService);
        output.result({
          level: "info",
          human: statusSummary(data, options.spec, "Delivery status and permitted actions"),
          data,
        });
      });
  }

  public async run(options: NextOptions) {
    this.assertApplicationBooted();
    return (await this.app.make(DeliveryService)).next(options);
  }
}
