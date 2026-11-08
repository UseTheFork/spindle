import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import { once } from "@/Commands/shared-options";
import type { Application } from "@/Foundation/Application";
import { group } from "@/SubagentDrivenDevelopment/Commands/groups";
import type { IssueCommentOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import { IssueService } from "@/SubagentDrivenDevelopment/Services/IssueService";

export class IssueCommentCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    group(root, "issue")
      .command("comment")
      .description("Append an attributed issue comment.")
      .requiredOption("--spec <path>", "Feature spec path", once("--spec"))
      .requiredOption("--issue <id>", "Issue ID", once("--issue"))
      .requiredOption("--details <details>", "Comment text", once("--details"))
      .requiredOption("--author <author>", "Acting author", once("--author"))
      .allowExcessArguments(false)
      .action(async (options: IssueCommentOptions) => {
        const command = await (await createApp()).make(IssueCommentCommand);
        console.log(JSON.stringify(await command.run(options), null, 2));
      });
  }

  public async run(options: IssueCommentOptions) {
    return (await this.app.make(IssueService)).issueComment(options);
  }
}
