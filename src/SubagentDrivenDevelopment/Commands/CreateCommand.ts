import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import { CommandOptions } from "@/Commands/CommandOptions";
import type { Application } from "@/Foundation/Application";
import { group } from "@/SubagentDrivenDevelopment/Commands/groups";
import type { CreateOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import { validateCreateOptions } from "@/SubagentDrivenDevelopment/Policies/InputValidation";
import { FeatureCreationService } from "@/SubagentDrivenDevelopment/Services/FeatureCreationService";

export class CreateCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    group(root)
      .command("create")
      .description("Create a numbered SDD feature workspace and initial ledger.")
      .requiredOption("--title <title>", "Feature title", CommandOptions.once("--title"))
      .requiredOption("--author <author>", "Creation author", CommandOptions.once("--author"))
      .option("--require-retrospective", "Require a retrospective when finishing this feature")
      .allowExcessArguments(false)
      .action(async (options: CreateOptions) => {
        validateCreateOptions(options);
        const command = await (await createApp()).make(CreateCommand);
        console.log(JSON.stringify(await command.run(options), null, 2));
      });
  }

  public async run(options: CreateOptions) {
    return (await this.app.make(FeatureCreationService)).create(options);
  }
}
