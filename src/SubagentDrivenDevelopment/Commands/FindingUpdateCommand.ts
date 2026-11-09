import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import { CommandOptions } from "@/Commands/CommandOptions";
import type { Application } from "@/Foundation/Application";
import { group } from "@/SubagentDrivenDevelopment/Commands/groups";
import type { FindingUpdateOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import { FindingService } from "@/SubagentDrivenDevelopment/Services/FindingService";

export class FindingUpdateCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    group(root, "finding")
      .command("update")
      .description("Record an explicit, attributed finding disposition.")
      .requiredOption("--spec <path>", "Feature spec path", CommandOptions.once("--spec"))
      .option("--issue <id>", "Issue ID", CommandOptions.once("--issue"))
      .option("--scope <scope>", "Workflow scope: delivery")
      .requiredOption("--finding <id>", "Canonical finding ID", CommandOptions.once("--finding"))
      .requiredOption(
        "--status <status>",
        "Finding status: open, confirmed, fixed, dismissed, deferred",
      )
      .option("--details <details>", "Ruling explanation or rationale")
      .option("--follow-up <reference>", "Required follow-up reference for a deferral")
      .option(
        "--requirements-decision <id>",
        "Approved requirements decision covering a scope change",
      )
      .option("--evidence <snapshot>", "Current CLI snapshot with passing verification checks")
      .requiredOption("--author <author>", "Ruling author", CommandOptions.once("--author"))
      .allowExcessArguments(false)
      .action(async (options: FindingUpdateOptions) => {
        if (options.scope !== undefined && options.scope !== "delivery") {
          throw new Error("--scope must be 'delivery'.");
        }
        if (Boolean(options.issue) === (options.scope === "delivery")) {
          throw new Error("finding update needs exactly one of --issue or --scope delivery.");
        }
        const command = await (await createApp()).make(FindingUpdateCommand);
        console.log(JSON.stringify(await command.run(options), null, 2));
      });
  }

  public async run(options: FindingUpdateOptions) {
    return (await this.app.make(FindingService)).findingUpdate(options);
  }
}
