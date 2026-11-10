import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import { CommandOptions } from "@/Commands/CommandOptions";
import type { Application } from "@/Foundation/Application";
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
        const command = await (await createApp()).make(ResumeCommand);
        console.log(JSON.stringify(await command.run(options), null, 2));
      });
  }

  public async run(options: ResumeOptions) {
    this.assertApplicationBooted();
    return (await this.app.make(AssignmentService)).resume(options);
  }
}
