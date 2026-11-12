import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import { CommandOptions } from "@/Commands/CommandOptions";
import type { Application } from "@/Foundation/Application";
import { group } from "@/SubagentDrivenDevelopment/Commands/groups";
import type { StatusOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import { FeatureFinalizationService } from "@/SubagentDrivenDevelopment/Services/FeatureFinalizationService";
import { FeatureInspectionService } from "@/SubagentDrivenDevelopment/Services/FeatureInspectionService";

export class StatusCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    group(root)
      .command("status")
      .description("Inspect state, permitted actions, assignments, and blockers.")
      .requiredOption("--spec <path>", "Feature spec path", CommandOptions.once("--spec"))
      .allowExcessArguments(false)
      .action(async (options: StatusOptions) => {
        const command = await (await createApp()).make(StatusCommand);
        console.log(JSON.stringify(await command.run(options), null, 2));
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
