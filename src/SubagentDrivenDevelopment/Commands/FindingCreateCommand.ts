import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import { CommandOptions } from "@/Commands/CommandOptions";
import type { Application } from "@/Foundation/Application";
import { ConsoleOutputService } from "@/Foundation/ConsoleOutputService";
import { group } from "@/SubagentDrivenDevelopment/Commands/groups";
import type { FindingCreateOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import { FindingService } from "@/SubagentDrivenDevelopment/Services/FindingService";

export class FindingCreateCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    group(root, "finding")
      .command("create")
      .description("Register a review finding from its assigned report.")
      .requiredOption("--spec <path>", "Feature spec path", CommandOptions.once("--spec"))
      .option("--ticket <id>", "Ticket ID", CommandOptions.once("--ticket"))
      .option("--scope <scope>", "Workflow scope: delivery")
      .option("--related-ticket <id>", "Ticket to reopen for a blocking feature finding")
      .requiredOption(
        "--source <path>",
        "Assigned review report containing the finding",
        CommandOptions.once("--source"),
      )
      .requiredOption(
        "--severity <severity>",
        "Finding severity: high, medium, low",
        CommandOptions.once("--severity"),
      )
      .option("--blocking", "Mark the finding as blocking")
      .option("--non-blocking", "Mark the finding as non-blocking")
      .option("--link <id>", "Explicitly link this observation to a canonical finding")
      .requiredOption(
        "--summary <summary>",
        "Concise finding summary",
        CommandOptions.once("--summary"),
      )
      .requiredOption(
        "--details <details>",
        "Full finding details",
        CommandOptions.once("--details"),
      )
      .requiredOption(
        "--author <author>",
        "Finding registration author",
        CommandOptions.once("--author"),
      )
      .allowExcessArguments(false)
      .action(async (options: FindingCreateOptions) => {
        if (options.scope !== undefined && options.scope !== "delivery") {
          throw new Error("--scope must be 'delivery'.");
        }
        if (Boolean(options.ticket) === (options.scope === "delivery")) {
          throw new Error("finding create needs exactly one of --ticket or --scope delivery.");
        }
        const app = await createApp();
        const command = await app.make(FindingCreateCommand);
        const data = await command.run(options);
        const output = await app.make(ConsoleOutputService);
        output.result({
          level: "success",
          human: `Registered finding: ${options.summary}`,
          data,
        });
      });
  }

  public async run(options: FindingCreateOptions) {
    this.assertApplicationBooted();
    return (await this.app.make(FindingService)).findingCreate(options);
  }
}
