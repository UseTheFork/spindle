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
      .requiredOption(
        "--feature <directory>",
        "Canonical feature spec",
        CommandOptions.once("--feature"),
      )
      .requiredOption("--ticket <id>", "Ticket ID", CommandOptions.once("--ticket"))
      .requiredOption("--actor <acting-agent>", "Controller author", CommandOptions.once("--actor"))
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
