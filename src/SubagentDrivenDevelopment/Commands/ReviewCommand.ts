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
          if (options.scope !== "delivery") {
            throw new Error("Feature review requirements need --scope delivery.");
          }
          if (!options.spec || !reviewType || !options.details || !options.author) {
            throw new Error(
              "review require needs --spec, --scope delivery, --type, --details, and --author.",
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
        if (
          !options.spec ||
          options.scope !== "delivery" ||
          !options.inventory ||
          !options.author
        ) {
          throw new Error(
            "Feature review requires --spec, --scope delivery, --inventory, and --author.",
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
    this.assertApplicationBooted();
    return (await this.app.make(ReviewService)).review(options);
  }
}
