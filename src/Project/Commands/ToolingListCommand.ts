import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import type { Application } from "@/Foundation/Application";
import { toolingGroup } from "@/Project/Commands/groups";
import { ProjectService } from "@/Project/Services/ProjectService";

export class ToolingListCommand extends Command {
  public static register(program: CommanderCommand, createApp: () => Promise<Application>): void {
    toolingGroup(program)
      .command("list")
      .description("List registered tooling commands and their keys.")
      .allowExcessArguments(false)
      .action(async () => {
        const command = await (await createApp()).make(ToolingListCommand);
        console.log(JSON.stringify(await command.run(), null, 2));
      });
  }

  public async run() {
    return (await this.app.make(ProjectService)).listTooling();
  }
}
