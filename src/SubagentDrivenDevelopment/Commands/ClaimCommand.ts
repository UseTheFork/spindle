import type { Command as CommanderCommand } from "commander";

import { Command } from "@/commands/Command";
import { once } from "@/commands/shared-options";
import type { Application } from "@/foundation/Application";
import { group } from "@/SubagentDrivenDevelopment/Commands/groups";
import type { ClaimOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import { AssignmentService } from "@/SubagentDrivenDevelopment/Services/AssignmentService";

export class ClaimCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    group(root)
      .command("claim")
      .description("Claim a ready issue from a clean Git checkout.")
      .requiredOption("--spec <path>", "Feature spec path", once("--spec"))
      .requiredOption("--issue <id>", "Issue ID", once("--issue"))
      .requiredOption("--author <author>", "Controller author", once("--author"))
      .allowExcessArguments(false)
      .action(async (options: ClaimOptions) => {
        const command = await (await createApp()).make(ClaimCommand);
        console.log(JSON.stringify(await command.run(options), null, 2));
      });
  }

  public async run(options: ClaimOptions) {
    return (await this.app.make(AssignmentService)).claim(options);
  }
}
