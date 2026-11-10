import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import { CommandOptions } from "@/Commands/CommandOptions";
import type { Application } from "@/Foundation/Application";
import { group } from "@/SubagentDrivenDevelopment/Commands/groups";
import type { ImplementOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import { AssignmentService } from "@/SubagentDrivenDevelopment/Services/AssignmentService";

export class ImplementCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    group(root)
      .command("implement")
      .description("Persist and return an implementation assignment.")
      .requiredOption("--spec <path>", "Feature spec path", CommandOptions.once("--spec"))
      .requiredOption("--ticket <id>", "Ticket ID", CommandOptions.once("--ticket"))
      .requiredOption("--author <author>", "Controller author", CommandOptions.once("--author"))
      .allowExcessArguments(false)
      .action(async (options: ImplementOptions) => {
        const command = await (await createApp()).make(ImplementCommand);
        console.log(JSON.stringify(await command.run(options), null, 2));
      });
  }

  public async run(options: ImplementOptions) {
    this.assertApplicationBooted();
    return (await this.app.make(AssignmentService)).implement(options);
  }
}
