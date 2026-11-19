import { Command } from "@spindle/Commands/Command";
import { CommandOptions } from "@spindle/Commands/CommandOptions";
import type { Application } from "@spindle/Foundation/Application";
import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import { SddCommandGroup } from "@spindle/SubagentDrivenDevelopment/Commands/SddCommandGroup";
import { MergeOperationService } from "@spindle/SubagentDrivenDevelopment/Services/MergeOperationService";
import { SddReviewService } from "@spindle/SubagentDrivenDevelopment/Services/SddReviewService";
import { TaskDispatchService } from "@spindle/SubagentDrivenDevelopment/Services/TaskDispatchService";
import type { Command as CommanderCommand } from "commander";

type Options = {
  feature: string;
  task?: string;
  attempt?: string;
  review?: string;
  merge?: string;
};
type Selection =
  | { kind: "merge"; merge: string }
  | { kind: "review"; review: string }
  | { kind: "task"; task: string; attempt: number };

export class SddAssignmentCommand extends Command {
  public static register(program: CommanderCommand, createApp: () => Promise<Application>): void {
    SddCommandGroup.register(program)
      .command("assignment")
      .description("Read a task, review, or merge assignment.")
      .requiredOption(
        "--feature <directory>",
        "Absolute feature workspace path",
        CommandOptions.once("--feature"),
      )
      .option("--task <id>", "Task ID", CommandOptions.once("--task"))
      .option("--attempt <n>", "Current dispatch attempt", CommandOptions.once("--attempt"))
      .option("--review <id>", "Review ID", CommandOptions.once("--review"))
      .option("--merge <id>", "Merge operation ID", CommandOptions.once("--merge"))
      .allowExcessArguments(false)
      .action(async ({ feature, task, attempt, review, merge }: Options) => {
        let selection: Selection | undefined;
        if (
          merge !== undefined &&
          review === undefined &&
          task === undefined &&
          attempt === undefined
        ) {
          selection = { kind: "merge", merge };
        } else if (
          review !== undefined &&
          task === undefined &&
          attempt === undefined &&
          merge === undefined
        ) {
          selection = { kind: "review", review };
        } else if (
          review === undefined &&
          merge === undefined &&
          task !== undefined &&
          attempt !== undefined
        ) {
          selection = { kind: "task", task, attempt: Number(attempt) };
        }
        if (!selection) {
          throw new Error("Use either --task with --attempt, --review, or --merge.");
        }
        const app = await createApp();
        const command = await app.make(SddAssignmentCommand);
        const data =
          selection.kind === "merge"
            ? await command.merge(feature, selection.merge)
            : selection.kind === "review"
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
    return (await this.app.make(SddReviewService)).assignment(feature, reviewId);
  }

  public async merge(feature: string, operationId: string) {
    return (await this.app.make(MergeOperationService)).assignment(feature, operationId);
  }
}
