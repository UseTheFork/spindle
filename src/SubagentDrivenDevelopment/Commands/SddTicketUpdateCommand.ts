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
  title?: string;
  requirements?: string;
  acceptanceCriteria?: string;
  dependsOn?: string[];
  clearDependencies?: boolean;
};

export class SddTicketUpdateCommand extends Command {
  public static register(program: CommanderCommand, createApp: () => Promise<Application>): void {
    const collect = (value: string, previous: string[] = []) => [...previous, value];
    SddCommandGroup.subgroup(program, "ticket", "Manage feature tickets.")
      .command("update")
      .description("Update a ticket's title, requirements, acceptance criteria, or dependencies.")
      .requiredOption(
        "--feature <directory>",
        "Feature workspace",
        CommandOptions.once("--feature"),
      )
      .requiredOption("--ticket <id>", "Ticket ID", CommandOptions.once("--ticket"))
      .option("--title <title>", "New ticket title")
      .option("--requirements <text>", "New requirements, or - for stdin")
      .option("--acceptance-criteria <text>", "New acceptance criteria, or - for stdin")
      .option("--depends-on <ticket>", "Replace prerequisites (repeatable)", collect)
      .option("--clear-dependencies", "Remove all ticket prerequisites")
      .allowExcessArguments(false)
      .action(async (options: Options) => {
        if (options.dependsOn && options.clearDependencies) {
          throw new Error("--depends-on cannot be used with --clear-dependencies.");
        }
        if (options.requirements === "-" && options.acceptanceCriteria === "-") {
          throw new Error(
            "Only one of --requirements and --acceptance-criteria can read from stdin.",
          );
        }
        const app = await createApp();
        const data = await (
          await app.make(SddTicketUpdateCommand)
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
          human: `Updated ticket ${data.ticket}: ${data.path}`,
          data,
        });
      });
  }

  public async run({
    feature,
    ticket,
    title,
    requirements,
    acceptanceCriteria,
    dependsOn,
    clearDependencies,
  }: Options) {
    this.assertApplicationBooted();
    return (await this.app.make(FeatureWorkspaceService)).updateTicket(feature, ticket, {
      title,
      requirements,
      acceptanceCriteria,
      ...(clearDependencies ? { dependencies: [] } : {}),
      ...(dependsOn === undefined ? {} : { dependencies: dependsOn }),
    });
  }
}
