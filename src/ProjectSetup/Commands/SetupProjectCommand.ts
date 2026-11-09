import { isAbsolute } from "node:path";

import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import { CommandOptions } from "@/Commands/CommandOptions";
import type { Application } from "@/Foundation/Application";
import {
  ProjectSetupService,
  type SetupProjectInput,
  type SetupProjectResult,
} from "@/ProjectSetup/Services/ProjectSetupService";

export class SetupProjectCommand extends Command {
  public static register(program: CommanderCommand, createApp: () => Promise<Application>): void {
    program
      .command("setup-project")
      .description("Create project documentation directories and missing Spindle defaults.")
      .requiredOption(
        "--workspace <path>",
        "Existing absolute target directory (may be outside Git)",
        CommandOptions.once("--workspace"),
      )
      .allowExcessArguments(false)
      .action(async (options: { workspace: string }) => {
        if (!isAbsolute(options.workspace)) {
          throw new Error("Workspace must be an absolute project directory.");
        }
        const command = await (await createApp()).make(SetupProjectCommand);
        console.log(
          JSON.stringify(await command.run({ workspacePath: options.workspace }), null, 2),
        );
      });
  }

  public async run(input: SetupProjectInput): Promise<SetupProjectResult> {
    return (await this.app.make(ProjectSetupService)).setup(input);
  }
}
