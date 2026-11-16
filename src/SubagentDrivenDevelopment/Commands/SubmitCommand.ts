import type { Command as CommanderCommand } from "commander";

import { Command } from "@spindle/Commands/Command";
import { CommandOptions } from "@spindle/Commands/CommandOptions";
import type { Application } from "@spindle/Foundation/Application";
import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import { SddCommandGroups } from "@spindle/SubagentDrivenDevelopment/Commands/SddCommandGroups";
import type { SubmitOptions } from "@spindle/SubagentDrivenDevelopment/Models/Options";
import { SubmissionService } from "@spindle/SubagentDrivenDevelopment/Services/SubmissionService";

export class SubmitCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    const submitCommand = SddCommandGroups.group(root)
      .command("submit")
      .description("Register an implementation or review report.")
      .requiredOption(
        "--feature <directory>",
        "Feature workspace directory",
        CommandOptions.once("--feature"),
      )
      .option("--ticket <id>", "Ticket ID", CommandOptions.once("--ticket"))
      .option("--scope <scope>", "Workflow scope: delivery")
      .requiredOption(
        "--assignment <id>",
        "Exact implementation or review assignment ID",
        CommandOptions.once("--assignment"),
      )
      .option(
        "--result <result>",
        "Review result: passed, failed, unavailable; implementation: unavailable",
        CommandOptions.once("--result"),
      )
      .option(
        "--details <details>",
        "Required details for failed or unavailable results",
        CommandOptions.once("--details"),
      )
      .requiredOption("--actor <acting-agent>", "Controller author", CommandOptions.once("--actor"))
      .allowExcessArguments(false);
    submitCommand.action(async (options: SubmitOptions) => {
      if (options.scope !== undefined && options.scope !== "delivery") {
        throw new Error("--scope must be 'delivery'.");
      }
      if (Boolean(options.ticket) === (options.scope === "delivery")) {
        throw new Error("submit needs exactly one of --ticket or --scope delivery.");
      }
      const app = await createApp();
      const command = await app.make(SubmitCommand);
      const data = await command.run(options);
      const output = await app.make(ConsoleOutputService);
      const human = [
        options.result === "unavailable"
          ? `Marked the ${data.assignment.role} report unavailable for ${options.ticket ? `ticket ${options.ticket}` : "delivery"}.`
          : `Submitted ${data.assignment.role} report for ${options.ticket ? `ticket ${options.ticket}` : "delivery"}.`,
        `Assignment: ${data.assignment.id} (${data.assignment.role}).`,
        `Report: ${data.assignment.report}`,
        ...(data.assignment.workspace ? [`Workspace: ${data.assignment.workspace}`] : []),
        ...(data.assignment.branch ? [`Branch: ${data.assignment.branch}`] : []),
      ];
      output.result({
        level: "success",
        human,
        data,
      });
    });
  }
  public async run(options: SubmitOptions) {
    this.assertApplicationBooted();
    return (await this.app.make(SubmissionService)).submit(options);
  }
}
