import { Command } from "@spindle/Commands/Command";
import { CommandOptions } from "@spindle/Commands/CommandOptions";
import type { Application } from "@spindle/Foundation/Application";
import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import { SddCommandGroup } from "@spindle/SubagentDrivenDevelopment/Commands/SddCommandGroup";
import { SddReviewService } from "@spindle/SubagentDrivenDevelopment/Services/SddReviewService";
import type { Command as CommanderCommand } from "commander";

type SubmitOptions = { review: string; recommendation: string; finding?: string[] };
type ReviewOptions = {
  feature: string;
  ticket?: string;
  target?: string;
  scope?: string;
  focus?: string;
};

export class SddReviewSubmitCommand extends Command {
  public static register(program: CommanderCommand, createApp: () => Promise<Application>): void {
    const review = SddCommandGroup.subgroup(
      program,
      "review",
      "Manage ticket acceptance and feature reviews.",
    );
    review
      .command("submit")
      .description("Record a recommendation and its proposed findings.")
      .requiredOption("--review <id>", "Review ID", CommandOptions.once("--review"))
      .requiredOption(
        "--recommendation <result>",
        "pass or changes-required",
        CommandOptions.once("--recommendation"),
      )
      .option(
        "--finding <fields...>",
        "Six values: title, severity, location, criterion, evidence, suggested fix; repeat for each finding",
      )
      .allowExcessArguments(false)
      .action(async (options: SubmitOptions) => {
        const { feature, ticket, target, scope, focus } = review.opts<ReviewOptions>();
        if (
          ticket !== undefined ||
          target !== undefined ||
          scope !== undefined ||
          focus !== undefined
        ) {
          throw new Error(
            "Use --ticket, --target, --scope, and --focus only when creating a review.",
          );
        }
        const app = await createApp();
        const data = await (await app.make(SddReviewSubmitCommand)).run(feature, options);
        const targetName = "ticket" in data ? `${data.ticket}:` : `Feature ${data.feature}:`;
        (await app.make(ConsoleOutputService)).result({
          level: "success",
          human: `Recorded ${data.review}. ${targetName} ${data.acceptance}.`,
          data,
        });
      });
  }

  public async run(feature: string, { review, recommendation, finding = [] }: SubmitOptions) {
    if (finding.length % 6 !== 0 || finding.some((field) => !field.trim())) {
      throw new Error(
        "Each finding requires title, severity, location, criterion, evidence, and suggested fix.",
      );
    }
    const proposals = [];
    for (let i = 0; i < finding.length; i += 6) {
      const [title, severity, location, criterion, evidence, suggestedFix] = finding.slice(
        i,
        i + 6,
      );
      proposals.push({ title, severity, location, criterion, evidence, suggestedFix });
    }
    return (await this.app.make(SddReviewService)).submit(
      feature,
      review,
      recommendation,
      proposals,
    );
  }
}
