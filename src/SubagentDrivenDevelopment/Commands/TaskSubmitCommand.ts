import { Command } from "@spindle/Commands/Command";
import { CommandOptions } from "@spindle/Commands/CommandOptions";
import type { Application } from "@spindle/Foundation/Application";
import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import { SddCommandGroups } from "@spindle/SubagentDrivenDevelopment/Commands/SddCommandGroups";
import type { TaskSubmitOptions } from "@spindle/SubagentDrivenDevelopment/Models/Options";
import { TaskService } from "@spindle/SubagentDrivenDevelopment/Services/TaskService";
import type { Command as CommanderCommand } from "commander";

export class TaskSubmitCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    const command = SddCommandGroups.group(root, "task")
      .command("submit")
      .description("Record a task report submitted for controller review.")
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
      .requiredOption("--actor <acting-agent>", "Acting controller", CommandOptions.once("--actor"))
      .allowExcessArguments(false);
    command.action(async (options: TaskSubmitOptions) => {
      const app = await createApp();
      const data = await (await app.make(TaskSubmitCommand)).run(options);
      (await app.make(ConsoleOutputService)).result({
        level: "success",
        human: `Recorded the report for ${data.task}.`,
        data,
      });
    });
  }

  public async run(options: TaskSubmitOptions) {
    this.assertApplicationBooted();
    return (await this.app.make(TaskService)).submit(options);
  }
}
