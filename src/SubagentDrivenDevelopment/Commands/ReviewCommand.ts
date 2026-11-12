import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import type { Application } from "@/Foundation/Application";
import { ConsoleOutputService } from "@/Foundation/ConsoleOutputService";
import { reviewSchema } from "@/SubagentDrivenDevelopment/Commands/groups";
import { ReviewRequireCommand } from "@/SubagentDrivenDevelopment/Commands/ReviewRequireCommand";
import type {
  ReviewOptions,
  ReviewRequireOptions,
} from "@/SubagentDrivenDevelopment/Models/Options";
import { ReviewService } from "@/SubagentDrivenDevelopment/Services/ReviewService";

export class ReviewCommand extends Command {
  public static register(root: CommanderCommand, createApp: () => Promise<Application>): void {
    reviewSchema(root).action(
      async (
        action: string | undefined,
        options: Partial<ReviewOptions & ReviewRequireOptions>,
      ) => {
        if (options.scope !== undefined && options.scope !== "delivery") {
          throw new Error("--scope must be 'delivery'.");
        }
        if (Boolean(options.ticket) === (options.scope === "delivery")) {
          throw new Error("review needs exactly one of --ticket or --scope delivery.");
        }
        if (action === "require") {
          if (options.type && options.agent && options.type !== options.agent) {
            throw new Error("--type and --agent must identify the same review agent.");
          }
          const reviewType = options.type ?? options.agent;
          if (!options.spec || !reviewType || !options.details || !options.author) {
            throw new Error("review require needs --spec, --type, --details, and --author.");
          }
          if (options.inventory) throw new Error("--inventory is not valid with 'review require'.");
          const app = await createApp();
          const command = await app.make(ReviewRequireCommand);
          const data = await command.run({
            ...options,
            spec: options.spec,
            type: reviewType,
            details: options.details,
            author: options.author,
          });
          const output = await app.make(ConsoleOutputService);
          output.result({
            level: "success",
            human: `Recorded ${reviewType} review requirement for ${options.ticket ? `ticket ${options.ticket}` : "delivery"}.`,
            data,
          });
          return;
        }
        if (action !== undefined) throw new Error(`Unknown review action: ${action}.`);
        if (options.type || options.agent || options.details) {
          throw new Error("--type, --agent, and --details are only valid with 'review require'.");
        }
        if (!options.spec || !options.inventory || !options.author) {
          throw new Error("review requires --spec, --inventory, and --author.");
        }
        const app = await createApp();
        const command = await app.make(ReviewCommand);
        const data = await command.run({
          ...options,
          spec: options.spec,
          inventory: options.inventory,
          author: options.author,
        });
        const output = await app.make(ConsoleOutputService);
        const human = [
          `Review completed for ${options.ticket ? `ticket ${options.ticket}` : "delivery"}.`,
          ...data.assignments.flatMap((assignment) => [
            `Review assignment ${assignment.id} (${assignment.agent}, ${assignment.status}).`,
            `Report: ${assignment.report}`,
            ...(assignment.workspace ? [`Workspace: ${assignment.workspace}`] : []),
            ...(assignment.branch ? [`Branch: ${assignment.branch}`] : []),
          ]),
        ];
        output.result({
          level: "success",
          human,
          data,
        });
      },
    );
  }

  public async run(options: ReviewOptions) {
    this.assertApplicationBooted();
    return (await this.app.make(ReviewService)).review(options);
  }
}
