import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import { CommandOptions } from "@/Commands/CommandOptions";
import type { Application } from "@/Foundation/Application";
import { ConsoleOutputService } from "@/Foundation/ConsoleOutputService";
import { group } from "@/SubagentDrivenDevelopment/Commands/groups";
import type { ImplementOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import { AssignmentService } from "@/SubagentDrivenDevelopment/Services/AssignmentService";

export class ImplementCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    group(root)
      .command("implement")
      .description("Persist and return an implementation assignment.")
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
          `Implementation assignment ${data.assignment.id} for ticket ${data.ticket} (${data.assignment.status}).`,
          `Report: ${data.assignment.report}`,
          `Workspace: ${data.assignment.workspace ?? options.workspace}`,
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
