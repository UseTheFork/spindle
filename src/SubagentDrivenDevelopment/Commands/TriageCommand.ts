import type { Command as CommanderCommand } from "commander";

import { Command } from "@/commands/Command";
import { once } from "@/commands/shared-options";
import type { Application } from "@/foundation/Application";
import { group } from "@/SubagentDrivenDevelopment/Commands/groups";
import type { TriageOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import { IssueService } from "@/SubagentDrivenDevelopment/Services/IssueService";

export class TriageCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    group(root)
      .command("triage")
      .description("Set an issue's category and triage status with rationale.")
      .requiredOption("--spec <path>", "Feature spec path", once("--spec"))
      .requiredOption("--issue <id>", "Issue ID", once("--issue"))
      .requiredOption("--status <status>", "Triage status", once("--status"))
      .requiredOption("--category <category>", "Issue category", once("--category"))
      .requiredOption("--details <details>", "Triage rationale", once("--details"))
      .requiredOption("--author <author>", "Acting author", once("--author"))
      .allowExcessArguments(false)
      .action(async (options: TriageOptions) => {
        const command = await (await createApp()).make(TriageCommand);
        console.log(JSON.stringify(await command.run(options), null, 2));
      });
  }

  public async run(options: TriageOptions) {
    return (await this.app.make(IssueService)).triage(options);
  }
}
