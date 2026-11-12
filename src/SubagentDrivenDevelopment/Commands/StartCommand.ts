import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import { CommandOptions } from "@/Commands/CommandOptions";
import type { Application } from "@/Foundation/Application";
import { ConsoleOutputService } from "@/Foundation/ConsoleOutputService";
import { group } from "@/SubagentDrivenDevelopment/Commands/groups";
import type { StartOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import { FeatureWorktreeService } from "@/SubagentDrivenDevelopment/Services/FeatureWorktreeService";

export class StartCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    group(root)
      .command("start")
      .description("Commit feature records and create a feature branch and worktree.")
      .requiredOption("--spec <path>", "Feature spec path", CommandOptions.once("--spec"))
      .requiredOption(
        "--workspace <directory>",
        "Existing absolute external directory for the new worktree",
        CommandOptions.once("--workspace"),
      )
      .requiredOption(
        "--confirm-records",
        "Confirm feature records were inspected for sensitive content",
      )
      .allowExcessArguments(false)
      .action(async (options: StartOptions) => {
        const app = await createApp();
        const command = await app.make(StartCommand);
        const data = await command.run(options);
        const output = await app.make(ConsoleOutputService);
        output.result({
          level: "success",
          human: `Started feature worktree for ${options.spec}.`,
          data,
        });
      });
  }

  public async run(options: StartOptions) {
    this.assertApplicationBooted();
    return (await this.app.make(FeatureWorktreeService)).start(options);
  }
}
