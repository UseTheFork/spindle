import type { Command as CommanderCommand } from "commander";

import { Command } from "@spindle/Commands/Command";
import { CommandOptions } from "@spindle/Commands/CommandOptions";
import type { Application } from "@spindle/Foundation/Application";
import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import { SddCommandGroups } from "@spindle/SubagentDrivenDevelopment/Commands/SddCommandGroups";
import type { CorrectOptions } from "@spindle/SubagentDrivenDevelopment/Models/Options";
import { CorrectionService } from "@spindle/SubagentDrivenDevelopment/Services/CorrectionService";

export class CorrectCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    SddCommandGroups.group(root)
      .command("correct")
      .description(
        "Persist a ticket-scoped or delivery-scoped correction attempt and return its fix assignment.",
      )
      .requiredOption(
        "--feature <directory>",
        "Feature workspace directory",
        CommandOptions.once("--feature"),
      )
      .option("--ticket <id>", "Ticket ID", CommandOptions.once("--ticket"))
      .option("--scope <scope>", "Workflow scope: delivery")
      .option("--findings <ids...>", "Selected actionable canonical finding IDs")
      .option("--check-failure <command>", "Exact non-mechanical failed check command")
      .requiredOption(
        "--details <details>",
        "Correction objective or adjudication rationale",
        CommandOptions.once("--details"),
      )
      .option("--decision <decision>", "Continuation decision: continue or pause")
      .option("--assessment <assessment>", "Recorded progress assessment for the prior attempt")
      .option(
        "--reason <reason>",
        "Pause reason: no-progress, repeated-failure, recurring-blocker, requirements-disagreement, worker-blocked",
      )
      .requiredOption("--actor <acting-agent>", "Controller author", CommandOptions.once("--actor"))
      .allowExcessArguments(false)
      .action(async (options: CorrectOptions) => {
        if (options.scope !== undefined && options.scope !== "delivery") {
          throw new Error("--scope must be 'delivery'.");
        }
        if (Boolean(options.ticket) === (options.scope === "delivery")) {
          throw new Error("correct needs exactly one of --ticket or --scope delivery.");
        }
        const app = await createApp();
        const command = await app.make(CorrectCommand);
        const data = await command.run(options);
        const output = await app.make(ConsoleOutputService);
        const human = data.assignment
          ? [
              `Correction assignment ${data.assignment.id} for ${data.ticket ? `ticket ${data.ticket}` : "delivery"} (${data.assignment.status}).`,
              `Report: ${data.assignment.report}`,
              ...(data.assignment.workspace ? [`Workspace: ${data.assignment.workspace}`] : []),
              ...(data.assignment.branch ? [`Branch: ${data.assignment.branch}`] : []),
              ...(data.attempt ? [`Correction attempt: ${data.attempt.number}.`] : []),
            ]
          : [
              `Correction paused for ${data.ticket ? `ticket ${data.ticket}` : "delivery"}; execution state: ${data.execution}.`,
              ...(data.adjudication
                ? [`Adjudication: ${data.adjudication.reason} — ${data.adjudication.details}`]
                : []),
            ];
        output.result({
          level: "success",
          human,
          data,
        });
      });
  }

  public async run(options: CorrectOptions) {
    this.assertApplicationBooted();
    return (await this.app.make(CorrectionService)).correct(options);
  }
}
