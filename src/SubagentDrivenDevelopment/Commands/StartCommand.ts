import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import { CommandOptions } from "@/Commands/CommandOptions";
import type { Application } from "@/Foundation/Application";
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
        const command = await (await createApp()).make(StartCommand);
        console.log(JSON.stringify(await command.run(options), null, 2));
      });
  }

  public async run(options: StartOptions) {
    this.assertApplicationBooted();
    return (await this.app.make(FeatureWorktreeService)).start(options);
  }
}
