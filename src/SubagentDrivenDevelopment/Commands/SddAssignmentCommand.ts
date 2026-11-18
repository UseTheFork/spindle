import { Command } from "@spindle/Commands/Command";
import { CommandOptions } from "@spindle/Commands/CommandOptions";
import type { Application } from "@spindle/Foundation/Application";
import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import { SddCommandGroup } from "@spindle/SubagentDrivenDevelopment/Commands/SddCommandGroup";
import { TaskDispatchService } from "@spindle/SubagentDrivenDevelopment/Services/TaskDispatchService";
import { TicketReviewService } from "@spindle/SubagentDrivenDevelopment/Services/TicketReviewService";
import type { Command as CommanderCommand } from "commander";

type Options = { feature: string; task?: string; attempt?: string; review?: string };

export class SddAssignmentCommand extends Command {
  public static register(program: CommanderCommand, createApp: () => Promise<Application>): void {
    SddCommandGroup.register(program)
      .command("assignment")
      .description("Read a task or review assignment.")
      .requiredOption(
        "--feature <directory>",
        "Absolute feature workspace path",
        CommandOptions.once("--feature"),
      )
      .option("--task <id>", "Task ID", CommandOptions.once("--task"))
      .option("--attempt <n>", "Current dispatch attempt", CommandOptions.once("--attempt"))
      .option("--review <id>", "Review ID", CommandOptions.once("--review"))
      .allowExcessArguments(false)
      .action(async ({ feature, task, attempt, review }: Options) => {
        const selection =
          review !== undefined && task === undefined && attempt === undefined
            ? { review }
            : review === undefined && task !== undefined && attempt !== undefined
              ? { task, attempt: Number(attempt) }
              : undefined;
        if (!selection) throw new Error("Use either --task with --attempt or --review.");
        const app = await createApp();
        const command = await app.make(SddAssignmentCommand);
        const data =
          selection.review !== undefined
            ? await command.review(feature, selection.review)
            : await command.run(feature, selection.task, selection.attempt);
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

  public async review(feature: string, reviewId: string) {
    return (await this.app.make(TicketReviewService)).assignment(feature, reviewId);
  }
}
