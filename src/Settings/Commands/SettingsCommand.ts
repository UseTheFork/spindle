import { Command } from "@spindle/Commands/Command";
import type { Application } from "@spindle/Foundation/Application";
import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import { SettingsPrompts } from "@spindle/Settings/Commands/SettingsPrompts";
import { ProjectSettingsService } from "@spindle/Settings/Services/ProjectSettingsService";
import { SettingsService } from "@spindle/Settings/Services/SettingsService";
import type { Command as CommanderCommand } from "commander";

export class SettingsCommand extends Command {
  public static register(program: CommanderCommand, createApp: () => Promise<Application>): void {
    const settings = program
      .command("settings")
      .description("View or change project settings.")
      .addHelpText(
        "after",
        "\nSaving settings regenerates selected Blueprints and overwrites their catalog paths.\nEnabling vscode.enabled overwrites managed VS Code settings, the commit-message instruction array, and .github/copilot/commit-message-style.md.\n",
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
        const { settings } = ProjectSettingsService.requireCurrent(app);
        const updated = await SettingsPrompts.promptSettings(settings);
        const data = await (await app.make(SettingsService)).save(updated);
        (await app.make(ConsoleOutputService)).result({
          level: "success",
          human: "Settings saved and Blueprints regenerated.",
          data,
        });
      });
    settings
      .command("list")
      .description("List configurable settings and their metadata.")
      .allowExcessArguments(false)
      .action(async () => {
        const app = await createApp();
        const data = (await app.make(SettingsService)).list();
        const human = data.map(
          ({
            key,
            type,
            description,
            required,
            group_optional,
            default: defaultValue,
            constraints,
          }) => {
            const requirement = required
              ? group_optional
                ? " (required when its group is configured)"
                : " (required)"
              : "";
            const fallback =
              defaultValue === undefined ? "" : ` Default: ${JSON.stringify(defaultValue)}.`;
            const limits =
              constraints === undefined ? "" : ` Constraints: ${JSON.stringify(constraints)}.`;
            return `${key} (${type})${requirement}: ${description}${fallback}${limits}`;
          },
        );
        (await app.make(ConsoleOutputService)).result({ level: "info", human, data });
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
