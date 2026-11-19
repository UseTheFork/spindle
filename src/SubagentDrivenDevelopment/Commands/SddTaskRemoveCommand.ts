import { Command } from "@spindle/Commands/Command";
import { CommandOptions } from "@spindle/Commands/CommandOptions";
import type { Application } from "@spindle/Foundation/Application";
import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import { SddCommandGroup } from "@spindle/SubagentDrivenDevelopment/Commands/SddCommandGroup";
import { FeatureWorkspaceService } from "@spindle/SubagentDrivenDevelopment/Services/FeatureWorkspaceService";
import type { Command as CommanderCommand } from "commander";

type Options = { feature: string; ticket: string; task: string };

export class SddTaskRemoveCommand extends Command {
  public static register(program: CommanderCommand, createApp: () => Promise<Application>): void {
    SddCommandGroup.subgroup(program, "task", "Manage ticket tasks.")
      .command("remove")
      .description("Remove a task before it is dispatched.")
      .requiredOption(
        "--feature <directory>",
        "Feature workspace",
        CommandOptions.once("--feature"),
      )
      .requiredOption("--ticket <id>", "Parent ticket ID", CommandOptions.once("--ticket"))
      .requiredOption("--task <id>", "Task ID", CommandOptions.once("--task"))
      .allowExcessArguments(false)
      .action(async (options: Options) => {
        const app = await createApp();
        const data = await (await app.make(SddTaskRemoveCommand)).run(options);
        (await app.make(ConsoleOutputService)).result({
          level: "success",
          human: `Removed task ${data.task} from ${data.ticket}.`,
          data,
        });
      });
  }

  public async run({ feature, ticket, task }: Options) {
    this.assertApplicationBooted();
    return (await this.app.make(FeatureWorkspaceService)).removeTask(feature, ticket, task);
  }
}
