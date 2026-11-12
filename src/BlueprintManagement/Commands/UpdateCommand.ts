import chalk from "chalk";
import type { Command as CommanderCommand } from "commander";

import { blueprintHandlers } from "@/BlueprintManagement/Handlers/BlueprintHandlers";
import { BlueprintReconciliationService } from "@/BlueprintManagement/Services/BlueprintReconciliationService";
import type { BlueprintHandler } from "@/BlueprintManagement/Types/Blueprint";
import { Command } from "@/Commands/Command";
import type { Application } from "@/Foundation/Application";
import { LoadProjectConfiguration } from "@/Foundation/Bootstrap/LoadProjectConfiguration";
import { ProjectService } from "@/Project/Services/ProjectService";
import { Stacks } from "@/Support/Stacks";

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
      .action(async () => (await (await createApp()).make(UpdateCommand)).run());
  }

  public constructor(app: Application) {
    super(app);
  }

  public override async boot(): Promise<void> {
    this.handlers = blueprintHandlers;
    this.reconciliationService = await this.app.make(BlueprintReconciliationService);
  }

  public async run(): Promise<void> {
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
    for (const outcome of outcomes) {
      if (outcome.warning) {
        console.error(chalk.yellow(outcome.warning));
      }
    }
    for (const outcome of outcomes.filter((item) => item.status === "removed")) {
      console.log(`${chalk.green("✔")} Removed ${outcome.kind.toLowerCase()} '${outcome.name}'`);
    }
    if (outcomes.length === 0) {
      console.log(`${chalk.green("✔")} No Blueprints apply to the selected stacks`);
    }
    for (const kind of new Set(outcomes.map((outcome) => outcome.kind))) {
      const ofKind = outcomes.filter((outcome) => outcome.kind === kind);
      const added = ofKind.filter((outcome) => outcome.status === "installed").length;
      const updated = ofKind.filter((outcome) => outcome.status === "updated").length;
      const skipped = ofKind.filter((outcome) => outcome.status === "skipped").length;
      const upToDate = ofKind.filter((outcome) => outcome.status === "up-to-date").length;
      console.log(
        `${chalk.green("✔")} Added ${added}, updated ${updated}, skipped ${skipped}, up to date ${upToDate} ${kind.toLowerCase()}(s)`,
      );
    }
  }
}
