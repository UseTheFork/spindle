import { Command } from "@spindle/Commands/Command";
import { CommandOptions } from "@spindle/Commands/CommandOptions";
import type { Application } from "@spindle/Foundation/Application";
import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import { SddCommandGroup } from "@spindle/SubagentDrivenDevelopment/Commands/SddCommandGroup";
import { MergeOperationService } from "@spindle/SubagentDrivenDevelopment/Services/MergeOperationService";
import type { Command as CommanderCommand } from "commander";

type Options = { feature: string; merge: string };

export class SddMergeRecordCommand extends Command {
  public static register(program: CommanderCommand, createApp: () => Promise<Application>): void {
    SddCommandGroup.subgroup(program, "merge", "Record agent-performed merge operations.")
      .command("record")
      .description("Verify a merge, then verify its cleanup.")
      .requiredOption(
        "--feature <directory>",
        "Feature workspace",
        CommandOptions.once("--feature"),
      )
      .requiredOption("--merge <id>", "Merge operation ID", CommandOptions.once("--merge"))
      .allowExcessArguments(false)
      .action(async ({ feature, merge }: Options) => {
        const app = await createApp();
        const data = await (await app.make(SddMergeRecordCommand)).run(feature, merge);
        (await app.make(ConsoleOutputService)).result({
          level: "success",
          human:
            data.phase === "cleanup"
              ? `Merge ${merge} recorded. Remove its source worktree and branch, then record again.`
              : `Merge operation ${merge} completed.`,
          data,
        });
      });
  }

  public async run(feature: string, merge: string) {
    return (await this.app.make(MergeOperationService)).record(feature, merge);
  }
}
