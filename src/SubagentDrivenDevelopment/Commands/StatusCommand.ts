import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import { once } from "@/Commands/shared-options";
import type { Application } from "@/Foundation/Application";
import { group } from "@/SubagentDrivenDevelopment/Commands/groups";
import type { StatusOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import { FeatureInspectionService } from "@/SubagentDrivenDevelopment/Services/FeatureInspectionService";

export class StatusCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    group(root)
      .command("status")
      .description("Inspect state, permitted actions, assignments, and blockers.")
      .requiredOption("--spec <path>", "Feature spec path", once("--spec"))
      .allowExcessArguments(false)
      .action(async (options: StatusOptions) => {
        const command = await (await createApp()).make(StatusCommand);
        console.log(JSON.stringify(await command.run(options), null, 2));
      });
  }

  public async run(options: StatusOptions) {
    return (await this.app.make(FeatureInspectionService)).status(options);
  }
}
