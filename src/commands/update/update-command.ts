import { readFile } from "node:fs/promises";
import { join } from "node:path";

import chalk from "chalk";
import type { Command as CommanderCommand } from "commander";

import { blueprintHandlers } from "@/blueprints/registry";
import type { BlueprintHandler } from "@/blueprints/types";
import { Command } from "@/commands/Command";
import { conflictPolicyOption, noInteractiveOption } from "@/commands/shared-options";
import type { Application } from "@/foundation/Application";
import type { ConflictPolicy } from "@/installation/types";
import { promptNewBlueprints, promptOutdated, promptVariable } from "@/prompts";
import { BlueprintReconciliationService } from "@/reconciliation/blueprint-reconciliation-service";
import { parseConflictPolicy } from "@/utilities/conflict-policy";
import { validateStacks } from "@/utilities/stacks";
import { loadVariableDefinitions } from "@/variables";

const missingConfig = (reason: string) =>
  new Error(`${reason} Run \`spindle init\` to create .github/spindle.json.`);

async function readConfig(path: string) {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw missingConfig("This repository has no .github/spindle.json.");
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw missingConfig(".github/spindle.json is not valid JSON.");
  }

  const config = parsed as { stacks?: unknown; variables?: unknown } | null;
  const stacks = config?.stacks;
  const stored = config?.variables;
  if (
    typeof config !== "object" ||
    config === null ||
    !Array.isArray(stacks) ||
    stacks.length === 0 ||
    !stacks.every((stack) => typeof stack === "string") ||
    typeof stored !== "object" ||
    stored === null ||
    Array.isArray(stored) ||
    !Object.values(stored).every((value) => typeof value === "string")
  ) {
    throw missingConfig(
      '.github/spindle.json is malformed; expected {"stacks": [...], "variables": {...}}. Fix the file or run `spindle init`.',
    );
  }
  validateStacks(stacks as string[]);

  return {
    config: config as Record<string, unknown>,
    stacks: stacks as string[],
    variables: stored as Record<string, string>,
  };
}

async function resolveVariables(
  config: { stacks: string[]; variables: Record<string, string> },
  interactive: boolean,
) {
  const variables: Record<string, string> = {};
  const prompted: Record<string, string> = {};
  for (const definition of loadVariableDefinitions()) {
    let value = config.variables[definition.name] ?? definition.default;
    if (value === undefined && interactive) {
      value = await promptVariable(definition);
      prompted[definition.name] = value;
    }
    if (value === undefined) {
      throw new Error(
        `Variable '${definition.name}' (${definition.description}) has no value in .github/spindle.json and no default; add it under "variables".`,
      );
    }
    variables[definition.name] = value;
  }
  return { context: { stacks: config.stacks, variables }, prompted };
}

export class UpdateCommand extends Command {
  private handlers: readonly BlueprintHandler[] = [];
  private reconciliationService!: BlueprintReconciliationService;

  public static register(program: CommanderCommand, createApp: () => Promise<Application>): void {
    program
      .command("update")
      .description(
        `Re-render installed Blueprints (Skills, Agents, and Instructions) whose shipped version is newer.
Reads stacks and variables from .github/spindle.json (edit it by hand to change them)
and normally leaves it unchanged. New shipped Blueprints are offered interactively; use
--include-new to install all of them without a prompt.`,
      )
      .addOption(conflictPolicyOption("Policy for outdated Blueprints"))
      .addOption(
        noInteractiveOption("Never prompt; outdated Blueprints without --on-conflict are an error"),
      )
      .option("--include-new", "Install every newly shipped Blueprint without prompting")
      .addHelpText(
        "after",
        `
Requires .github/spindle.json; run \`spindle init\` first.
Installed Blueprints with a missing or non-semver version are skipped with a warning.
`,
      )
      .allowExcessArguments(false)
      .action(
        async (options: { onConflict?: string; interactive: boolean; includeNew?: boolean }) => {
          const interactive =
            options.interactive && Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY);
          const policy = parseConflictPolicy(options.onConflict);
          await (
            await (await createApp()).make(UpdateCommand)
          ).run(interactive, policy, options.includeNew);
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
    interactive: boolean,
    policy: ConflictPolicy | undefined,
    includeNew = false,
  ): Promise<void> {
    const githubDirectory = join(this.app.workspaceRoot, ".github");
    const configPath = join(githubDirectory, "spindle.json");
    const config = await readConfig(configPath);
    let prompted: Record<string, string> = {};

    const outcomes = await this.reconciliationService.reconcile(this.handlers, {
      mode: "update",
      config: { stacks: config.stacks, variables: config.variables },
      includeNew,
      chooseNew: interactive && !includeNew ? promptNewBlueprints : undefined,
      conflictPolicy: policy,
      chooseConflict:
        interactive && policy === undefined
          ? async (kind, name, installed, available) =>
              promptOutdated(kind, name, installed!, available!)
          : undefined,
      resolveContext: async () => {
        const resolved = await resolveVariables(config, interactive);
        prompted = resolved.prompted;
        return resolved.context;
      },
      prepareConfigWrite: () =>
        Object.keys(prompted).length === 0
          ? undefined
          : {
              path: configPath,
              content: `${JSON.stringify(
                {
                  ...config.config,
                  variables: { ...config.variables, ...prompted },
                },
                null,
                2,
              )}\n`,
            },
    });
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
