import { Command } from "@spindle/Commands/Command";
import { CommandOptions } from "@spindle/Commands/CommandOptions";
import type { Application } from "@spindle/Foundation/Application";
import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import { SddCommandGroups } from "@spindle/SubagentDrivenDevelopment/Commands/SddCommandGroups";
import { TaskCommandFields } from "@spindle/SubagentDrivenDevelopment/Commands/TaskCommandFields";
import type { TaskCreateOptions } from "@spindle/SubagentDrivenDevelopment/Models/Options";
import { TaskService } from "@spindle/SubagentDrivenDevelopment/Services/TaskService";
import type { Command as CommanderCommand } from "commander";

export class TaskCreateCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    const command = SddCommandGroups.group(root, "task")
      .command("create")
      .description("Create a task definition under a ticket.")
      .requiredOption(
        "--feature <directory>",
        "Feature workspace",
        CommandOptions.once("--feature"),
      )
      .requiredOption("--ticket <id>", "Ticket ID", CommandOptions.once("--ticket"))
      .requiredOption("--actor <acting-agent>", "Acting author", CommandOptions.once("--actor"));
    TaskCommandFields.configure(command, true)
      .allowExcessArguments(false)
      .action(async (options: TaskCreateOptions) => {
        TaskCommandFields.lists(options, true);
        const app = await createApp();
        const data = await (await app.make(TaskCreateCommand)).run(options);
        (await app.make(ConsoleOutputService)).result({
          level: "success",
          human: `Created task ${data.task} for ${data.ticket}.`,
          data,
        });
      });
  }

  public async run(options: TaskCreateOptions) {
    this.assertApplicationBooted();
    return (await this.app.make(TaskService)).create(options);
  }
}
