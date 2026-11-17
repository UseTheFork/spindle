import { Command } from "@spindle/Commands/Command";
import { CommandOptions } from "@spindle/Commands/CommandOptions";
import type { Application } from "@spindle/Foundation/Application";
import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import { SddCommandGroups } from "@spindle/SubagentDrivenDevelopment/Commands/SddCommandGroups";
import type { ImplementOptions } from "@spindle/SubagentDrivenDevelopment/Models/Options";
import { AssignmentService } from "@spindle/SubagentDrivenDevelopment/Services/AssignmentService";
import type { Command as CommanderCommand } from "commander";

export class ImplementCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    SddCommandGroups.group(root)
      .command("implement")
      .description(
        "Start or resume the controller's ticket worktree for task-based implementation.",
      )
      .requiredOption(
        "--feature <directory>",
        "Feature workspace directory",
        CommandOptions.once("--feature"),
      )
      .requiredOption("--ticket <id>", "Ticket ID", CommandOptions.once("--ticket"))
      .requiredOption("--actor <acting-agent>", "Controller author", CommandOptions.once("--actor"))
      .requiredOption(
        "--workspace <directory>",
        "Existing absolute external directory for the ticket worktree",
        CommandOptions.once("--workspace"),
      )
      .allowExcessArguments(false)
      .action(async (options: ImplementOptions) => {
        const app = await createApp();
        const command = await app.make(ImplementCommand);
        const data = await command.run(options);
        const output = await app.make(ConsoleOutputService);
        const human = [
          `Ticket worktree ready for controller-led task implementation: ${data.ticket}.`,
          `Ticket implementation report: ${data.assignment.report}`,
          `Shared ticket worktree: ${data.assignment.workspace ?? options.workspace}`,
          ...(data.assignment.branch ? [`Branch: ${data.assignment.branch}`] : []),
        ];
        output.result({
          level: "success",
          human,
          data,
        });
      });
  }

  public async run(options: ImplementOptions) {
    this.assertApplicationBooted();
    return (await this.app.make(AssignmentService)).implement(options);
  }
}
