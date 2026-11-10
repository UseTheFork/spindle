import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import type { Application } from "@/Foundation/Application";
import { toolGroup } from "@/Tooling/Commands/groups";
import { ToolingService } from "@/Tooling/Services/ToolingService";

export class ToolingListCommand extends Command {
  public static register(program: CommanderCommand, createApp: () => Promise<Application>): void {
    toolGroup(program)
      .command("list")
      .description("List registered tooling commands and their keys.")
      .allowExcessArguments(false)
      .action(async () => {
        const command = await (await createApp()).make(ToolingListCommand);
        console.log(JSON.stringify(await command.run(), null, 2));
      });
  }

  public async run() {
    this.assertApplicationBooted();
    return (await this.app.make(ToolingService)).listTooling();
  }
}
