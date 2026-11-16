import type { Command as CommanderCommand } from "commander";

import { Command } from "@spindle/Commands/Command";
import { CommandOptions } from "@spindle/Commands/CommandOptions";
import type { Application } from "@spindle/Foundation/Application";
import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import { SddCommandGroups } from "@spindle/SubagentDrivenDevelopment/Commands/SddCommandGroups";
import type { ReadyOptions } from "@spindle/SubagentDrivenDevelopment/Models/Options";
import { ReadinessService } from "@spindle/SubagentDrivenDevelopment/Services/ReadinessService";

export class ReadyCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    SddCommandGroups.group(root)
      .command("ready")
      .description("List ready tickets and tickets waiting on dependencies.")
      .requiredOption(
        "--feature <directory>",
        "Feature workspace directory",
        CommandOptions.once("--feature"),
      )
      .allowExcessArguments(false)
      .action(async (options: ReadyOptions) => {
        const app = await createApp();
        const command = await app.make(ReadyCommand);
        const data = await command.run(options);
        const output = await app.make(ConsoleOutputService);
        const human = [
          data.ready.length > 0
            ? `Ready tickets: ${data.ready.join(", ")}.`
            : "Ready tickets: none.",
          ...(data.unready.length === 0
            ? ["Tickets waiting on dependencies: none."]
            : [
                "Tickets waiting on dependencies:",
                ...data.unready.map(
                  ({ ticket, blockedBy }) => `- ${ticket}: blocked by ${blockedBy.join(", ")}.`,
                ),
              ]),
        ];
        output.result({
          level: "info",
          human,
          data,
        });
      });
  }

  public async run(options: ReadyOptions) {
    this.assertApplicationBooted();
    return (await this.app.make(ReadinessService)).ready(options);
  }
}
