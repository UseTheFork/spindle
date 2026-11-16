import { Command } from "@spindle/Commands/Command";
import { CommandOptions } from "@spindle/Commands/CommandOptions";
import type { Application } from "@spindle/Foundation/Application";
import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import { SddCommandGroups } from "@spindle/SubagentDrivenDevelopment/Commands/SddCommandGroups";
import { TaskCommandFields } from "@spindle/SubagentDrivenDevelopment/Commands/TaskCommandFields";
import type { TaskUpdateOptions } from "@spindle/SubagentDrivenDevelopment/Models/Options";
import { TaskService } from "@spindle/SubagentDrivenDevelopment/Services/TaskService";
import type { Command as CommanderCommand } from "commander";

export class TaskUpdateCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    const command = SddCommandGroups.group(root, "task")
      .command("update")
      .description("Update selected fields of a task definition.")
      .requiredOption(
        "--feature <directory>",
        "Feature workspace",
        CommandOptions.once("--feature"),
      )
      .requiredOption("--ticket <id>", "Ticket ID", CommandOptions.once("--ticket"))
      .requiredOption("--task <id>", "Task ID", CommandOptions.once("--task"))
      .requiredOption("--actor <acting-agent>", "Acting author", CommandOptions.once("--actor"));
    TaskCommandFields.configure(command, false)
      .allowExcessArguments(false)
      .action(async (options: TaskUpdateOptions) => {
        TaskCommandFields.lists(options, false);
        const app = await createApp();
        const data = await (await app.make(TaskUpdateCommand)).run(options);
        (await app.make(ConsoleOutputService)).result({
          level: "success",
          human: `Updated task ${data.task} for ${data.ticket}.`,
          data,
        });
      });
  }

  public async run(options: TaskUpdateOptions) {
    this.assertApplicationBooted();
    return (await this.app.make(TaskService)).update(options);
  }
}
