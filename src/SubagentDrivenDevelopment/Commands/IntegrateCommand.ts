import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import { CommandOptions } from "@/Commands/CommandOptions";
import type { Application } from "@/Foundation/Application";
import { group } from "@/SubagentDrivenDevelopment/Commands/groups";
import type { TicketSelection } from "@/SubagentDrivenDevelopment/Models/Options";
import { TicketIntegrationService } from "@/SubagentDrivenDevelopment/Services/TicketIntegrationService";

export class IntegrateCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    group(root)
      .command("integrate")
      .description("Merge an accepted ticket commit into the feature branch.")
      .requiredOption("--spec <path>", "Canonical feature spec", CommandOptions.once("--spec"))
      .requiredOption("--ticket <id>", "Ticket ID", CommandOptions.once("--ticket"))
      .requiredOption("--author <author>", "Controller author", CommandOptions.once("--author"))
      .allowExcessArguments(false)
      .action(async (options: TicketSelection) => {
        const command = await (await createApp()).make(IntegrateCommand);
        console.log(JSON.stringify(await command.run(options), null, 2));
      });
  }

  public async run(options: TicketSelection) {
    this.assertApplicationBooted();
    return (await this.app.make(TicketIntegrationService)).integrate(options);
  }
}
