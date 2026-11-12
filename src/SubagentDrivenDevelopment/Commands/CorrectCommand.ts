import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import { CommandOptions } from "@/Commands/CommandOptions";
import type { Application } from "@/Foundation/Application";
import { ConsoleOutputService } from "@/Foundation/ConsoleOutputService";
import { group } from "@/SubagentDrivenDevelopment/Commands/groups";
import type { CorrectOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import { CorrectionService } from "@/SubagentDrivenDevelopment/Services/CorrectionService";

export class CorrectCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    group(root)
      .command("correct")
      .description(
        "Persist a ticket-scoped or delivery-scoped correction attempt and return its fix assignment.",
      )
      .requiredOption("--spec <path>", "Feature spec path", CommandOptions.once("--spec"))
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
      .requiredOption("--author <author>", "Controller author", CommandOptions.once("--author"))
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
