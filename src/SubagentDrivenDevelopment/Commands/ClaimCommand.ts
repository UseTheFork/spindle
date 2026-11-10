import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import { CommandOptions } from "@/Commands/CommandOptions";
import type { Application } from "@/Foundation/Application";
import { group } from "@/SubagentDrivenDevelopment/Commands/groups";
import type { ClaimOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import { AssignmentService } from "@/SubagentDrivenDevelopment/Services/AssignmentService";

export class ClaimCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    group(root)
      .command("claim")
      .description("Claim a ready ticket from a clean Git checkout.")
      .requiredOption("--spec <path>", "Feature spec path", CommandOptions.once("--spec"))
      .requiredOption("--ticket <id>", "Ticket ID", CommandOptions.once("--ticket"))
      .requiredOption("--author <author>", "Controller author", CommandOptions.once("--author"))
      .allowExcessArguments(false)
      .action(async (options: ClaimOptions) => {
        const command = await (await createApp()).make(ClaimCommand);
        console.log(JSON.stringify(await command.run(options), null, 2));
      });
  }

  public async run(options: ClaimOptions) {
    this.assertApplicationBooted();
    return (await this.app.make(AssignmentService)).claim(options);
  }
}
