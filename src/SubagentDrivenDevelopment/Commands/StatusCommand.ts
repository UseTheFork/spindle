import type { Command as CommanderCommand } from "commander";

import { Command } from "@spindle/Commands/Command";
import { CommandOptions } from "@spindle/Commands/CommandOptions";
import type { Application } from "@spindle/Foundation/Application";
import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import { SddCommandGroups } from "@spindle/SubagentDrivenDevelopment/Commands/SddCommandGroups";
import type { StatusOptions } from "@spindle/SubagentDrivenDevelopment/Models/Options";
import { FeatureFinalizationService } from "@spindle/SubagentDrivenDevelopment/Services/FeatureFinalizationService";
import { FeatureInspectionService } from "@spindle/SubagentDrivenDevelopment/Services/FeatureInspectionService";
import { StatusSummaryService } from "@spindle/SubagentDrivenDevelopment/Services/StatusSummaryService";

export class StatusCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    SddCommandGroups.group(root)
      .command("status")
      .description("Inspect state, permitted actions, assignments, and blockers.")
      .requiredOption(
        "--feature <directory>",
        "Feature workspace directory",
        CommandOptions.once("--feature"),
      )
      .allowExcessArguments(false)
      .action(async (options: { feature: string }) => {
        const app = await createApp();
        const command = await app.make(StatusCommand);
        const serviceOptions: StatusOptions = {
          spec: CommandOptions.featureSpec(options.feature),
        };
        const data = await command.run(serviceOptions);
        const output = await app.make(ConsoleOutputService);
        const summary = await app.make(StatusSummaryService);
        output.result({
          level: "info",
          human: summary.statusSummary(data, serviceOptions.spec, "Feature status"),
          data,
        });
      });
  }

  public async run(options: StatusOptions) {
    this.assertApplicationBooted();
    const finalization = await this.app.make(FeatureFinalizationService);
    const recorded = finalization.recordedFeature(options.spec);
    if (recorded) return finalization.status(recorded.feature);
    return (await this.app.make(FeatureInspectionService)).status(options);
  }
}
