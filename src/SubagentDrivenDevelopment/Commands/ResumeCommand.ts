import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import { CommandOptions } from "@/Commands/CommandOptions";
import type { Application } from "@/Foundation/Application";
import { ConsoleOutputService } from "@/Foundation/ConsoleOutputService";
import { SddCommandGroups } from "@/SubagentDrivenDevelopment/Commands/SddCommandGroups";
import type { ResumeOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import { AssignmentService } from "@/SubagentDrivenDevelopment/Services/AssignmentService";
import { DeliveryService } from "@/SubagentDrivenDevelopment/Services/DeliveryService";
import { StatusSummaryService } from "@/SubagentDrivenDevelopment/Services/StatusSummaryService";

export class ResumeCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    SddCommandGroups.group(root)
      .command("resume")
      .description("Restore the recorded ticket or delivery gate and assignment.")
      .requiredOption(
        "--feature <directory>",
        "Feature workspace directory",
        CommandOptions.once("--feature"),
      )
      .option("--ticket <id>", "Ticket ID", CommandOptions.once("--ticket"))
      .option("--scope <scope>", "Workflow scope: delivery")
      .requiredOption("--actor <acting-agent>", "Controller author", CommandOptions.once("--actor"))
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
        const delivery = await app.make(DeliveryService);
        const next = delivery.next({ spec: options.spec });
        const output = await app.make(ConsoleOutputService);
        const summary = await app.make(StatusSummaryService);
        const human = [
          `Resumed ${options.ticket ? `ticket ${options.ticket}` : "delivery"} at ${data.gate}.`,
          ...summary.nextSummary(next),
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
