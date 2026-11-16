import type { Command as CommanderCommand } from "commander";

import { Command } from "@spindle/Commands/Command";
import type { Application } from "@spindle/Foundation/Application";
import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import { ToolCommandGroups } from "@spindle/Tooling/Commands/ToolCommandGroups";
import { ToolingService } from "@spindle/Tooling/Services/ToolingService";

export class ToolingListCommand extends Command {
  public static register(program: CommanderCommand, createApp: () => Promise<Application>): void {
    ToolCommandGroups.toolGroup(program)
      .command("list")
      .description("List registered tooling commands and their keys.")
      .allowExcessArguments(false)
      .action(async () => {
        const app = await createApp();
        const command = await app.make(ToolingListCommand);
        const data = await command.run();
        const output = await app.make(ConsoleOutputService);
        const human = [
          `Tooling commands (${data.length}):`,
          ...(data.length === 0
            ? ["- None registered."]
            : data.map(
                ({ key, section, command, description }) =>
                  `- ${key} [${section}]: ${command}${description ? ` — ${description}` : ""}`,
              )),
        ];
        output.result({
          level: "info",
          human,
          data,
        });
      });
  }

  public async run() {
    this.assertApplicationBooted();
    return (await this.app.make(ToolingService)).listTooling();
  }
}
