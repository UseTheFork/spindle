import type { Command as CommanderCommand } from "commander";

import { Command } from "@/commands/Command";
import { once } from "@/commands/shared-options";
import type { Application } from "@/foundation/Application";
import { group } from "@/SubagentDrivenDevelopment/Commands/groups";
import type { IssueUpdateOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import { IssueService } from "@/SubagentDrivenDevelopment/Services/IssueService";

export class IssueUpdateCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    group(root, "issue")
      .command("update")
      .description("Update issue descriptive metadata and dependencies.")
      .requiredOption("--spec <path>", "Feature spec path", once("--spec"))
      .requiredOption("--issue <id>", "Issue ID", once("--issue"))
      .option("--title <title>", "Updated issue title", once("--title"))
      .option("--reporter <reporter>", "Updated issue reporter", once("--reporter"))
      .option("--blocked-by <issues...>", "Authoritative dependency issue IDs")
      .option("--clear-blocked-by", "Remove all issue dependencies")
      .requiredOption("--author <author>", "Acting author", once("--author"))
      .allowExcessArguments(false)
      .action(async (options: IssueUpdateOptions) => {
        const command = await (await createApp()).make(IssueUpdateCommand);
        console.log(JSON.stringify(await command.run(options), null, 2));
      });
  }

  public async run(options: IssueUpdateOptions) {
    return (await this.app.make(IssueService)).issueUpdate(options);
  }
}
