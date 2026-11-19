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
  ticket: string;
  instructions: string;
  writeScope: string[];
  context?: string[];
  dependsOn?: string[];
};

export class SddTaskCreateCommand extends Command {
  public static register(program: CommanderCommand, createApp: () => Promise<Application>): void {
    const collect = (value: string, previous: string[] = []) => [...previous, value];
    SddCommandGroup.subgroup(program, "task", "Manage ticket tasks.")
      .command("create")
      .description("Add a task with instructions and an explicit write scope.")
      .requiredOption(
        "--feature <directory>",
        "Feature workspace",
        CommandOptions.once("--feature"),
      )
      .requiredOption("--ticket <id>", "Parent ticket ID", CommandOptions.once("--ticket"))
      .requiredOption(
        "--instructions <text>",
        "Task instructions, or - for stdin",
        CommandOptions.once("--instructions"),
      )
      .requiredOption(
        "--write-scope <path>",
        "Planned repository-relative file (repeatable)",
        collect,
      )
      .option("--context <reference>", "Context file or link (repeatable)", collect)
      .option("--depends-on <task>", "Prerequisite task in the same ticket (repeatable)", collect)
      .allowExcessArguments(false)
      .action(async (options: Options) => {
        const app = await createApp();
        const data = await (
          await app.make(SddTaskCreateCommand)
        ).run({
          ...options,
          instructions:
            options.instructions === "-" ? await text(process.stdin) : options.instructions,
        });
        (await app.make(ConsoleOutputService)).result({
          level: "success",
          human: `Created task ${data.task}.`,
          data,
        });
      });
  }

  public async run({
    feature,
    ticket,
    instructions,
    writeScope,
    context,
    dependsOn = [],
  }: Options) {
    this.assertApplicationBooted();
    return (await this.app.make(FeatureWorkspaceService)).createTask(feature, ticket, {
      instructions,
      writeScope,
      context,
      dependencies: dependsOn,
    });
  }
}
