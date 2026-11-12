import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import { CommandOptions } from "@/Commands/CommandOptions";
import type { Application } from "@/Foundation/Application";
import { ConsoleOutputService } from "@/Foundation/ConsoleOutputService";
import { group } from "@/SubagentDrivenDevelopment/Commands/groups";
import type { IntegrateOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import { TicketIntegrationService } from "@/SubagentDrivenDevelopment/Services/TicketIntegrationService";

export class IntegrateCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    group(root)
      .command("integrate")
      .description("Merge a currently reviewed ticket commit into the feature branch.")
      .requiredOption("--spec <path>", "Canonical feature spec", CommandOptions.once("--spec"))
      .requiredOption("--ticket <id>", "Ticket ID", CommandOptions.once("--ticket"))
      .requiredOption("--author <author>", "Controller author", CommandOptions.once("--author"))
      .option(
        "--confirm-records",
        "Confirm that current canonical feature records were inspected before batching",
      )
      .allowExcessArguments(false)
      .action(async (options: IntegrateOptions) => {
        const app = await createApp();
        const command = await app.make(IntegrateCommand);
        const data = await command.run(options);
        const output = await app.make(ConsoleOutputService);
        output.result({
          level: "success",
          human: `Integrated ticket ${options.ticket}.`,
          data,
        });
      });
  }

  public async run(options: IntegrateOptions) {
    this.assertApplicationBooted();
    return (await this.app.make(TicketIntegrationService)).integrate(options);
  }
}
