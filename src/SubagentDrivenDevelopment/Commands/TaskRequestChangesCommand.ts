import { Command } from "@spindle/Commands/Command";
import { CommandOptions } from "@spindle/Commands/CommandOptions";
import type { Application } from "@spindle/Foundation/Application";
import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import { SddCommandGroups } from "@spindle/SubagentDrivenDevelopment/Commands/SddCommandGroups";
import type { TaskRequestChangesOptions } from "@spindle/SubagentDrivenDevelopment/Models/Options";
import { TaskService } from "@spindle/SubagentDrivenDevelopment/Services/TaskService";
import type { Command as CommanderCommand } from "commander";

export class TaskRequestChangesCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    const command = SddCommandGroups.group(root, "task")
      .command("request-changes")
      .description("Request changes to a submitted task report.")
      .requiredOption(
        "--feature <directory>",
        "Feature workspace",
        CommandOptions.once("--feature"),
      )
      .requiredOption("--ticket <id>", "Ticket ID", CommandOptions.once("--ticket"))
      .requiredOption("--task <id>", "Task ID", CommandOptions.once("--task"))
      .requiredOption(
        "--assignment <id>",
        "Exact task assignment ID",
        CommandOptions.once("--assignment"),
      )
      .requiredOption("--details <text>", "Requested changes")
      .requiredOption("--actor <acting-agent>", "Acting controller", CommandOptions.once("--actor"))
      .allowExcessArguments(false);
    command.action(async (options: TaskRequestChangesOptions) => {
      const app = await createApp();
      const data = await (await app.make(TaskRequestChangesCommand)).run(options);
      (await app.make(ConsoleOutputService)).result({
        level: "success",
        human: `Requested changes for ${data.task}.`,
        data,
      });
    });
  }

  public async run(options: TaskRequestChangesOptions) {
    this.assertApplicationBooted();
    return (await this.app.make(TaskService)).requestChanges(options);
  }
}
