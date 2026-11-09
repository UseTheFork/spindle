import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import type { Application } from "@/Foundation/Application";
import { projectGroup } from "@/Project/Commands/groups";
import { ProjectService } from "@/Project/Services/ProjectService";

export class ProjectInitCommand extends Command {
  public static register(program: CommanderCommand, createApp: () => Promise<Application>): void {
    projectGroup(program)
      .command("init")
      .description("Initialize project guidance and the tooling command registry at the Git root.")
      .allowExcessArguments(false)
      .action(async () => {
        const command = await (await createApp()).make(ProjectInitCommand);
        console.log(JSON.stringify(await command.run(), null, 2));
      });
  }

  public async run() {
    return (await this.app.make(ProjectService)).initialize();
  }
}
