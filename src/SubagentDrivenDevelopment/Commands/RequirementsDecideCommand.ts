import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import { CommandOptions } from "@/Commands/CommandOptions";
import type { Application } from "@/Foundation/Application";
import { ConsoleOutputService } from "@/Foundation/ConsoleOutputService";
import { group } from "@/SubagentDrivenDevelopment/Commands/groups";
import type { RequirementsDecideOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import { RequirementsService } from "@/SubagentDrivenDevelopment/Services/RequirementsService";

export class RequirementsDecideCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    group(root, "requirements")
      .command("decide")
      .description("Approve or reject a requirements change and invalidate prior review.")
      .requiredOption("--spec <path>", "Feature spec path", CommandOptions.once("--spec"))
      .option("--ticket <id>", "Ticket ID", CommandOptions.once("--ticket"))
      .option("--scope <scope>", "Workflow scope: delivery")
      .requiredOption(
        "--finding <id>",
        "Finding affected by the requirements decision",
        CommandOptions.once("--finding"),
      )
      .requiredOption("--decision <decision>", "Decision: approved or rejected")
      .requiredOption("--details <details>", "Decision rationale", CommandOptions.once("--details"))
      .requiredOption("--author <author>", "Decision author", CommandOptions.once("--author"))
      .allowExcessArguments(false)
      .action(async (options: RequirementsDecideOptions) => {
        if (options.scope !== undefined && options.scope !== "delivery") {
          throw new Error("--scope must be 'delivery'.");
        }
        if (Boolean(options.ticket) === (options.scope === "delivery")) {
          throw new Error("requirements decide needs exactly one of --ticket or --scope delivery.");
        }
        const app = await createApp();
        const command = await app.make(RequirementsDecideCommand);
        const data = await command.run(options);
        const output = await app.make(ConsoleOutputService);
        output.result({
          level: "success",
          human: `Recorded ${options.decision} requirements decision for finding ${options.finding}.`,
          data,
        });
      });
  }

  public async run(options: RequirementsDecideOptions) {
    this.assertApplicationBooted();
    return (await this.app.make(RequirementsService)).requirementsDecide(options);
  }
}
