import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import { CommandOptions } from "@/Commands/CommandOptions";
import type { Application } from "@/Foundation/Application";
import { ConsoleOutputService } from "@/Foundation/ConsoleOutputService";
import { toolGroup } from "@/Tooling/Commands/groups";
import { ToolingService } from "@/Tooling/Services/ToolingService";

export class ToolingAddCommand extends Command {
  public static register(program: CommanderCommand, createApp: () => Promise<Application>): void {
    toolGroup(program)
      .command("add")
      .description("Register a project tooling command and regenerate docs/agents/tooling.md.")
      .requiredOption(
        "--key <key>",
        "Stable lowercase kebab-case key",
        CommandOptions.once("--key"),
      )
      .requiredOption(
        "--section <section>",
        "Tooling documentation section",
        CommandOptions.once("--section"),
      )
      .requiredOption(
        "--command <command>",
        "Verified command text",
        CommandOptions.once("--command"),
      )
      .option(
        "--description <description>",
        "Optional command description",
        CommandOptions.once("--description"),
      )
      .allowExcessArguments(false)
      .action(
        async (options: {
          key: string;
          section: string;
          command: string;
          description?: string;
        }) => {
          const app = await createApp();
          const command = await app.make(ToolingAddCommand);
          const data = await command.run({
            key: options.key,
            section: options.section,
            command: options.command,
            ...(options.description === undefined ? {} : { description: options.description }),
          });
          const output = await app.make(ConsoleOutputService);
          output.result({
            level: "success",
            human: `Registered tooling command "${options.key}".`,
            data,
          });
        },
      );
  }

  public async run(input: { key: string; section: string; command: string; description?: string }) {
    this.assertApplicationBooted();
    return (await this.app.make(ToolingService)).addTooling(input);
  }
}
