import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import type { Application } from "@/Foundation/Application";
import { toolingGroup } from "@/Project/Commands/groups";
import { ProjectService } from "@/Project/Services/ProjectService";

export class ToolingRemoveCommand extends Command {
  public static register(program: CommanderCommand, createApp: () => Promise<Application>): void {
    toolingGroup(program)
      .command("remove <key>")
      .description("Remove a registered tooling command and regenerate docs/agents/tooling.md.")
      .allowExcessArguments(false)
      .action(async (key: string) => {
        const command = await (await createApp()).make(ToolingRemoveCommand);
        console.log(JSON.stringify(await command.run(key), null, 2));
      });
  }

  public async run(key: string) {
    return (await this.app.make(ProjectService)).removeTooling(key);
  }
}
