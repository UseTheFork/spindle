import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import { CommandOptions } from "@/Commands/CommandOptions";
import type { Application } from "@/Foundation/Application";
import { ConsoleOutputService } from "@/Foundation/ConsoleOutputService";
import { SddCommandGroups } from "@/SubagentDrivenDevelopment/Commands/SddCommandGroups";
import type { TicketSelection } from "@/SubagentDrivenDevelopment/Models/Options";
import { TicketSyncService } from "@/SubagentDrivenDevelopment/Services/TicketSyncService";

export class SyncCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    SddCommandGroups.group(root)
      .command("sync")
      .description("Synchronize a ticket baseline with its current feature state.")
      .requiredOption(
        "--feature <directory>",
        "Feature workspace directory",
        CommandOptions.once("--feature"),
      )
      .requiredOption("--ticket <id>", "Ticket ID", CommandOptions.once("--ticket"))
      .requiredOption("--actor <acting-agent>", "Acting controller", CommandOptions.once("--actor"))
      .allowExcessArguments(false)
      .action(async (options: TicketSelection) => {
        const app = await createApp();
        const command = await app.make(SyncCommand);
        const data = await command.run(options);
        const output = await app.make(ConsoleOutputService);
        output.result({
          level: "success",
          human:
            data.mode === "post-merge"
              ? `Synchronized ticket ${data.ticket} to failed feature merge ${data.mergeCommit}.`
              : `Updated ticket ${data.ticket} baseline to the current feature commit; fresh checks and review are required.`,
          data,
        });
      });
  }

  public async run(options: TicketSelection) {
    this.assertApplicationBooted();
    return (await this.app.make(TicketSyncService)).sync(options);
  }
}
