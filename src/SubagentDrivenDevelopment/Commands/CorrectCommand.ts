import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import { CommandOptions } from "@/Commands/CommandOptions";
import type { Application } from "@/Foundation/Application";
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
        const command = await (await createApp()).make(CorrectCommand);
        console.log(JSON.stringify(await command.run(options), null, 2));
      });
  }

  public async run(options: CorrectOptions) {
    this.assertApplicationBooted();
    return (await this.app.make(CorrectionService)).correct(options);
  }
}
