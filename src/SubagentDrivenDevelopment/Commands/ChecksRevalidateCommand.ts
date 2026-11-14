import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import { CommandOptions } from "@/Commands/CommandOptions";
import type { Application } from "@/Foundation/Application";
import { ConsoleOutputService } from "@/Foundation/ConsoleOutputService";
import { group } from "@/SubagentDrivenDevelopment/Commands/groups";
import { FeatureFinalizationService } from "@/SubagentDrivenDevelopment/Services/FeatureFinalizationService";

export class ChecksRevalidateCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    group(root, "checks")
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
