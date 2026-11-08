import type { Command as CommanderCommand } from "commander";

import { Command } from "@/commands/Command";
import { once } from "@/commands/shared-options";
import type { Application } from "@/foundation/Application";
import { group } from "@/SubagentDrivenDevelopment/Commands/groups";
import type { NextOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import { DeliveryService } from "@/SubagentDrivenDevelopment/Services/DeliveryService";

export class NextCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    group(root)
      .command("next")
      .description("Show permitted issue and whole-spec delivery actions without changing state.")
      .requiredOption("--spec <path>", "Feature spec path", once("--spec"))
      .allowExcessArguments(false)
      .action(async (options: NextOptions) => {
        const command = await (await createApp()).make(NextCommand);
        console.log(JSON.stringify(await command.run(options), null, 2));
      });
  }

  public async run(options: NextOptions) {
    return (await this.app.make(DeliveryService)).next(options);
  }
}
