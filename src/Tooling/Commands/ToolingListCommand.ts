import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import type { Application } from "@/Foundation/Application";
import { ConsoleOutputService } from "@/Foundation/ConsoleOutputService";
import { toolGroup } from "@/Tooling/Commands/groups";
import { ToolingService } from "@/Tooling/Services/ToolingService";

export class ToolingListCommand extends Command {
  public static register(program: CommanderCommand, createApp: () => Promise<Application>): void {
    toolGroup(program)
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
