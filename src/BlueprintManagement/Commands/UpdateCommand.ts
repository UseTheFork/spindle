import { blueprintHandlers } from "@spindle/BlueprintManagement/Handlers/BlueprintHandlers";
import { BlueprintLifecycleService } from "@spindle/BlueprintManagement/Services/BlueprintLifecycleService";
import { BlueprintReconciliationService } from "@spindle/BlueprintManagement/Services/BlueprintReconciliationService";
import type { BlueprintHandler } from "@spindle/BlueprintManagement/Types/Blueprint";
import type { BlueprintOutcome } from "@spindle/BlueprintManagement/Types/Reconciliation";
import { Command } from "@spindle/Commands/Command";
import type { Application } from "@spindle/Foundation/Application";
import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import {
  projectSettingsSchema,
  ProjectSettingsSchema,
} from "@spindle/Settings/Models/ProjectSettings";
import {
  ProjectSettingsService,
  type ProjectSettingsData,
} from "@spindle/Settings/Services/ProjectSettingsService";
import type { Command as CommanderCommand } from "commander";

export interface UpdateResult {
  stacks: string[];
  outcomes: BlueprintOutcome[];
  guidanceInitialized: true;
}

export class UpdateCommand extends Command {
  private handlers: readonly BlueprintHandler[] = [];
  private reconciliationService!: BlueprintReconciliationService;

  public static register(program: CommanderCommand, createApp: () => Promise<Application>): void {
    program
      .command("update")
      .description(
        `Re-render installed Blueprints (Skills, Agents, and Instructions).
Reads stacks and the Spindle package-manager command from .spindle/config.json.
Installs missing Blueprints, removes obsolete managed Blueprints, and refreshes project guidance.`,
      )
      .addHelpText(
        "after",
        `
Requires .spindle/config.json; run \`spindle init\` first.
Catalog paths are overwritten, including local edits. Unrelated paths are preserved.
`,
      )
      .allowExcessArguments(false)
      .action(async () => {
        const app = await createApp();
        const result = await (await app.make(UpdateCommand)).run();
        const output = await app.make(ConsoleOutputService);
        for (const outcome of result.outcomes) {
          if (outcome.warning) output.notice("warning", outcome.warning);
        }
        const human = result.outcomes
          .filter((outcome) => outcome.status === "removed")
          .map((outcome) => `Removed ${outcome.kind.toLowerCase()} '${outcome.name}'`);
        if (result.outcomes.length === 0) human.push("No Blueprints apply to the selected stacks");
        for (const kind of new Set(result.outcomes.map((outcome) => outcome.kind))) {
          const ofKind = result.outcomes.filter((outcome) => outcome.kind === kind);
          const count = (status: BlueprintOutcome["status"]) =>
            ofKind.filter((outcome) => outcome.status === status).length;
          human.push(
            `Added ${count("installed")}, updated ${count("updated")}, skipped ${count("skipped")}, up to date ${count("up-to-date")} ${kind.toLowerCase()}(s)`,
          );
        }
        output.result({ level: "success", human, data: result });
      });
  }

  public constructor(app: Application) {
    super(app);
  }

  public override async boot(): Promise<void> {
    this.handlers = blueprintHandlers;
    this.reconciliationService = await this.app.make(BlueprintReconciliationService);
  }

  public async run(replacement?: ProjectSettingsData): Promise<UpdateResult> {
    this.assertApplicationBooted();
    const current = ProjectSettingsService.requireCurrent(this.app);
    const state =
      replacement === undefined
        ? { status: "valid" as const, data: current.settings }
        : ProjectSettingsService.parse(JSON.stringify(replacement));
    const resolved = ProjectSettingsService.require(state);
    const settings = projectSettingsSchema.parse({
      ...resolved.settings,
      $schema: ProjectSettingsSchema.schemaUrl(),
    });
    const spindlePackageManager = settings.spindle_package_manager;
    if (spindlePackageManager === undefined) {
      throw new Error(
        'Missing "spindle_package_manager" in .spindle/config.json; add the preferred Spindle package-manager command before running `spindle update`.',
      );
    }

    const lifecycle = await this.app.make(BlueprintLifecycleService);
    const outcomes = await lifecycle.run("update", settings, () =>
      this.reconciliationService.reconcile(this.handlers, {
        mode: "update",
        settings,
        persistSettings: true,
        resolveContext: async () => ({
          stacks: settings.stacks,
          variables: {},
        }),
      }),
    );
    return { stacks: settings.stacks, outcomes, guidanceInitialized: true };
  }
}
