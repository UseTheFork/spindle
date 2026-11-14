import { dirname } from "node:path";

import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import { CommandOptions } from "@/Commands/CommandOptions";
import type { Application } from "@/Foundation/Application";
import { ConsoleOutputService } from "@/Foundation/ConsoleOutputService";
import { group } from "@/SubagentDrivenDevelopment/Commands/groups";
import type { ClaimOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import { AssignmentService } from "@/SubagentDrivenDevelopment/Services/AssignmentService";

export class ClaimCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    group(root)
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
