import { dirname } from "node:path";

import type { Command as CommanderCommand } from "commander";

import { Command } from "@spindle/Commands/Command";
import { CommandOptions } from "@spindle/Commands/CommandOptions";
import type { Application } from "@spindle/Foundation/Application";
import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import { SddCommandGroups } from "@spindle/SubagentDrivenDevelopment/Commands/SddCommandGroups";
import type { ClaimOptions } from "@spindle/SubagentDrivenDevelopment/Models/Options";
import { AssignmentService } from "@spindle/SubagentDrivenDevelopment/Services/AssignmentService";

export class ClaimCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    SddCommandGroups.group(root)
      .command("claim")
      .description("Claim ownership of delivery after all tickets are complete.")
      .requiredOption("--scope <scope>", "Workflow scope: delivery", CommandOptions.once("--scope"))
      .requiredOption(
        "--feature <directory>",
        "Feature workspace directory",
        CommandOptions.once("--feature"),
      )
      .requiredOption("--actor <acting-agent>", "Acting controller", CommandOptions.once("--actor"))
      .allowExcessArguments(false)
      .action(async (options: ClaimOptions) => {
        const app = await createApp();
        const data = await (await app.make(ClaimCommand)).run(options);
        (await app.make(ConsoleOutputService)).result({
          level: "success",
          human: `Delivery ownership ${data.idempotent ? "already recorded" : "recorded"} for ${data.owner}.\nNext: pnpm spindle sdd next --feature ${dirname(options.spec)}`,
          data,
        });
      });
  }

  public async run(options: ClaimOptions) {
    this.assertApplicationBooted();
    return (await this.app.make(AssignmentService)).claim(options);
  }
}
