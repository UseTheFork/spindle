import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import type { Application } from "@/Foundation/Application";
import { toolGroup } from "@/Tooling/Commands/groups";
import { ToolingService } from "@/Tooling/Services/ToolingService";

export class ToolingRemoveCommand extends Command {
  public static register(program: CommanderCommand, createApp: () => Promise<Application>): void {
    toolGroup(program)
      .command("remove <key>")
      .description("Remove a registered tooling command and regenerate docs/agents/tooling.md.")
      .allowExcessArguments(false)
      .action(async (key: string) => {
        const command = await (await createApp()).make(ToolingRemoveCommand);
        console.log(JSON.stringify(await command.run(key), null, 2));
      });
  }

  public async run(key: string) {
    return (await this.app.make(ToolingService)).removeTooling(key);
  }
}
