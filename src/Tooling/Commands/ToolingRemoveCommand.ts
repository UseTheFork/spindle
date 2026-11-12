import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import type { Application } from "@/Foundation/Application";
import { ConsoleOutputService } from "@/Foundation/ConsoleOutputService";
import { toolGroup } from "@/Tooling/Commands/groups";
import { ToolingService } from "@/Tooling/Services/ToolingService";

export class ToolingRemoveCommand extends Command {
  public static register(program: CommanderCommand, createApp: () => Promise<Application>): void {
    toolGroup(program)
      .command("remove <key>")
      .description("Remove a registered tooling command and regenerate docs/agents/tooling.md.")
      .allowExcessArguments(false)
      .action(async (key: string) => {
        const app = await createApp();
        const command = await app.make(ToolingRemoveCommand);
        const data = await command.run(key);
        const output = await app.make(ConsoleOutputService);
        output.result({
          level: "success",
          human: `Removed tooling command "${key}".`,
          data,
        });
      });
  }

  public async run(key: string) {
    this.assertApplicationBooted();
    return (await this.app.make(ToolingService)).removeTooling(key);
  }
}
