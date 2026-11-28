import { blueprintHandlers } from "@spindle/BlueprintManagement/Handlers/BlueprintHandlers";
import { BlueprintLifecycleService } from "@spindle/BlueprintManagement/Services/BlueprintLifecycleService";
import { BlueprintReconciliationService } from "@spindle/BlueprintManagement/Services/BlueprintReconciliationService";
import {
  UpdateAutoCommitService,
  type UpdateCommitResult,
  type UpdateCommitSnapshot,
} from "@spindle/BlueprintManagement/Services/UpdateAutoCommitService";
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
  autoCommit?: UpdateCommitResult;
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
Set update.auto_commit to true to commit update changes; update.commit_message sets the message.
`,
      )
      .allowExcessArguments(false)
      .action(async () => {
        const app = await createApp();
        const result = await (await app.make(UpdateCommand)).run(undefined, true);
        const output = await app.make(ConsoleOutputService);
        for (const outcome of result.outcomes) {
          if (outcome.warning) output.notice("warning", outcome.warning);
        }
        if (
          result.autoCommit &&
          (result.autoCommit.level === "warning" || result.autoCommit.status === "skipped")
        )
          output.notice(result.autoCommit.level, result.autoCommit.message);
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
        if (result.autoCommit?.status === "committed" && result.autoCommit.level === "info") {
          human.push(result.autoCommit.message);
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

  public async run(replacement?: ProjectSettingsData, autoCommit = false): Promise<UpdateResult> {
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

    const commitService =
      autoCommit && settings.update.auto_commit
        ? await this.app.make(UpdateAutoCommitService)
        : undefined;
    let snapshot: UpdateCommitSnapshot | undefined;
    let commitResult: UpdateCommitResult | undefined;
    if (commitService) {
      try {
        snapshot = await commitService.snapshot();
      } catch (error) {
        commitResult = {
          status: "failed",
          level: "warning",
          message: `Auto-commit unavailable: ${error instanceof Error ? error.message : String(error)}. Commit the update manually.`,
        };
      }
    }
    let lifecycleChanges: readonly string[] = [];
    const lifecycle = await this.app.make(BlueprintLifecycleService);
    const outcomes = await lifecycle.run(
      "update",
      settings,
      () =>
        this.reconciliationService.reconcile(this.handlers, {
          mode: "update",
          settings,
          persistSettings: true,
          resolveContext: async () => ({
            stacks: settings.stacks,
            variables: {},
          }),
        }),
      (paths) => {
        lifecycleChanges = paths;
      },
    );
    if (commitService && snapshot) {
      try {
        commitResult = await commitService.commit(
          snapshot,
          outcomes,
          this.handlers,
          lifecycleChanges,
          settings.update.commit_message,
        );
      } catch (error) {
        commitResult = {
          status: "failed",
          level: "warning",
          message: `Auto-commit failed: ${error instanceof Error ? error.message : String(error)}. Commit the update manually.`,
        };
      }
    }
    return {
      stacks: settings.stacks,
      outcomes,
      guidanceInitialized: true,
      ...(commitResult ? { autoCommit: commitResult } : {}),
    };
  }
}
