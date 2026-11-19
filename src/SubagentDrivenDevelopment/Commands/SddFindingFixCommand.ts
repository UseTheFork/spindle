import { text } from "node:stream/consumers";

import { Command } from "@spindle/Commands/Command";
import { CommandOptions } from "@spindle/Commands/CommandOptions";
import type { Application } from "@spindle/Foundation/Application";
import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import { SddCommandGroup } from "@spindle/SubagentDrivenDevelopment/Commands/SddCommandGroup";
import { FeatureWorkspaceService } from "@spindle/SubagentDrivenDevelopment/Services/FeatureWorkspaceService";
import type { Command as CommanderCommand } from "commander";

type Options = {
  feature: string;
  finding: string;
  instructions: string;
  writeScope: string[];
  dependsOn?: string[];
};

export class SddFindingFixCommand extends Command {
  public static register(program: CommanderCommand, createApp: () => Promise<Application>): void {
    const collect = (value: string, previous: string[] = []) => [...previous, value];
    SddCommandGroup.subgroup(program, "finding", "Decide review findings.")
      .command("fix")
      .description("Create scoped fix work linked to an open finding.")
      .requiredOption(
        "--feature <directory>",
        "Feature workspace",
        CommandOptions.once("--feature"),
      )
      .requiredOption("--finding <id>", "Finding ID", CommandOptions.once("--finding"))
      .requiredOption(
        "--instructions <text>",
        "Task instructions, or - for stdin",
        CommandOptions.once("--instructions"),
      )
      .requiredOption(
        "--write-scope <path>",
        "Repository-relative writable file (repeatable)",
        collect,
      )
      .option("--depends-on <task>", "Prerequisite task in the same ticket (repeatable)", collect)
      .allowExcessArguments(false)
      .action(async (options: Options) => {
        const app = await createApp();
        const data = await (
          await app.make(SddFindingFixCommand)
        ).run({
          ...options,
          instructions:
            options.instructions === "-" ? await text(process.stdin) : options.instructions,
        });
        (await app.make(ConsoleOutputService)).result({
          level: "success",
          human: data.ticketCreated
            ? `Created fix ticket ${data.ticket} and task ${data.task} for finding ${data.finding}.`
            : `Created task ${data.task} for finding ${data.finding}.`,
          data,
        });
      });
  }

  public async run({ feature, finding, instructions, writeScope, dependsOn = [] }: Options) {
    return (await this.app.make(FeatureWorkspaceService)).createFindingFixTask(feature, finding, {
      instructions,
      writeScope,
      dependencies: dependsOn,
    });
  }
}
