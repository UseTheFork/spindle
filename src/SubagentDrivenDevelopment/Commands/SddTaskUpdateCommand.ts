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
  task: string;
  instructions?: string;
  writeScope?: string[];
  dependsOn?: string[];
  clearWriteScope?: boolean;
  clearDependencies?: boolean;
};

export class SddTaskUpdateCommand extends Command {
  public static register(program: CommanderCommand, createApp: () => Promise<Application>): void {
    const collect = (value: string, previous: string[] = []) => [...previous, value];
    SddCommandGroup.subgroup(program, "task", "Manage ticket tasks.")
      .command("update")
      .description("Update a pending task's instructions, write scope, or dependencies.")
      .requiredOption(
        "--feature <directory>",
        "Feature workspace",
        CommandOptions.once("--feature"),
      )
      .requiredOption("--ticket <id>", "Parent ticket ID", CommandOptions.once("--ticket"))
      .requiredOption("--task <id>", "Task ID", CommandOptions.once("--task"))
      .option("--instructions <text>", "New task instructions, or - for stdin")
      .option("--write-scope <path>", "Replace writable paths (repeatable)", collect)
      .option("--clear-write-scope", "Clear the write scope (delivery tasks only)")
      .option("--depends-on <task>", "Replace prerequisites (repeatable)", collect)
      .option("--clear-dependencies", "Remove all task prerequisites")
      .allowExcessArguments(false)
      .action(async (options: Options) => {
        if (options.writeScope && options.clearWriteScope) {
          throw new Error("--write-scope cannot be used with --clear-write-scope.");
        }
        if (options.dependsOn && options.clearDependencies) {
          throw new Error("--depends-on cannot be used with --clear-dependencies.");
        }
        const app = await createApp();
        const data = await (
          await app.make(SddTaskUpdateCommand)
        ).run({
          ...options,
          instructions:
            options.instructions === "-" ? await text(process.stdin) : options.instructions,
        });
        (await app.make(ConsoleOutputService)).result({
          level: "success",
          human: `Updated task ${data.task} on ${data.ticket}.`,
          data,
        });
      });
  }

  public async run({
    feature,
    ticket,
    task,
    instructions,
    writeScope,
    dependsOn,
    clearWriteScope,
    clearDependencies,
  }: Options) {
    this.assertApplicationBooted();
    return (await this.app.make(FeatureWorkspaceService)).updateTask(feature, ticket, task, {
      instructions,
      ...(clearWriteScope ? { writeScope: [] } : {}),
      ...(writeScope === undefined ? {} : { writeScope }),
      ...(clearDependencies ? { dependencies: [] } : {}),
      ...(dependsOn === undefined ? {} : { dependencies: dependsOn }),
    });
  }
}
