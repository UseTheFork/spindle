import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import { CommandOptions } from "@/Commands/CommandOptions";
import type { Application } from "@/Foundation/Application";
import { group } from "@/SubagentDrivenDevelopment/Commands/groups";
import type { SubmitOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import { SubmissionService } from "@/SubagentDrivenDevelopment/Services/SubmissionService";

export class SubmitCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    let findingsDeclared = false;
    let noFindingsDeclared = false;
    const submitCommand = group(root)
      .command("submit")
      .description("Register an implementation or review report.")
      .requiredOption("--spec <path>", "Feature spec path", CommandOptions.once("--spec"))
      .option("--ticket <id>", "Ticket ID", CommandOptions.once("--ticket"))
      .option("--scope <scope>", "Workflow scope: delivery")
      .requiredOption("--role <role>", "Assignment role")
      .option(
        "--assignment <id>",
        "Exact review assignment ID",
        CommandOptions.once("--assignment"),
      )
      .option("--report <path>", "Implementation report path", CommandOptions.once("--report"))
      .option(
        "--result <result>",
        "Review result: passed, failed, unavailable",
        CommandOptions.once("--result"),
      )
      .option("--findings <ids...>", "Complete canonical finding ID list for this report")
      .option("--no-findings", "Explicitly attest that the review report has no findings")
      .option("--unavailable", "Record that the assigned report is unavailable")
      .option(
        "--details <details>",
        "Required details for failed or unavailable results",
        CommandOptions.once("--details"),
      )
      .requiredOption("--author <author>", "Controller author", CommandOptions.once("--author"))
      .allowExcessArguments(false);
    submitCommand.on("option:findings", () => {
      findingsDeclared = true;
    });
    submitCommand.on("option:no-findings", () => {
      noFindingsDeclared = true;
    });
    submitCommand.action(async (options: SubmitOptions) => {
      const command = await (await createApp()).make(SubmitCommand);
      if (options.scope !== undefined && options.scope !== "delivery") {
        throw new Error("--scope must be 'delivery'.");
      }
      if (Boolean(options.ticket) === (options.scope === "delivery")) {
        throw new Error("submit needs exactly one of --ticket or --scope delivery.");
      }
      if (findingsDeclared && noFindingsDeclared) {
        throw new Error("--findings and --no-findings cannot be combined.");
      }
      const { findings, ...submission } = options;
      console.log(
        JSON.stringify(
          await command.run({
            ...submission,
            ...(options.role === "review"
              ? findings === false
                ? { noFindings: true }
                : Array.isArray(findings)
                  ? { findingIds: findings }
                  : {}
              : {}),
          }),
          null,
          2,
        ),
      );
    });
  }
  public async run(options: SubmitOptions) {
    return (await this.app.make(SubmissionService)).submit(options);
  }
}
