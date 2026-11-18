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
  title: string;
  requirements: string;
  acceptanceCriteria: string;
  dependsOn?: string[];
};

export class SddTicketCreateCommand extends Command {
  public static register(program: CommanderCommand, createApp: () => Promise<Application>): void {
    SddCommandGroup.subgroup(program, "ticket", "Manage feature tickets.")
      .command("create")
      .description("Create a ticket with requirements and acceptance criteria.")
      .requiredOption(
        "--feature <directory>",
        "Feature workspace",
        CommandOptions.once("--feature"),
      )
      .requiredOption("--title <title>", "Ticket title", CommandOptions.once("--title"))
      .requiredOption(
        "--requirements <text>",
        "Requirements, or - for stdin",
        CommandOptions.once("--requirements"),
      )
      .requiredOption(
        "--acceptance-criteria <text>",
        "Acceptance criteria, or - for stdin",
        CommandOptions.once("--acceptance-criteria"),
      )
      .option(
        "--depends-on <ticket>",
        "Prerequisite ticket (repeatable)",
        (value: string, previous: string[]) => [...previous, value],
        [],
      )
      .allowExcessArguments(false)
      .action(async (options: Options) => {
        if (options.requirements === "-" && options.acceptanceCriteria === "-") {
          throw new Error(
            "Only one of --requirements and --acceptance-criteria can read from stdin.",
          );
        }
        const app = await createApp();
        const data = await (
          await app.make(SddTicketCreateCommand)
        ).run({
          ...options,
          requirements:
            options.requirements === "-" ? await text(process.stdin) : options.requirements,
          acceptanceCriteria:
            options.acceptanceCriteria === "-"
              ? await text(process.stdin)
              : options.acceptanceCriteria,
        });
        (await app.make(ConsoleOutputService)).result({
          level: "success",
          human: `Created ticket ${data.ticket}: ${data.path}`,
          data,
        });
      });
  }

  public async run({ feature, title, requirements, acceptanceCriteria, dependsOn = [] }: Options) {
    this.assertApplicationBooted();
    return (await this.app.make(FeatureWorkspaceService)).createTicket(feature, {
      title,
      requirements,
      acceptanceCriteria,
      dependencies: dependsOn,
    });
  }
}
