import type { Command as CommanderCommand } from "commander";

import { Command } from "@spindle/Commands/Command";
import type { Application } from "@spindle/Foundation/Application";
import { SddCommandGroups } from "@spindle/SubagentDrivenDevelopment/Commands/SddCommandGroups";
import type { ReviewRequireOptions } from "@spindle/SubagentDrivenDevelopment/Models/Options";
import { ReviewService } from "@spindle/SubagentDrivenDevelopment/Services/ReviewService";

export class ReviewRequireCommand extends Command {
  public static register(root: CommanderCommand, _createApp: () => Promise<Application>): void {
    SddCommandGroups.reviewSchema(root);
  }
  public async run(options: ReviewRequireOptions) {
    this.assertApplicationBooted();
    return (await this.app.make(ReviewService)).reviewRequire(options);
  }
}
