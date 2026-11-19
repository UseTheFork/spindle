import { Command } from "@spindle/Commands/Command";
import { CommandOptions } from "@spindle/Commands/CommandOptions";
import type { Application } from "@spindle/Foundation/Application";
import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import { SddCommandGroup } from "@spindle/SubagentDrivenDevelopment/Commands/SddCommandGroup";
import { MergeOperationService } from "@spindle/SubagentDrivenDevelopment/Services/MergeOperationService";
import type { Command as CommanderCommand } from "commander";

type Options = { feature: string; ticket: string };

export class SddIntegrateCommand extends Command {
  public static register(program: CommanderCommand, createApp: () => Promise<Application>): void {
    SddCommandGroup.register(program)
      .command("integrate")
      .description("Integrate an accepted ticket into its feature.")
      .requiredOption(
        "--feature <directory>",
        "Feature workspace",
        CommandOptions.once("--feature"),
      )
      .requiredOption("--ticket <id>", "Ticket ID", CommandOptions.once("--ticket"))
      .allowExcessArguments(false)
      .action(async ({ feature, ticket }: Options) => {
        const app = await createApp();
        const data = await (await app.make(SddIntegrateCommand)).run(feature, ticket);
        const human = `Merge assignment created for ${ticket}. Run ${data.assignmentCommand}.`;
        (await app.make(ConsoleOutputService)).result({ level: "success", human, data });
      });
  }

  public async run(feature: string, ticket: string) {
    return (await this.app.make(MergeOperationService)).integrate(feature, ticket);
  }
}
