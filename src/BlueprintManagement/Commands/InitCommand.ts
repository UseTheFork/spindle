import { BlueprintCommandOptions } from "@spindle/BlueprintManagement/Commands/BlueprintCommandOptions";
import { blueprintHandlers } from "@spindle/BlueprintManagement/Handlers/BlueprintHandlers";
import { BlueprintLifecycleService } from "@spindle/BlueprintManagement/Services/BlueprintLifecycleService";
import { BlueprintReconciliationService } from "@spindle/BlueprintManagement/Services/BlueprintReconciliationService";
import { BlueprintPrompts } from "@spindle/BlueprintManagement/Support/BlueprintPrompts";
import { ConflictPolicyParser } from "@spindle/BlueprintManagement/Support/ConflictPolicyParser";
import type { BlueprintHandler } from "@spindle/BlueprintManagement/Types/Blueprint";
import type { ConflictPolicy } from "@spindle/BlueprintManagement/Types/Installation";
import type { BlueprintOutcome } from "@spindle/BlueprintManagement/Types/Reconciliation";
import { Command } from "@spindle/Commands/Command";
import type { Application } from "@spindle/Foundation/Application";
import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import { SettingsPrompts } from "@spindle/Settings/Commands/SettingsPrompts";
import { defaultCommitSettings } from "@spindle/Settings/Models/CommitSettings";
import {
  projectSettingsSchema,
  ProjectSettingsSchema,
} from "@spindle/Settings/Models/ProjectSettings";
import {
  ProjectSettingsService,
  type ProjectSettingsData,
} from "@spindle/Settings/Services/ProjectSettingsService";
import { Stacks } from "@spindle/Support/Stacks";
import type { Command as CommanderCommand } from "commander";

export interface InitResult {
  stacks: string[];
  outcomes: BlueprintOutcome[];
  guidanceInitialized: true;
}

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
If Blueprint stacks are already configured, init exits without changing files.
Run \`spindle update\` to refresh Blueprints, project guidance, and tooling documentation.
Prompts are also disabled when stdin or stdout is not a terminal.
Other commands: settings (see \`spindle settings --help\`), update (see \`spindle update --help\`), tool (see \`spindle tool --help\`), sdd (see \`spindle sdd --help\`).
Run \`spindle --version\` to print the installed version.
`,
      )
      .allowExcessArguments(false)
      .action(
        async (
          options: {
            stack: string[];
            spindlePackageManager?: string;
            onConflict?: string;
            interactive: boolean;
          },
          cli: CommanderCommand,
        ) => {
          const interactive =
            cli.optsWithGlobals().json !== true &&
            options.interactive &&
            Boolean(process.stdin.isTTY) &&
            Boolean(process.stdout.isTTY);
          const policy = ConflictPolicyParser.parseConflictPolicy(options.onConflict);
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
          const app = await createApp();
          const result = await (
            await app.make(InitCommand)
          ).run(options.stack, spindlePackageManager, interactive, policy);
          const output = await app.make(ConsoleOutputService);
          for (const outcome of result.outcomes) {
            if (outcome.warning) output.notice("warning", outcome.warning);
          }
          const kinds = [...new Set(result.outcomes.map((outcome) => outcome.kind))];
          const counts = (status: "installed" | "skipped") =>
            kinds
              .map((kind) => ({
                kind,
                count: result.outcomes.filter(
                  (outcome) => outcome.kind === kind && outcome.status === status,
                ).length,
              }))
              .filter(({ count }) => status === "installed" || count > 0)
              .map(
                ({ kind, count }) =>
                  `${count} ${status === "skipped" ? "existing " : ""}${kind.toLowerCase()}(s)`,
              )
              .join(", ");
          const skipped = counts("skipped");
          output.result({
            level: "success",
            human: [
              ...result.outcomes
                .filter((outcome) => outcome.status === "removed")
                .map((outcome) => `Removed ${outcome.kind.toLowerCase()} '${outcome.name}'`),
              `Installed ${counts("installed") || "0 Blueprints"} for ${result.stacks.join(", ")}${skipped ? `. Skipped ${skipped}` : ""}`,
              "Initialized project guidance and tooling documentation.",
            ],
            data: result,
          });
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
  ): Promise<InitResult> {
    this.assertApplicationBooted();
    const existing = ProjectSettingsService.current(this.app);
    if (existing.status === "invalid") {
      throw new Error(existing.reason, { cause: existing.error });
    }
    if (existing.status === "valid" && existing.data.stacks.length > 0) {
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
      stacks = await BlueprintPrompts.promptStacks(Stacks.supported);
    }

    let spindlePackageManager =
      packageManagerArgument ??
      (existing.status === "valid" ? existing.data.spindle_package_manager : undefined);
    if (spindlePackageManager === undefined && interactive) {
      spindlePackageManager = await BlueprintPrompts.promptSpindlePackageManager();
    }
    if (spindlePackageManager === undefined) {
      throw new Error(
        "A package-manager command is required; provide --spindle-package-manager <command> or run interactively.",
      );
    }
    spindlePackageManager = InitCommand.normalizeSpindlePackageManager(spindlePackageManager);
    const commit = interactive
      ? await SettingsPrompts.promptCommitSettings(
          existing.status === "valid" ? existing.data.commit : undefined,
        )
      : ((existing.status === "valid" ? existing.data.commit : undefined) ?? defaultCommitSettings);

    const settings: ProjectSettingsData = projectSettingsSchema.parse({
      ...(existing.status === "valid" ? existing.data : {}),
      $schema: ProjectSettingsSchema.schemaUrl(),
      stacks,
      spindle_package_manager: spindlePackageManager,
      commit,
    });
    const lifecycle = await this.app.make(BlueprintLifecycleService);
    const outcomes = await lifecycle.run("init", settings, () =>
      this.reconciliationService.reconcile(this.handlers, {
        mode: "init",
        context: { stacks, variables: {} },
        settings,
        conflictPolicy: policy,
        chooseConflict: interactive ? BlueprintPrompts.promptConflict : undefined,
      }),
    );
    return { stacks, outcomes, guidanceInitialized: true };
  }
}
