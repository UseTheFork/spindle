import type { Command as CommanderCommand } from "commander";

import { Command } from "@/commands/Command";
import { once } from "@/commands/shared-options";
import type { Application } from "@/foundation/Application";
import { group } from "@/SubagentDrivenDevelopment/Commands/groups";
import type { FindingCreateOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import { FindingService } from "@/SubagentDrivenDevelopment/Services/FindingService";

export class FindingCreateCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    group(root, "finding")
      .command("create")
      .description("Register a review finding with its report and snapshot provenance.")
      .requiredOption("--spec <path>", "Feature spec path", once("--spec"))
      .option("--issue <id>", "Issue ID", once("--issue"))
      .option("--scope <scope>", "Workflow scope: delivery")
      .requiredOption(
        "--source <path>",
        "Assigned review report containing the finding",
        once("--source"),
      )
      .requiredOption(
        "--snapshot <snapshot>",
        "Reviewed snapshot returned by the CLI",
        once("--snapshot"),
      )
      .requiredOption(
        "--severity <severity>",
        "Finding severity: high, medium, low",
        once("--severity"),
      )
      .option("--blocking", "Mark the finding as blocking")
      .option("--non-blocking", "Mark the finding as non-blocking")
      .option("--link <id>", "Explicitly link this observation to a canonical finding")
      .requiredOption("--summary <summary>", "Concise finding summary", once("--summary"))
      .requiredOption("--details <details>", "Full finding details", once("--details"))
      .requiredOption("--author <author>", "Finding registration author", once("--author"))
      .allowExcessArguments(false)
      .action(async (options: FindingCreateOptions) => {
        if (options.scope !== undefined && options.scope !== "delivery") {
          throw new Error("--scope must be 'delivery'.");
        }
        if (Boolean(options.issue) === (options.scope === "delivery")) {
          throw new Error("finding create needs exactly one of --issue or --scope delivery.");
        }
        const command = await (await createApp()).make(FindingCreateCommand);
        console.log(JSON.stringify(await command.run(options), null, 2));
      });
  }

  public async run(options: FindingCreateOptions) {
    return (await this.app.make(FindingService)).findingCreate(options);
  }
}
