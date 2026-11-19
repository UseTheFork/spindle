import { Command } from "@spindle/Commands/Command";
import { CommandOptions } from "@spindle/Commands/CommandOptions";
import type { Application } from "@spindle/Foundation/Application";
import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import { SddCommandGroup } from "@spindle/SubagentDrivenDevelopment/Commands/SddCommandGroup";
import { SddReviewService } from "@spindle/SubagentDrivenDevelopment/Services/SddReviewService";
import type { Command as CommanderCommand } from "commander";

type Options = {
  feature: string;
  ticket?: string;
  target?: string;
  scope?: string;
  focus?: string;
};

export class SddReviewCommand extends Command {
  public static register(program: CommanderCommand, createApp: () => Promise<Application>): void {
    SddCommandGroup.subgroup(program, "review", "Manage ticket acceptance and feature reviews.")
      .requiredOption(
        "--feature <directory>",
        "Feature workspace",
        CommandOptions.once("--feature"),
      )
      .option("--ticket <id>", "Ticket ID", CommandOptions.once("--ticket"))
      .option(
        "--target <level>",
        "Review the feature instead of a ticket",
        CommandOptions.once("--target"),
      )
      .option("--scope <text>", "Review scope", CommandOptions.once("--scope"))
      .option("--focus <text>", "Optional review focus", CommandOptions.once("--focus"))
      .allowExcessArguments(false)
      .action(async ({ feature, ticket, target, scope, focus }: Options) => {
        if (target !== undefined && target !== "feature") {
          throw new Error("Review --target must be 'feature'.");
        }
        if (target === "feature" && ticket !== undefined) {
          throw new Error("Feature review cannot be combined with --ticket.");
        }
        const reviewTarget =
          target === "feature"
            ? ({ type: "feature" } as const)
            : ticket !== undefined
              ? { type: "ticket" as const, ticketId: ticket }
              : undefined;
        if (!reviewTarget) throw new Error("Review requires --ticket or --target feature.");
        const app = await createApp();
        const data = await (
          await app.make(SddReviewCommand)
        ).run(feature, reviewTarget, scope, focus);
        const targetName = "ticket" in data ? data.ticket : `feature ${data.feature}`;
        (await app.make(ConsoleOutputService)).result({
          level: "success",
          human: [`Created review ${data.review} for ${targetName}.`, data.assignmentCommand],
          data,
        });
      });
  }

  public async run(
    feature: string,
    target: { type: "ticket"; ticketId: string } | { type: "feature" },
    scope?: string,
    focus?: string,
  ) {
    const defaultScope =
      target.type === "ticket"
        ? "Combined ticket changes"
        : "Complete feature against specification";
    return (await this.app.make(SddReviewService)).start(
      feature,
      target,
      scope ?? defaultScope,
      focus,
    );
  }
}
