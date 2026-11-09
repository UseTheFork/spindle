import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import { CommandOptions } from "@/Commands/CommandOptions";
import type { Application } from "@/Foundation/Application";
import { group } from "@/SubagentDrivenDevelopment/Commands/groups";
import type { AcceptOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import { IntegrationService } from "@/SubagentDrivenDevelopment/Services/IntegrationService";

export class AcceptCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    group(root)
      .command("accept")
      .description("Accept an issue with current checks and complete passing review coverage.")
      .requiredOption("--spec <path>", "Feature spec path", CommandOptions.once("--spec"))
      .requiredOption("--issue <id>", "Issue ID", CommandOptions.once("--issue"))
      .requiredOption("--author <author>", "Controller author", CommandOptions.once("--author"))
      .allowExcessArguments(false)
      .action(async (options: AcceptOptions) => {
        const command = await (await createApp()).make(AcceptCommand);
        console.log(JSON.stringify(await command.run(options), null, 2));
      });
  }

  public async run(options: AcceptOptions) {
    return (await this.app.make(IntegrationService)).accept(options);
  }
}
