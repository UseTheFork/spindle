import { Command } from "@spindle/Commands/Command";
import { CommandOptions } from "@spindle/Commands/CommandOptions";
import type { Application } from "@spindle/Foundation/Application";
import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import { SddCommandGroups } from "@spindle/SubagentDrivenDevelopment/Commands/SddCommandGroups";
import type { TaskAssignOptions } from "@spindle/SubagentDrivenDevelopment/Models/Options";
import { TaskService } from "@spindle/SubagentDrivenDevelopment/Services/TaskService";
import type { Command as CommanderCommand } from "commander";

export class TaskAssignCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    const command = SddCommandGroups.group(root, "task")
      .command("assign")
      .description("Assign a task to a worker and return its handoff.")
      .requiredOption(
        "--feature <directory>",
        "Feature workspace",
        CommandOptions.once("--feature"),
      )
      .requiredOption("--ticket <id>", "Ticket ID", CommandOptions.once("--ticket"))
      .requiredOption("--task <id>", "Task ID", CommandOptions.once("--task"))
      .requiredOption(
        "--worker <identity>",
        "Assigned worker identity",
        CommandOptions.once("--worker"),
      )
      .requiredOption("--actor <acting-agent>", "Acting controller", CommandOptions.once("--actor"))
      .allowExcessArguments(false);
    command.action(async (options: TaskAssignOptions) => {
      const app = await createApp();
      const data = await (await app.make(TaskAssignCommand)).run(options);
      (await app.make(ConsoleOutputService)).result({
        level: "success",
        human: `Assigned ${data.task} to ${data.assignment.worker}.`,
        data,
      });
    });
  }

  public async run(options: TaskAssignOptions) {
    this.assertApplicationBooted();
    return (await this.app.make(TaskService)).assign(options);
  }
}
