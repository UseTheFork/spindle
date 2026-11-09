import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import { CommandOptions } from "@/Commands/CommandOptions";
import type { Application } from "@/Foundation/Application";
import { toolingGroup } from "@/Project/Commands/groups";
import { ProjectService } from "@/Project/Services/ProjectService";

export class ToolingUpdateCommand extends Command {
  public static register(program: CommanderCommand, createApp: () => Promise<Application>): void {
    toolingGroup(program)
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
          const command = await (await createApp()).make(ToolingUpdateCommand);
          console.log(
            JSON.stringify(
              await command.run({
                key,
                ...(options.section === undefined ? {} : { section: options.section }),
                ...(options.command === undefined ? {} : { command: options.command }),
                ...(options.description === undefined ? {} : { description: options.description }),
                ...(options.clearDescription ? { clearDescription: true } : {}),
              }),
              null,
              2,
            ),
          );
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
    return (await this.app.make(ProjectService)).updateTooling(input);
  }
}
