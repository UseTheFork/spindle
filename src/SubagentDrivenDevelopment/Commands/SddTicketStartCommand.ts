import { Command } from "@spindle/Commands/Command";
import { CommandOptions } from "@spindle/Commands/CommandOptions";
import type { Application } from "@spindle/Foundation/Application";
import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import { SddCommandGroup } from "@spindle/SubagentDrivenDevelopment/Commands/SddCommandGroup";
import { WorktreeStartService } from "@spindle/SubagentDrivenDevelopment/Services/WorktreeStartService";
import type { Command as CommanderCommand } from "commander";

export class SddTicketStartCommand extends Command {
  public static register(program: CommanderCommand, createApp: () => Promise<Application>): void {
    SddCommandGroup.subgroup(program, "ticket", "Manage feature tickets.")
      .command("start")
      .description("Create or resume a ready ticket's worktree.")
      .requiredOption(
        "--feature <directory>",
        "Feature workspace",
        CommandOptions.once("--feature"),
      )
      .requiredOption("--ticket <id>", "Ticket ID", CommandOptions.once("--ticket"))
      .allowExcessArguments(false)
      .action(async ({ feature, ticket }: { feature: string; ticket: string }) => {
        const app = await createApp();
        const data = await (await app.make(SddTicketStartCommand)).run(feature, ticket);
        const human = [`Started ticket ${ticket}: ${data.worktree}`];
        if (data.setupCommands.length > 0) {
          human.push(
            "Complete these ticket worktree setup steps before dispatch:",
            ...data.setupCommands,
          );
        }
        (await app.make(ConsoleOutputService)).result({ level: "success", human, data });
      });
  }

  public async run(feature: string, ticket: string) {
    const data = await (await this.app.make(WorktreeStartService)).start(feature, ticket);
    if (data.ticket === undefined || data.setupCommands === undefined) {
      throw new Error("Ticket start did not return a ticket result.");
    }
    return { ...data, ticket: data.ticket, setupCommands: data.setupCommands };
  }
}
