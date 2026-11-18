import { Command } from "@spindle/Commands/Command";
import { CommandOptions } from "@spindle/Commands/CommandOptions";
import type { Application } from "@spindle/Foundation/Application";
import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import { SddCommandGroup } from "@spindle/SubagentDrivenDevelopment/Commands/SddCommandGroup";
import { TaskDispatchService } from "@spindle/SubagentDrivenDevelopment/Services/TaskDispatchService";
import type { Command as CommanderCommand } from "commander";

type Options = { feature: string; task: string; retryStoppedAttempt?: string };

export class SddDispatchCommand extends Command {
  public static register(program: CommanderCommand, createApp: () => Promise<Application>): void {
    SddCommandGroup.register(program)
      .command("dispatch")
      .description("Dispatch a ready task and print its assignment command.")
      .requiredOption(
        "--feature <directory>",
        "Feature workspace",
        CommandOptions.once("--feature"),
      )
      .requiredOption("--task <id>", "Task ID", CommandOptions.once("--task"))
      .option(
        "--retry-stopped-attempt <n>",
        "Confirm that the worker for the current attempt has stopped and retry its task",
        CommandOptions.once("--retry-stopped-attempt"),
      )
      .allowExcessArguments(false)
      .action(async ({ feature, task, retryStoppedAttempt }: Options) => {
        const app = await createApp();
        const data = await (
          await app.make(SddDispatchCommand)
        ).run(
          feature,
          task,
          retryStoppedAttempt === undefined ? undefined : Number(retryStoppedAttempt),
        );
        (await app.make(ConsoleOutputService)).result({
          level: "success",
          human: [`Dispatched ${data.task}, attempt ${data.attempt}.`, data.assignmentCommand],
          data,
        });
      });
  }

  public async run(feature: string, task: string, stoppedAttempt?: number) {
    return (await this.app.make(TaskDispatchService)).dispatch(feature, task, stoppedAttempt);
  }
}
