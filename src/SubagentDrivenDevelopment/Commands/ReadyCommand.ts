import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import { once } from "@/Commands/shared-options";
import type { Application } from "@/Foundation/Application";
import { group } from "@/SubagentDrivenDevelopment/Commands/groups";
import type { ReadyOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import { ReadinessService } from "@/SubagentDrivenDevelopment/Services/ReadinessService";

export class ReadyCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    group(root)
      .command("ready")
      .description("List ready issues and issues waiting on dependencies.")
      .requiredOption("--spec <path>", "Feature spec path", once("--spec"))
      .allowExcessArguments(false)
      .action(async (options: ReadyOptions) => {
        const command = await (await createApp()).make(ReadyCommand);
        console.log(JSON.stringify(await command.run(options), null, 2));
      });
  }

  public async run(options: ReadyOptions) {
    return (await this.app.make(ReadinessService)).ready(options);
  }
}
