import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import { CommandOptions } from "@/Commands/CommandOptions";
import type { Application } from "@/Foundation/Application";
import { ConsoleOutputService } from "@/Foundation/ConsoleOutputService";
import { group } from "@/SubagentDrivenDevelopment/Commands/groups";
import type { ResumeOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import { AssignmentService } from "@/SubagentDrivenDevelopment/Services/AssignmentService";

export class ResumeCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    group(root)
      .command("resume")
      .description("Restore the recorded ticket or delivery gate and assignment.")
      .requiredOption("--spec <path>", "Feature spec path", CommandOptions.once("--spec"))
      .option("--ticket <id>", "Ticket ID", CommandOptions.once("--ticket"))
      .option("--scope <scope>", "Workflow scope: delivery")
      .requiredOption("--author <author>", "Controller author", CommandOptions.once("--author"))
      .option("--confirm-handoff", "Confirm the previous controller has stopped editing")
      .allowExcessArguments(false)
      .action(async (options: ResumeOptions) => {
        if (options.scope !== undefined && options.scope !== "delivery") {
          throw new Error("--scope must be 'delivery'.");
        }
        if (Boolean(options.ticket) === (options.scope === "delivery")) {
          throw new Error("resume needs exactly one of --ticket or --scope delivery.");
        }
        const app = await createApp();
        const command = await app.make(ResumeCommand);
        const data = await command.run(options);
        const output = await app.make(ConsoleOutputService);
        const human = [
          `Resumed ${options.ticket ? `ticket ${options.ticket}` : "delivery"} at ${data.gate}; next action: ${data.nextAction}.`,
          ...(data.owner ? [`Controller: ${data.owner}.`] : []),
          ...(data.blocker ? [`Blocker: ${data.blocker}`] : []),
          ...(data.assignment
            ? [
                `Assignment ${data.assignment.id} (${data.assignment.action}, ${data.assignment.status}).`,
                `Report: ${data.assignment.report}`,
                ...(data.assignment.workspace ? [`Workspace: ${data.assignment.workspace}`] : []),
                ...(data.assignment.branch ? [`Branch: ${data.assignment.branch}`] : []),
              ]
            : ["Implementation assignment: none recorded."]),
          ...(data.reviewAssignments ?? []).map(
            (assignment) =>
              `Review assignment ${assignment.id} (${assignment.agent}, ${assignment.status}); report: ${assignment.report}${assignment.workspace ? `; workspace: ${assignment.workspace}` : ""}${assignment.branch ? `; branch: ${assignment.branch}` : ""}.`,
          ),
          ...(data.handoffRecorded ? ["Controller handoff confirmed and recorded."] : []),
        ];
        output.result({
          level: "success",
          human,
          data,
        });
      });
  }

  public async run(options: ResumeOptions) {
    this.assertApplicationBooted();
    return (await this.app.make(AssignmentService)).resume(options);
  }
}
