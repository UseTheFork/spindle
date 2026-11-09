import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import { CommandOptions } from "@/Commands/CommandOptions";
import type { Application } from "@/Foundation/Application";
import { toolingGroup } from "@/Project/Commands/groups";
import { ProjectService } from "@/Project/Services/ProjectService";

export class ToolingAddCommand extends Command {
  public static register(program: CommanderCommand, createApp: () => Promise<Application>): void {
    toolingGroup(program)
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
          const command = await (await createApp()).make(ToolingAddCommand);
          console.log(
            JSON.stringify(
              await command.run({
                key: options.key,
                section: options.section,
                command: options.command,
                ...(options.description === undefined ? {} : { description: options.description }),
              }),
              null,
              2,
            ),
          );
        },
      );
  }

  public async run(input: { key: string; section: string; command: string; description?: string }) {
    return (await this.app.make(ProjectService)).addTooling(input);
  }
}
