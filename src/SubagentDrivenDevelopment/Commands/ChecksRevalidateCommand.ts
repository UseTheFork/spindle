import type { Command as CommanderCommand } from "commander";

import { Command } from "@spindle/Commands/Command";
import { CommandOptions } from "@spindle/Commands/CommandOptions";
import type { Application } from "@spindle/Foundation/Application";
import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import { SddCommandGroups } from "@spindle/SubagentDrivenDevelopment/Commands/SddCommandGroups";
import { FeatureFinalizationService } from "@spindle/SubagentDrivenDevelopment/Services/FeatureFinalizationService";

export class ChecksRevalidateCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    SddCommandGroups.group(root, "checks")
      .command("revalidate")
      .description("Move final-check validation to a committed fix.")
      .requiredOption(
        "--feature <directory>",
        "Feature workspace directory",
        CommandOptions.once("--feature"),
      )
      .requiredOption("--scope <scope>", "Workflow scope: final")
      .requiredOption("--actor <acting-agent>", "Acting controller", CommandOptions.once("--actor"))
      .allowExcessArguments(false)
      .action(async (options: { spec: string; scope: string; author: string }) => {
        if (options.scope !== "final") throw new Error("--scope must be 'final'.");
        const app = await createApp();
        const finalization = await app.make(FeatureFinalizationService);
        const feature = finalization.recordedFeature(options.spec);
        if (!feature) throw new Error("Final checks require a recorded feature merge.");
        const data = await finalization.revalidate({
          feature: feature.feature,
          author: options.author,
        });
        const output = await app.make(ConsoleOutputService);
        output.result({
          level: "info",
          human: `Moved final-check validation to the current commit for ${feature.feature}.`,
          data,
        });
      });
  }
}
