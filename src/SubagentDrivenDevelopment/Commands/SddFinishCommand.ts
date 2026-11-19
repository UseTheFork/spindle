import { Command } from "@spindle/Commands/Command";
import { CommandOptions } from "@spindle/Commands/CommandOptions";
import type { Application } from "@spindle/Foundation/Application";
import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import { SddCommandGroup } from "@spindle/SubagentDrivenDevelopment/Commands/SddCommandGroup";
import { MergeOperationService } from "@spindle/SubagentDrivenDevelopment/Services/MergeOperationService";
import type { Command as CommanderCommand } from "commander";

export class SddFinishCommand extends Command {
  public static register(program: CommanderCommand, createApp: () => Promise<Application>): void {
    SddCommandGroup.register(program)
      .command("finish")
      .description("Create an agent assignment to finish a completed feature.")
      .requiredOption(
        "--feature <directory>",
        "Feature workspace",
        CommandOptions.once("--feature"),
      )
      .allowExcessArguments(false)
      .action(async ({ feature }: { feature: string }) => {
        const app = await createApp();
        const data = await (await app.make(SddFinishCommand)).run(feature);
        (await app.make(ConsoleOutputService)).result({
          level: "success",
          human: `Finish assignment created for ${data.feature}. Run ${data.assignmentCommand}.`,
          data,
        });
      });
  }

  public async run(feature: string) {
    return (await this.app.make(MergeOperationService)).finish(feature);
  }
}
