import { Command } from "@spindle/Commands/Command";
import { CommandOptions } from "@spindle/Commands/CommandOptions";
import type { Application } from "@spindle/Foundation/Application";
import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import { SddCommandGroup } from "@spindle/SubagentDrivenDevelopment/Commands/SddCommandGroup";
import type { TaskCheckpointInput } from "@spindle/SubagentDrivenDevelopment/Models/Task";
import { TaskDispatchService } from "@spindle/SubagentDrivenDevelopment/Services/TaskDispatchService";
import type { Command as CommanderCommand } from "commander";

type Options = TaskCheckpointInput & { feature: string; task: string; attempt: string };

export class SddTaskCheckpointCommand extends Command {
  public static register(program: CommanderCommand, createApp: () => Promise<Application>): void {
    const collect = (value: string, previous: string[] = []) => [...previous, value];
    SddCommandGroup.subgroup(program, "task", "Manage ticket tasks.")
      .command("checkpoint")
      .description("Record progress for an active task attempt without completing it.")
      .requiredOption(
        "--feature <directory>",
        "Feature workspace",
        CommandOptions.once("--feature"),
      )
      .requiredOption("--task <id>", "Task ID", CommandOptions.once("--task"))
      .requiredOption("--attempt <n>", "Current dispatch attempt", CommandOptions.once("--attempt"))
      .requiredOption(
        "--phase <text>",
        "Current work phase, such as planning, implementing, or checking",
        CommandOptions.once("--phase"),
      )
      .requiredOption("--summary <text>", "Progress summary", CommandOptions.once("--summary"))
      .requiredOption("--next <text>", "Intended next action", CommandOptions.once("--next"))
      .option("--blocker <text>", "Unresolved blocker", CommandOptions.once("--blocker"))
      .option(
        "--files-changed <path>",
        "Reported repository-relative changed file (repeatable)",
        collect,
      )
      .allowExcessArguments(false)
      .action(async ({ feature, task, attempt, ...input }: Options) => {
        const app = await createApp();
        const data = await (
          await app.make(SddTaskCheckpointCommand)
        ).run(feature, task, Number(attempt), input);
        (await app.make(ConsoleOutputService)).result({
          level: "success",
          human: `Recorded checkpoint for ${data.task}, attempt ${data.checkpoint.attempt}.`,
          data,
        });
      });
  }

  public async run(feature: string, task: string, attempt: number, input: TaskCheckpointInput) {
    return (await this.app.make(TaskDispatchService)).checkpoint(feature, task, attempt, input);
  }
}
