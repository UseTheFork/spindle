import type { Command as CommanderCommand } from "commander";

import { blueprintHandlers } from "@/BlueprintManagement/Handlers/BlueprintHandlers";
import { BlueprintReconciliationService } from "@/BlueprintManagement/Services/BlueprintReconciliationService";
import type { BlueprintHandler } from "@/BlueprintManagement/Types/Blueprint";
import type { BlueprintOutcome } from "@/BlueprintManagement/Types/Reconciliation";
import { Command } from "@/Commands/Command";
import type { Application } from "@/Foundation/Application";
import { LoadProjectConfiguration } from "@/Foundation/Bootstrap/LoadProjectConfiguration";
import { ConsoleOutputService } from "@/Foundation/ConsoleOutputService";
import { ProjectService } from "@/Project/Services/ProjectService";
import { Stacks } from "@/Support/Stacks";

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
        `Re-render installed Blueprints (Skills, Agents, and Instructions) whose shipped version is newer.
Reads stacks and the Spindle package-manager command from .github/spindle.json.
Installs missing Blueprints, removes obsolete managed Blueprints, and refreshes project guidance.`,
      )
      .addHelpText(
        "after",
        `
Requires .github/spindle.json; run \`spindle init\` first.
Unmanaged Blueprints are preserved.
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

  public async run(): Promise<UpdateResult> {
    this.assertApplicationBooted();
    const config = LoadProjectConfiguration.require(
      await LoadProjectConfiguration.refresh(this.app),
    );
    if (config.stacks.length === 0) {
      throw new Error(
        `No Blueprint stacks are configured. Run \`spindle init --stack <${Stacks.supported.join("|")}>\` first.`,
      );
    }
    const spindlePackageManager = config.config.spindle_package_manager;
    if (spindlePackageManager === undefined) {
      throw new Error(
        'Missing "spindle_package_manager" in .github/spindle.json; add the preferred Spindle package-manager command before running `spindle update`.',
      );
    }

    const project = await this.app.make(ProjectService);
    const guidance = await project.prepare(config.config, "update");
    const outcomes = await this.reconciliationService.reconcile(this.handlers, {
      mode: "update",
      config: config.config,
      resolveContext: async () => ({
        stacks: config.stacks,
        variables: {},
      }),
    });
    try {
      await project.apply(guidance);
    } catch (error) {
      const completed = outcomes.filter(
        (outcome) =>
          outcome.status === "installed" ||
          outcome.status === "updated" ||
          outcome.status === "removed",
      );
      throw new Error(
        `${error instanceof Error ? error.message : String(error)} Completed Blueprint changes: ${completed.map((outcome) => `${outcome.status} ${outcome.kind} '${outcome.name}'`).join(", ") || "none"}.`,
        { cause: error },
      );
    }
    await LoadProjectConfiguration.refresh(this.app);
    return { stacks: config.stacks, outcomes, guidanceInitialized: true };
  }
}
