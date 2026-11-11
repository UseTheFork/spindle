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
      .description("Accept the current reviewed ticket commit.")
      .requiredOption("--spec <path>", "Canonical feature spec", CommandOptions.once("--spec"))
      .requiredOption("--ticket <id>", "Ticket ID", CommandOptions.once("--ticket"))
      .requiredOption("--author <author>", "Controller author", CommandOptions.once("--author"))
      .allowExcessArguments(false)
      .action(async (options: AcceptOptions) => {
        const command = await (await createApp()).make(AcceptCommand);
        console.log(JSON.stringify(await command.run(options), null, 2));
      });
  }

  public async run(options: AcceptOptions) {
    this.assertApplicationBooted();
    return (await this.app.make(IntegrationService)).accept(options);
  }
}
