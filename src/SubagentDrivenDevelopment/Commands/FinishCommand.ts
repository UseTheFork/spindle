import type { Command as CommanderCommand } from "commander";

import { Command } from "@/commands/Command";
import { once } from "@/commands/shared-options";
import type { Application } from "@/foundation/Application";
import { group } from "@/SubagentDrivenDevelopment/Commands/groups";
import type { FinishOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import { DeliveryService } from "@/SubagentDrivenDevelopment/Services/DeliveryService";

export class FinishCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    group(root)
      .command("finish")
      .description(
        "Finish whole-spec delivery after integration, current aggregate evidence, and the stored retrospective policy.",
      )
      .requiredOption("--spec <path>", "Feature spec path", once("--spec"))
      .option(
        "--report <path>",
        "Optional or policy-required Markdown report inside feature reports/",
        once("--report"),
      )
      .requiredOption("--author <author>", "Controller author", once("--author"))
      .allowExcessArguments(false)
      .action(async (options: FinishOptions) => {
        const command = await (await createApp()).make(FinishCommand);
        console.log(JSON.stringify(await command.run(options), null, 2));
      });
  }

  public async run(options: FinishOptions) {
    return (await this.app.make(DeliveryService)).finish(options);
  }
}
