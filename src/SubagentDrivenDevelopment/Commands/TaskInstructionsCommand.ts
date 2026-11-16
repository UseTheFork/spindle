import { Command } from "@spindle/Commands/Command";
import { CommandOptions } from "@spindle/Commands/CommandOptions";
import type { Application } from "@spindle/Foundation/Application";
import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import { SddCommandGroups } from "@spindle/SubagentDrivenDevelopment/Commands/SddCommandGroups";
import type { TaskInstructionsOptions } from "@spindle/SubagentDrivenDevelopment/Models/Options";
import { TaskService } from "@spindle/SubagentDrivenDevelopment/Services/TaskService";
import type { Command as CommanderCommand } from "commander";

export class TaskInstructionsCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    const command = SddCommandGroups.group(root, "task")
      .command("instructions")
      .description("Read the current task handoff without changing workflow state.")
      .requiredOption(
        "--feature <directory>",
        "Feature workspace",
        CommandOptions.once("--feature"),
      )
      .requiredOption("--ticket <id>", "Ticket ID", CommandOptions.once("--ticket"))
      .requiredOption("--task <id>", "Task ID", CommandOptions.once("--task"))
      .allowExcessArguments(false);
    command.action(async (options: TaskInstructionsOptions) => {
      const app = await createApp();
      const data = await (await app.make(TaskInstructionsCommand)).run(options);
      (await app.make(ConsoleOutputService)).result({
        level: "success",
        human: `Returned the current handoff for ${data.task}.`,
        data,
      });
    });
  }

  public async run(options: TaskInstructionsOptions) {
    this.assertApplicationBooted();
    return (await this.app.make(TaskService)).instructions(options);
  }
}
