import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import { CommandOptions } from "@/Commands/CommandOptions";
import type { Application } from "@/Foundation/Application";
import { ConsoleOutputService } from "@/Foundation/ConsoleOutputService";
import { SddCommandGroups } from "@/SubagentDrivenDevelopment/Commands/SddCommandGroups";
import type { CreateOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import { InputValidation } from "@/SubagentDrivenDevelopment/Policies/InputValidation";
import { FeatureCreationService } from "@/SubagentDrivenDevelopment/Services/FeatureCreationService";

export class CreateCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    SddCommandGroups.group(root)
      .command("create")
      .description("Create a numbered SDD feature workspace with spec template and initial ledger.")
      .requiredOption("--title <title>", "Feature title", CommandOptions.once("--title"))
      .requiredOption("--actor <acting-agent>", "Acting agent", CommandOptions.once("--actor"))
      .option("--require-retrospective", "Require a retrospective when finishing this feature")
      .option("--with-design", "Copy the design template into the feature workspace")
      .allowExcessArguments(false)
      .action(async (options: Omit<CreateOptions, "author"> & { actor: string }) => {
        const serviceOptions: CreateOptions = { ...options, author: options.actor };
        InputValidation.validateCreateOptions(serviceOptions);
        const app = await createApp();
        const command = await app.make(CreateCommand);
        const data = await command.run(serviceOptions);
        const output = await app.make(ConsoleOutputService);
        output.result({
          level: "success",
          human: `Created feature workspace for "${options.title}".`,
          data,
        });
      });
  }

  public async run(options: CreateOptions) {
    this.assertApplicationBooted();
    return (await this.app.make(FeatureCreationService)).create(options);
  }
}
