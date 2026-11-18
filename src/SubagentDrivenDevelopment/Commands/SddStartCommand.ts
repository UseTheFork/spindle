import { Command } from "@spindle/Commands/Command";
import { CommandOptions } from "@spindle/Commands/CommandOptions";
import type { Application } from "@spindle/Foundation/Application";
import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import { SddCommandGroup } from "@spindle/SubagentDrivenDevelopment/Commands/SddCommandGroup";
import { WorktreeStartService } from "@spindle/SubagentDrivenDevelopment/Services/WorktreeStartService";
import type { Command as CommanderCommand } from "commander";

export class SddStartCommand extends Command {
  public static register(program: CommanderCommand, createApp: () => Promise<Application>): void {
    SddCommandGroup.register(program)
      .command("start")
      .description("Create or resume a feature worktree.")
      .requiredOption(
        "--feature <directory>",
        "Feature workspace",
        CommandOptions.once("--feature"),
      )
      .allowExcessArguments(false)
      .action(async ({ feature }: { feature: string }) => {
        const app = await createApp();
        const data = await (await app.make(SddStartCommand)).run(feature);
        (await app.make(ConsoleOutputService)).result({
          level: "success",
          human: `Started feature ${data.feature}: ${data.worktree}`,
          data,
        });
      });
  }

  public async run(feature: string) {
    return (await this.app.make(WorktreeStartService)).start(feature);
  }
}
