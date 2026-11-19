import { Command } from "@spindle/Commands/Command";
import { CommandOptions } from "@spindle/Commands/CommandOptions";
import type { Application } from "@spindle/Foundation/Application";
import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import { SddCommandGroup } from "@spindle/SubagentDrivenDevelopment/Commands/SddCommandGroup";
import { FeatureFinishService } from "@spindle/SubagentDrivenDevelopment/Services/FeatureFinishService";
import type { Command as CommanderCommand } from "commander";

export class SddFinishCommand extends Command {
  public static register(program: CommanderCommand, createApp: () => Promise<Application>): void {
    SddCommandGroup.register(program)
      .command("finish")
      .description("Fast-forward the original branch and clean up a completed feature.")
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
          human: `Finished feature ${data.feature} on ${data.originalBranch}.`,
          data,
        });
      });
  }

  public async run(feature: string) {
    return (await this.app.make(FeatureFinishService)).finish(feature);
  }
}
