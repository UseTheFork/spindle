import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import { CommandOptions } from "@/Commands/CommandOptions";
import type { Application } from "@/Foundation/Application";
import { group } from "@/SubagentDrivenDevelopment/Commands/groups";
import type { IssueCreateOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import { IssueService } from "@/SubagentDrivenDevelopment/Services/IssueService";

export class IssueCreateCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    group(root, "issue")
      .command("create")
      .description("Create an attributed issue in the selected feature.")
      .requiredOption("--spec <path>", "Feature spec path", CommandOptions.once("--spec"))
      .requiredOption("--title <title>", "Issue title", CommandOptions.once("--title"))
      .requiredOption("--reporter <reporter>", "Issue reporter", CommandOptions.once("--reporter"))
      .requiredOption("--category <category>", "Issue category", CommandOptions.once("--category"))
      .requiredOption("--author <author>", "Acting author", CommandOptions.once("--author"))
      .allowExcessArguments(false)
      .action(async (options: IssueCreateOptions) => {
        const command = await (await createApp()).make(IssueCreateCommand);
        console.log(JSON.stringify(await command.run(options), null, 2));
      });
  }

  public async run(options: IssueCreateOptions) {
    return (await this.app.make(IssueService)).issueCreate(options);
  }
}
