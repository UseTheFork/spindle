import { text } from "node:stream/consumers";

import { Command } from "@spindle/Commands/Command";
import { CommandOptions } from "@spindle/Commands/CommandOptions";
import type { Application } from "@spindle/Foundation/Application";
import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import { SddCommandGroup } from "@spindle/SubagentDrivenDevelopment/Commands/SddCommandGroup";
import { FeatureWorkspaceService } from "@spindle/SubagentDrivenDevelopment/Services/FeatureWorkspaceService";
import type { Command as CommanderCommand } from "commander";

export class SddCreateCommand extends Command {
  public static register(program: CommanderCommand, createApp: () => Promise<Application>): void {
    SddCommandGroup.register(program)
      .command("create")
      .description("Create a numbered feature workspace in the original checkout.")
      .requiredOption("--slug <slug>", "Lowercase feature slug", CommandOptions.once("--slug"))
      .requiredOption(
        "--spec <text>",
        "Feature specification, or - for stdin",
        CommandOptions.once("--spec"),
      )
      .option("--design <text>", "Optional design, or - for stdin", CommandOptions.once("--design"))
      .allowExcessArguments(false)
      .action(async ({ slug, spec, design }: { slug: string; spec: string; design?: string }) => {
        if (spec === "-" && design === "-") {
          throw new Error("Only one of --spec and --design can read from stdin.");
        }
        const app = await createApp();
        const command = await app.make(SddCreateCommand);
        const data = await command.run({
          slug,
          specification: spec === "-" ? await text(process.stdin) : spec,
          design: design === "-" ? await text(process.stdin) : design,
        });
        (await app.make(ConsoleOutputService)).result({
          level: "success",
          human: `Created feature workspace ${data.name}: ${data.workspace}`,
          data,
        });
      });
  }

  public async run({
    slug,
    specification,
    design,
  }: {
    slug: string;
    specification: string;
    design?: string;
  }) {
    this.assertApplicationBooted();
    if (!specification.trim()) throw new Error("Feature specification must not be empty.");
    if (design !== undefined && !design.trim())
      throw new Error("Feature design must not be empty.");
    return (await this.app.make(FeatureWorkspaceService)).createNumbered(slug, {
      specification,
      design,
    });
  }
}
