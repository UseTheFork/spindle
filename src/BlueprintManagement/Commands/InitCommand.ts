import chalk from "chalk";
import type { Command as CommanderCommand } from "commander";

import { BlueprintCommandOptions } from "@/BlueprintManagement/Commands/BlueprintCommandOptions";
import { parseConflictPolicy } from "@/BlueprintManagement/Commands/ConflictPolicy";
import {
  promptConflict,
  promptSpindlePackageManager,
  promptStacks,
} from "@/BlueprintManagement/Commands/Prompts";
import { blueprintHandlers } from "@/BlueprintManagement/Handlers/BlueprintHandlers";
import { BlueprintReconciliationService } from "@/BlueprintManagement/Services/BlueprintReconciliationService";
import type { BlueprintHandler } from "@/BlueprintManagement/Types/Blueprint";
import type { ConflictPolicy } from "@/BlueprintManagement/Types/Installation";
import { Command } from "@/Commands/Command";
import type { Application } from "@/Foundation/Application";
import {
  LoadProjectConfiguration,
  type ProjectConfigurationData,
} from "@/Foundation/Bootstrap/LoadProjectConfiguration";
import { ProjectService } from "@/Project/Services/ProjectService";
import { Stacks } from "@/Support/Stacks";

export class InitCommand extends Command {
  private handlers: readonly BlueprintHandler[] = [];
  private reconciliationService!: BlueprintReconciliationService;

  private static normalizeSpindlePackageManager(command: string): string {
    const normalized = command.trim();
    if (normalized.length === 0 || /[\r\n]/.test(normalized)) {
      throw new Error("--spindle-package-manager must be a non-empty, single-line command.");
    }
    return normalized;
  }

  public static register(program: CommanderCommand, createApp: () => Promise<Application>): void {
    program
      .command("init")
      .description("Install spindle Blueprints and initialize project guidance at the Git root.")
      .option(
        "--stack <id>",
        `Stack to install; repeat for several (${Stacks.supported.join(", ")})`,
        (value: string, previous: string[] = []) => [...previous, value],
        [],
      )
      .option(
        "--spindle-package-manager <command>",
        "Package-manager command prefix used in generated tooling guidance",
      )
      .addOption(
        BlueprintCommandOptions.conflictPolicyOption(
          "Policy for Blueprints that already exist; required when non-interactive and any exist (interactive runs prompt per Blueprint)",
        ),
      )
      .addOption(
        BlueprintCommandOptions.noInteractiveOption(
          "Never prompt; missing required input is an error",
        ),
      )
      .addHelpText(
        "after",
        `
If Blueprint stacks are already configured, project guidance is initialized and
\`spindle update\` is required to change the installed Blueprints.
Prompts are also disabled when stdin or stdout is not a terminal.
Other commands: update (see \`spindle update --help\`), tool (see \`spindle tool --help\`), sdd (see \`spindle sdd --help\`).
Run \`spindle --version\` to print the installed version.
`,
      )
      .allowExcessArguments(false)
      .action(
        async (options: {
          stack: string[];
          spindlePackageManager?: string;
          onConflict?: string;
          interactive: boolean;
        }) => {
          const interactive =
            options.interactive && Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY);
          const policy = parseConflictPolicy(options.onConflict);
          Stacks.validate(options.stack);
          const spindlePackageManager =
            options.spindlePackageManager === undefined
              ? undefined
              : InitCommand.normalizeSpindlePackageManager(options.spindlePackageManager);
          if (!interactive && options.stack.length === 0) {
            throw new Error(
              `Provide at least one --stack flag <${Stacks.supported.join("|")}> (or run interactively).`,
            );
          }
          await (
            await (await createApp()).make(InitCommand)
          ).run(options.stack, spindlePackageManager, interactive, policy);
        },
      );
  }

  public constructor(app: Application) {
    super(app);
  }

  public override async boot(): Promise<void> {
    this.handlers = blueprintHandlers;
    this.reconciliationService = await this.app.make(BlueprintReconciliationService);
  }

  public async run(
    stackArguments: string[],
    packageManagerArgument: string | undefined,
    interactive: boolean,
    policy: ConflictPolicy | undefined,
  ): Promise<void> {
    this.assertApplicationBooted();
    const existing = LoadProjectConfiguration.current(this.app);
    if (existing.status === "invalid") {
      throw new Error(existing.reason, { cause: existing.error });
    }
    if (existing.status === "valid" && existing.data.stacks.length > 0) {
      await (await this.app.make(ProjectService)).initialize();
      console.log(`${chalk.green("✔")} Initialized project guidance and tooling documentation.`);
      throw new Error(
        "This repository already has configured Blueprint stacks; run `spindle update` instead of `init`.",
      );
    }

    let stacks = [...new Set(stackArguments)];
    Stacks.validate(stacks);
    if (stacks.length === 0) {
      if (!interactive) {
        throw new Error(
          `Provide at least one --stack flag <${Stacks.supported.join("|")}> (or run interactively).`,
        );
      }
      stacks = await promptStacks(Stacks.supported);
    }

    let spindlePackageManager =
      packageManagerArgument ??
      (existing.status === "valid" ? existing.data.spindle_package_manager : undefined);
    if (spindlePackageManager === undefined && interactive) {
      spindlePackageManager = await promptSpindlePackageManager();
    }
    if (spindlePackageManager === undefined) {
      throw new Error(
        "A package-manager command is required; provide --spindle-package-manager <command> or run interactively.",
      );
    }
    spindlePackageManager = InitCommand.normalizeSpindlePackageManager(spindlePackageManager);

    const config: ProjectConfigurationData = {
      ...(existing.status === "valid" ? existing.data : {}),
      stacks,
      spindle_package_manager: spindlePackageManager,
    };
    delete config.variables;
    const project = await this.app.make(ProjectService);
    const guidance = await project.prepare(config);
    const outcomes = await this.reconciliationService.reconcile(this.handlers, {
      mode: "init",
      context: { stacks, variables: {} },
      config,
      conflictPolicy: policy,
      chooseConflict: interactive ? promptConflict : undefined,
    });
    await LoadProjectConfiguration.refresh(this.app);
    for (const outcome of outcomes.filter((item) => item.status === "removed")) {
      console.log(`${chalk.green("✔")} Removed ${outcome.kind.toLowerCase()} '${outcome.name}'`);
    }
    const kinds = [...new Set(outcomes.map((outcome) => outcome.kind))];
    const counts = (status: "installed" | "skipped") =>
      kinds
        .map((kind) => ({
          kind,
          count: outcomes.filter((outcome) => outcome.kind === kind && outcome.status === status)
            .length,
        }))
        .filter(({ count }) => status === "installed" || count > 0)
        .map(
          ({ kind, count }) =>
            `${count} ${status === "skipped" ? "existing " : ""}${kind.toLowerCase()}(s)`,
        )
        .join(", ");
    const skipped = counts("skipped");

    console.log(
      `${chalk.green("✔")} Installed ${counts("installed") || "0 Blueprints"} for ${chalk.cyan(stacks.join(", "))}${skipped ? `. Skipped ${skipped}` : ""}`,
    );
    try {
      await project.apply(guidance);
    } catch (error) {
      const completed = outcomes.filter(
        (outcome) => outcome.status === "installed" || outcome.status === "removed",
      );
      throw new Error(
        `${error instanceof Error ? error.message : String(error)} Completed Blueprint changes: ${completed.map((outcome) => `${outcome.status} ${outcome.kind} '${outcome.name}'`).join(", ") || "none"}.`,
        { cause: error },
      );
    }
    console.log(`${chalk.green("✔")} Initialized project guidance and tooling documentation.`);
  }
}
