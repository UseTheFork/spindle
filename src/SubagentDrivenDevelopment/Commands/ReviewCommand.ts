import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import type { Application } from "@/Foundation/Application";
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
        if (action === "require") {
          if (options.type && options.agent && options.type !== options.agent) {
            throw new Error("--type and --agent must identify the same review agent.");
          }
          const reviewType = options.type ?? options.agent;
          const deliveryScope = options.scope === "delivery";
          if (options.scope !== undefined && !deliveryScope) {
            throw new Error("--scope must be 'delivery'.");
          }
          if (Boolean(options.issue) === deliveryScope) {
            throw new Error("review require needs exactly one of --issue or --scope delivery.");
          }
          if (!options.spec || !reviewType || !options.details || !options.author) {
            throw new Error(
              "review require needs --spec, one scope selector, --type, --details, and --author.",
            );
          }
          if (options.inventory) throw new Error("--inventory is not valid with 'review require'.");
          const command = await (await createApp()).make(ReviewRequireCommand);
          console.log(
            JSON.stringify(
              await command.run({
                ...options,
                spec: options.spec,
                type: reviewType,
                details: options.details,
                author: options.author,
              }),
              null,
              2,
            ),
          );
          return;
        }
        if (action !== undefined) throw new Error(`Unknown review action: ${action}.`);
        if (options.type || options.agent || options.details) {
          throw new Error("--type, --agent, and --details are only valid with 'review require'.");
        }
        if (options.scope !== undefined && options.scope !== "delivery") {
          throw new Error("--scope must be 'delivery'.");
        }
        if (
          !options.spec ||
          Boolean(options.issue) === (options.scope === "delivery") ||
          !options.inventory ||
          !options.author
        ) {
          throw new Error(
            "review requires --spec, exactly one of --issue or --scope delivery, --inventory, and --author.",
          );
        }
        const command = await (await createApp()).make(ReviewCommand);
        console.log(
          JSON.stringify(
            await command.run({
              ...options,
              spec: options.spec,
              inventory: options.inventory,
              author: options.author,
            }),
            null,
            2,
          ),
        );
      },
    );
  }

  public async run(options: ReviewOptions) {
    return (await this.app.make(ReviewService)).review(options);
  }
}
