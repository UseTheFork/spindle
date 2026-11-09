import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import { CommandOptions } from "@/Commands/CommandOptions";
import type { Application } from "@/Foundation/Application";
import { group } from "@/SubagentDrivenDevelopment/Commands/groups";
import type { IntegrateOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import { IntegrationService } from "@/SubagentDrivenDevelopment/Services/IntegrationService";

export class IntegrateCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    group(root)
      .command("integrate")
      .description("Prepare accepted files for caller-owned commit or confirm an existing commit.")
      .requiredOption("--spec <path>", "Feature spec path", CommandOptions.once("--spec"))
      .requiredOption("--issue <id>", "Issue ID", CommandOptions.once("--issue"))
      .option(
        "--commit <sha>",
        "Verify an existing caller-created commit",
        CommandOptions.once("--commit"),
      )
      .requiredOption("--author <author>", "Controller author", CommandOptions.once("--author"))
      .allowExcessArguments(false)
      .action(async (options: IntegrateOptions) => {
        const command = await (await createApp()).make(IntegrateCommand);
        console.log(JSON.stringify(await command.run(options), null, 2));
      });
  }

  public async run(options: IntegrateOptions) {
    return (await this.app.make(IntegrationService)).integrate(options);
  }
}
