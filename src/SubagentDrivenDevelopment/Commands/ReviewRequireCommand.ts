import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import type { Application } from "@/Foundation/Application";
import { reviewSchema } from "@/SubagentDrivenDevelopment/Commands/groups";
import type { ReviewRequireOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import { ReviewService } from "@/SubagentDrivenDevelopment/Services/ReviewService";

export class ReviewRequireCommand extends Command {
  public static register(root: CommanderCommand, _createApp: () => Promise<Application>): void {
    reviewSchema(root);
  }
  public async run(options: ReviewRequireOptions) {
    return (await this.app.make(ReviewService)).reviewRequire(options);
  }
}
