import type { Command as CommanderCommand } from "commander";

import { Command } from "@spindle/Commands/Command";
import { CommandOptions } from "@spindle/Commands/CommandOptions";
import type { Application } from "@spindle/Foundation/Application";
import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import { SddCommandGroups } from "@spindle/SubagentDrivenDevelopment/Commands/SddCommandGroups";
import type { FindingCreateOptions } from "@spindle/SubagentDrivenDevelopment/Models/Options";
import { FindingService } from "@spindle/SubagentDrivenDevelopment/Services/FindingService";

export class FindingCreateCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    SddCommandGroups.group(root, "finding")
      .command("create")
      .description("Register a review finding from its assigned report.")
      .requiredOption(
        "--feature <directory>",
        "Feature workspace directory",
        CommandOptions.once("--feature"),
      )
      .option("--ticket <id>", "Ticket ID", CommandOptions.once("--ticket"))
      .option("--scope <scope>", "Workflow scope: delivery")
      .option("--related-ticket <id>", "Ticket to reopen for a blocking feature finding")
      .requiredOption(
        "--assignment <id>",
        "Exact review assignment ID",
        CommandOptions.once("--assignment"),
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
        "--actor <acting-agent>",
        "Finding registration author",
        CommandOptions.once("--actor"),
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
