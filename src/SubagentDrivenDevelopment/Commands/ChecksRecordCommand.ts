import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import { CommandOptions } from "@/Commands/CommandOptions";
import type { Application } from "@/Foundation/Application";
import { ConsoleOutputService } from "@/Foundation/ConsoleOutputService";
import { group } from "@/SubagentDrivenDevelopment/Commands/groups";
import type { ChecksRecordOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import { ChecksService } from "@/SubagentDrivenDevelopment/Services/ChecksService";
import { FeatureFinalizationService } from "@/SubagentDrivenDevelopment/Services/FeatureFinalizationService";

export class ChecksRecordCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    group(root, "checks")
      .command("record")
      .description("Record an externally executed check against the current commit.")
      .requiredOption("--spec <path>", "Feature spec path", CommandOptions.once("--spec"))
      .option("--ticket <id>", "Ticket ID", CommandOptions.once("--ticket"))
      .option("--scope <scope>", "Workflow scope: delivery, post-merge or final")
      .option(
        "--merge <sha>",
        "Exact feature merge commit; required for scope final",
        CommandOptions.once("--merge"),
      )
      .requiredOption(
        "--command <command>",
        "Exact required command",
        CommandOptions.once("--command"),
      )
      .requiredOption(
        "--result <result>",
        "Check result: passed, failed, unavailable",
        CommandOptions.once("--result"),
      )
      .option("--details <details>", "Failure or unavailability details")
      .option("--paths <paths...>", "Paths whose content this check explicitly covers")
      .requiredOption("--author <author>", "Acting controller", CommandOptions.once("--author"))
      .allowExcessArguments(false)
      .action(async (options: ChecksRecordOptions & { merge?: string }) => {
        if (
          options.scope !== undefined &&
          !["delivery", "post-merge", "final"].includes(options.scope)
        ) {
          throw new Error("--scope must be 'delivery', 'post-merge' or 'final'.");
        }
        if (
          (options.scope === "delivery" || options.scope === "final") === Boolean(options.ticket)
        ) {
          throw new Error(
            "checks record needs --ticket or --scope delivery/final; scope post-merge also needs --ticket.",
          );
        }
        const app = await createApp();
        const command = await app.make(ChecksRecordCommand);
        const data = await command.run(options);
        const output = await app.make(ConsoleOutputService);
        output.result({
          level: options.result === "passed" ? "success" : "info",
          human: `Recorded ${options.result} check for ${options.ticket ? `ticket ${options.ticket}` : `${options.scope ?? "delivery"} scope`}.`,
          data,
        });
      });
  }

  public async run(options: ChecksRecordOptions & { merge?: string }) {
    this.assertApplicationBooted();
    if (options.scope === "final") {
      if (options.ticket || options.paths || !options.merge)
        throw new Error("Final records require --merge and do not accept ticket/path coverage.");
      const finalization = await this.app.make(FeatureFinalizationService);
      const feature = finalization.recordedFeature(options.spec);
      if (!feature) throw new Error("Final records require a recorded feature merge.");
      return finalization.record({
        feature: feature.feature,
        merge: options.merge,
        command: options.command,
        result: options.result,
        author: options.author,
        ...(options.details ? { details: options.details } : {}),
      });
    }
    if (options.merge) throw new Error("--merge is only valid with --scope final.");
    return (await this.app.make(ChecksService)).checksRecord(options);
  }
}
