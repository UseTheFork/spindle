import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import { once } from "@/Commands/shared-options";
import type { Application } from "@/Foundation/Application";
import { group } from "@/SubagentDrivenDevelopment/Commands/groups";
import type { IntegrateOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import { IntegrationService } from "@/SubagentDrivenDevelopment/Services/IntegrationService";

export class IntegrateCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    group(root)
      .command("integrate")
      .description("Prepare accepted files for caller-owned commit or confirm an existing commit.")
      .requiredOption("--spec <path>", "Feature spec path", once("--spec"))
      .requiredOption("--issue <id>", "Issue ID", once("--issue"))
      .option("--commit <sha>", "Verify an existing caller-created commit", once("--commit"))
      .requiredOption("--author <author>", "Controller author", once("--author"))
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
