import { Command } from "@spindle/Commands/Command";
import { CommandOptions } from "@spindle/Commands/CommandOptions";
import type { Application } from "@spindle/Foundation/Application";
import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import { SddCommandGroup } from "@spindle/SubagentDrivenDevelopment/Commands/SddCommandGroup";
import { TaskDispatchService } from "@spindle/SubagentDrivenDevelopment/Services/TaskDispatchService";
import type { Command as CommanderCommand } from "commander";

type Options = { feature: string; task: string; attempt: string };

export class SddTaskSubmitCommand extends Command {
  public static register(program: CommanderCommand, createApp: () => Promise<Application>): void {
    SddCommandGroup.subgroup(program, "task", "Manage ticket tasks.")
      .command("submit")
      .description("Record completion of an ordinary task after its worker stops.")
      .requiredOption(
        "--feature <directory>",
        "Feature workspace",
        CommandOptions.once("--feature"),
      )
      .requiredOption("--task <id>", "Task ID", CommandOptions.once("--task"))
      .requiredOption("--attempt <n>", "Current dispatch attempt", CommandOptions.once("--attempt"))
      .allowExcessArguments(false)
      .action(async ({ feature, task, attempt }: Options) => {
        const app = await createApp();
        const data = await (
          await app.make(SddTaskSubmitCommand)
        ).run(feature, task, Number(attempt));
        (await app.make(ConsoleOutputService)).result({
          level: "success",
          human: `Recorded ${data.task}, attempt ${data.attempt}, as Done.`,
          data,
        });
      });
  }

  public async run(feature: string, task: string, attempt: number) {
    return (await this.app.make(TaskDispatchService)).submit(feature, task, attempt);
  }
}
