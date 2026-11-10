import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import { CommandOptions } from "@/Commands/CommandOptions";
import type { Application } from "@/Foundation/Application";
import { group } from "@/SubagentDrivenDevelopment/Commands/groups";
import type { FinishOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import { DeliveryService } from "@/SubagentDrivenDevelopment/Services/DeliveryService";

export class FinishCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    group(root)
      .command("finish")
      .description(
        "Complete feature delivery after all tickets are closed and required checks and reviews pass.",
      )
      .requiredOption("--spec <path>", "Feature spec path", CommandOptions.once("--spec"))
      .option(
        "--report <path>",
        "Optional or policy-required Markdown report inside feature reports/",
        CommandOptions.once("--report"),
      )
      .requiredOption("--author <author>", "Controller author", CommandOptions.once("--author"))
      .allowExcessArguments(false)
      .action(async (options: FinishOptions) => {
        const command = await (await createApp()).make(FinishCommand);
        console.log(JSON.stringify(await command.run(options), null, 2));
      });
  }

  public async run(options: FinishOptions) {
    this.assertApplicationBooted();
    return (await this.app.make(DeliveryService)).finish(options);
  }
}
