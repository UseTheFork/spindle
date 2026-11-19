import { Command } from "@spindle/Commands/Command";
import { CommandOptions } from "@spindle/Commands/CommandOptions";
import type { Application } from "@spindle/Foundation/Application";
import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import { SddCommandGroup } from "@spindle/SubagentDrivenDevelopment/Commands/SddCommandGroup";
import { FeatureWorkspaceService } from "@spindle/SubagentDrivenDevelopment/Services/FeatureWorkspaceService";
import type { Command as CommanderCommand } from "commander";

export class SddCreateCommand extends Command {
  public static register(program: CommanderCommand, createApp: () => Promise<Application>): void {
    SddCommandGroup.register(program)
      .command("create")
      .description("Create a numbered feature workspace with spec and design templates.")
      .requiredOption("--slug <slug>", "Lowercase feature slug", CommandOptions.once("--slug"))
      .allowExcessArguments(false)
      .action(async ({ slug }: { slug: string }) => {
        const app = await createApp();
        const command = await app.make(SddCreateCommand);
        const data = await command.run({ slug });
        (await app.make(ConsoleOutputService)).result({
          level: "success",
          human: `Created feature workspace ${data.name}: ${data.workspace}`,
          data,
        });
      });
  }

  public async run({ slug }: { slug: string }) {
    this.assertApplicationBooted();
    return (await this.app.make(FeatureWorkspaceService)).createNumbered(slug);
  }
}
