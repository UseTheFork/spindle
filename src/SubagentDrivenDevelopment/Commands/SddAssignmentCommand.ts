import { Command } from "@spindle/Commands/Command";
import { CommandOptions } from "@spindle/Commands/CommandOptions";
import type { Application } from "@spindle/Foundation/Application";
import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import { SddCommandGroup } from "@spindle/SubagentDrivenDevelopment/Commands/SddCommandGroup";
import { TaskDispatchService } from "@spindle/SubagentDrivenDevelopment/Services/TaskDispatchService";
import type { Command as CommanderCommand } from "commander";

type Options = { feature: string; task: string; attempt: string };

export class SddAssignmentCommand extends Command {
  public static register(program: CommanderCommand, createApp: () => Promise<Application>): void {
    SddCommandGroup.register(program)
      .command("assignment")
      .description("Read a worker's current task assignment.")
      .requiredOption(
        "--feature <directory>",
        "Absolute feature workspace path",
        CommandOptions.once("--feature"),
      )
      .requiredOption("--task <id>", "Task ID", CommandOptions.once("--task"))
      .requiredOption("--attempt <n>", "Current dispatch attempt", CommandOptions.once("--attempt"))
      .allowExcessArguments(false)
      .action(async ({ feature, task, attempt }: Options) => {
        const app = await createApp();
        const data = await (
          await app.make(SddAssignmentCommand)
        ).run(feature, task, Number(attempt));
        (await app.make(ConsoleOutputService)).result({
          level: "info",
          human: JSON.stringify(data, null, 2),
          data,
        });
      });
  }

  public async run(feature: string, task: string, attempt: number) {
    return (await this.app.make(TaskDispatchService)).assignment(feature, task, attempt);
  }
}
