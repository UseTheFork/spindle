import { Command } from "@spindle/Commands/Command";
import { CommandOptions } from "@spindle/Commands/CommandOptions";
import type { Application } from "@spindle/Foundation/Application";
import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import { SddCommandGroup } from "@spindle/SubagentDrivenDevelopment/Commands/SddCommandGroup";
import { FeatureWorkspaceService } from "@spindle/SubagentDrivenDevelopment/Services/FeatureWorkspaceService";
import { WorkGraphService } from "@spindle/SubagentDrivenDevelopment/Services/WorkGraphService";
import type { Command as CommanderCommand } from "commander";

export class SddNextCommand extends Command {
  public static register(program: CommanderCommand, createApp: () => Promise<Application>): void {
    SddCommandGroup.register(program)
      .command("next")
      .description("Report work graph readiness and blockers without changing the workspace.")
      .requiredOption(
        "--feature <directory>",
        "Feature workspace name or directory",
        CommandOptions.once("--feature"),
      )
      .option("--verbose", "Include work graph details")
      .allowExcessArguments(false)
      .action(async ({ feature, verbose }: { feature: string; verbose?: boolean }) => {
        const app = await createApp();
        const data = await (await app.make(SddNextCommand)).run(feature, verbose);
        const human = [`Feature ${data.feature}`, ...data.notices];
        for (const ticket of data.tickets) {
          human.push(`${ticket.ticketId}: ${SddNextCommand.describe(ticket.blockers)}`);
          for (const task of ticket.tasks) {
            human.push(`  ${task.taskId}: ${SddNextCommand.describe(task.blockers)}`);
          }
        }
        if (data.graph) human.push(JSON.stringify(data.graph, null, 2));
        (await app.make(ConsoleOutputService)).result({ level: "info", human, data });
      });
  }

  public async run(reference: string, verbose = false) {
    this.assertApplicationBooted();
    const feature = await (await this.app.make(FeatureWorkspaceService)).load(reference);
    const { tickets } = (await this.app.make(WorkGraphService)).readiness(feature);
    const notices = [
      ...(tickets.length === 0 ? ["No tickets in this feature."] : []),
      "No workflow actions available in this CLI yet.",
    ];
    const graph = verbose
      ? feature.tickets.map(({ id, dependencies, merged, worktree, tasks }) => ({
          id,
          dependencies,
          merged,
          worktree,
          tasks: tasks.map(({ id, state, dependencies, writeScope }) => ({
            id,
            state,
            dependencies,
            writeScope,
          })),
        }))
      : undefined;
    return { feature: feature.name, actions: [], notices, tickets, ...(graph ? { graph } : {}) };
  }

  private static describe(blockers: readonly { code: string }[]): string {
    if (blockers.length === 0) return "ready";
    return blockers
      .map(({ code, ...details }) =>
        [code.replaceAll("-", " "), ...Object.values(details)].join(" "),
      )
      .join("; ");
  }
}
