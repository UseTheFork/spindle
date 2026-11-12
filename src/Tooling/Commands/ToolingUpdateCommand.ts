import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import { CommandOptions } from "@/Commands/CommandOptions";
import type { Application } from "@/Foundation/Application";
import { ConsoleOutputService } from "@/Foundation/ConsoleOutputService";
import { toolGroup } from "@/Tooling/Commands/groups";
import { ToolingService } from "@/Tooling/Services/ToolingService";

export class ToolingUpdateCommand extends Command {
  public static register(program: CommanderCommand, createApp: () => Promise<Application>): void {
    toolGroup(program)
      .command("update <key>")
      .description("Update a registered tooling command and regenerate docs/agents/tooling.md.")
      .option(
        "--section <section>",
        "Replacement documentation section",
        CommandOptions.once("--section"),
      )
      .option("--command <command>", "Replacement command text", CommandOptions.once("--command"))
      .option(
        "--description <description>",
        "Replacement description",
        CommandOptions.once("--description"),
      )
      .option("--clear-description", "Remove the current description")
      .allowExcessArguments(false)
      .action(
        async (
          key: string,
          options: {
            section?: string;
            command?: string;
            description?: string;
            clearDescription?: boolean;
          },
        ) => {
          const app = await createApp();
          const command = await app.make(ToolingUpdateCommand);
          const data = await command.run({
            key,
            ...(options.section === undefined ? {} : { section: options.section }),
            ...(options.command === undefined ? {} : { command: options.command }),
            ...(options.description === undefined ? {} : { description: options.description }),
            ...(options.clearDescription ? { clearDescription: true } : {}),
          });
          const output = await app.make(ConsoleOutputService);
          output.result({
            level: "success",
            human: `Updated tooling command "${key}".`,
            data,
          });
        },
      );
  }

  public async run(input: {
    key: string;
    section?: string;
    command?: string;
    description?: string;
    clearDescription?: boolean;
  }) {
    this.assertApplicationBooted();
    return (await this.app.make(ToolingService)).updateTooling(input);
  }
}
