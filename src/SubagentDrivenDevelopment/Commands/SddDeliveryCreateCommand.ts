import { Command } from "@spindle/Commands/Command";
import { CommandOptions } from "@spindle/Commands/CommandOptions";
import type { Application } from "@spindle/Foundation/Application";
import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import { SddCommandGroup } from "@spindle/SubagentDrivenDevelopment/Commands/SddCommandGroup";
import { DeliveryService } from "@spindle/SubagentDrivenDevelopment/Services/DeliveryService";
import type { Command as CommanderCommand } from "commander";

type Options = { feature: string; writeScope: string[] };

export class SddDeliveryCreateCommand extends Command {
  public static register(program: CommanderCommand, createApp: () => Promise<Application>): void {
    SddCommandGroup.subgroup(program, "delivery", "Prepare final feature delivery.")
      .command("create")
      .description("Create a scoped ticket for merging the latest original branch tip.")
      .requiredOption(
        "--feature <directory>",
        "Feature workspace",
        CommandOptions.once("--feature"),
      )
      .option(
        "--write-scope <path>",
        "Incoming file path the merge agent may change (repeatable)",
        (value: string, previous: string[]) => [...previous, value],
        [],
      )
      .allowExcessArguments(false)
      .action(async (options: Options) => {
        const app = await createApp();
        const data = await (await app.make(SddDeliveryCreateCommand)).run(options);
        (await app.make(ConsoleOutputService)).result({
          level: "success",
          human: `Created delivery ticket ${data.ticket}: ${data.path}`,
          data,
        });
      });
  }

  public async run({ feature, writeScope }: Options) {
    this.assertApplicationBooted();
    return (await this.app.make(DeliveryService)).createTicket(feature, writeScope);
  }
}
