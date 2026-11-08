import type { Command as CommanderCommand } from "commander";

import { Command } from "@/commands/Command";
import { once } from "@/commands/shared-options";
import type { Application } from "@/foundation/Application";
import { group } from "@/SubagentDrivenDevelopment/Commands/groups";
import type { RequirementsDecideOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import { RequirementsService } from "@/SubagentDrivenDevelopment/Services/RequirementsService";

export class RequirementsDecideCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    group(root, "requirements")
      .command("decide")
      .description("Approve or reject a requirements change and invalidate prior review.")
      .requiredOption("--spec <path>", "Feature spec path", once("--spec"))
      .option("--issue <id>", "Issue ID", once("--issue"))
      .option("--scope <scope>", "Workflow scope: delivery")
      .requiredOption(
        "--finding <id>",
        "Finding affected by the requirements decision",
        once("--finding"),
      )
      .requiredOption("--decision <decision>", "Decision: approved or rejected")
      .requiredOption("--details <details>", "Decision rationale", once("--details"))
      .requiredOption("--author <author>", "Decision author", once("--author"))
      .allowExcessArguments(false)
      .action(async (options: RequirementsDecideOptions) => {
        if (options.scope !== undefined && options.scope !== "delivery") {
          throw new Error("--scope must be 'delivery'.");
        }
        if (Boolean(options.issue) === (options.scope === "delivery")) {
          throw new Error("requirements decide needs exactly one of --issue or --scope delivery.");
        }
        const command = await (await createApp()).make(RequirementsDecideCommand);
        console.log(JSON.stringify(await command.run(options), null, 2));
      });
  }

  public async run(options: RequirementsDecideOptions) {
    return (await this.app.make(RequirementsService)).requirementsDecide(options);
  }
}
