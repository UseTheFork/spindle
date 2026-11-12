import type { Command as CommanderCommand } from "commander";

import { Command } from "@/Commands/Command";
import type { Application } from "@/Foundation/Application";
import { LoadProjectConfiguration } from "@/Foundation/Bootstrap/LoadProjectConfiguration";
import { ConsoleOutputService } from "@/Foundation/ConsoleOutputService";
import { promptSettings } from "@/Settings/Commands/Prompts";
import { SettingsService } from "@/Settings/Services/SettingsService";

export class SettingsCommand extends Command {
  public static register(program: CommanderCommand, createApp: () => Promise<Application>): void {
    const settings = program
      .command("settings")
      .description("View or change project settings.")
      .addHelpText(
        "after",
        "\nSaving settings regenerates selected Blueprints and overwrites their catalog paths.\n",
      )
      .allowExcessArguments(false)
      .action(async (_options: unknown, command: CommanderCommand) => {
        if (
          command.optsWithGlobals().json === true ||
          !process.stdin.isTTY ||
          !process.stdout.isTTY
        ) {
          throw new Error(
            "The settings walkthrough requires a terminal. Use settings get or set instead.",
          );
        }
        const app = await createApp();
        const { config } = LoadProjectConfiguration.requireCurrent(app);
        const updated = await promptSettings(config);
        const data = await (await app.make(SettingsService)).save(updated);
        (await app.make(ConsoleOutputService)).result({
          level: "success",
          human: "Settings saved and Blueprints regenerated.",
          data,
        });
      });
    settings
      .command("get")
      .argument("[key]")
      .description("Read a setting, or all settings.")
      .allowExcessArguments(false)
      .action(async (key: string | undefined) => {
        const app = await createApp();
        const data = await (await app.make(SettingsService)).get(key);
        (await app.make(ConsoleOutputService)).result({
          level: "info",
          human: JSON.stringify(data, null, 2),
          data,
        });
      });
    settings
      .command("set")
      .argument("<key>")
      .argument("<json>")
      .description("Set a setting to a JSON value.")
      .allowExcessArguments(false)
      .action(async (key: string, json: string) => {
        let value: unknown;
        try {
          value = JSON.parse(json);
        } catch (error) {
          throw new Error("Setting value must be valid JSON.", { cause: error });
        }
        const app = await createApp();
        const data = await (await app.make(SettingsService)).set(key, value);
        (await app.make(ConsoleOutputService)).result({
          level: "success",
          human: "Settings saved and Blueprints regenerated.",
          data,
        });
      });
  }
}
