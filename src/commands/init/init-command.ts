import { join } from "node:path";

import chalk from "chalk";
import type { Command } from "commander";

import { App, Service } from "../../app.js";
import { blueprintHandlers } from "../../blueprints/registry.js";
import type { BlueprintHandler } from "../../blueprints/types.js";
import type { ConflictPolicy } from "../../installation/types.js";
import { promptConflict, promptStacks, promptVariable } from "../../prompts.js";
import { BlueprintReconciliationService } from "../../reconciliation/blueprint-reconciliation-service.js";
import { exists } from "../../utilities/blueprint-files.js";
import { parseConflictPolicy } from "../../utilities/conflict-policy.js";
import { supportedStacks, validateStacks } from "../../utilities/stacks.js";
import { loadVariableDefinitions, parseVariableFlags } from "../../variables.js";
import { conflictPolicyOption, noInteractiveOption } from "../shared-options.js";

export class InitCommand extends Service {
  #handlers: readonly BlueprintHandler[] = [];
  #reconciliationService!: BlueprintReconciliationService;

  static register(program: Command, createApp: () => App): void {
    program
      .command("init")
      .description(
        "Install spindle Blueprints (Skills, Agents, and Instructions) into .github and save .github/spindle.json.",
      )
      .option(
        "--stack <id>",
        `Stack to install; repeat for several (${supportedStacks.join(", ")})`,
        (value: string, previous: string[] = []) => [...previous, value],
        [],
      )
      .option(
        "--var <name>=<value>",
        "Set a variable; repeat for several. Unset variables use their default",
        (value: string, previous: string[] = []) => [...previous, value],
        [],
      )
      .addOption(
        conflictPolicyOption(
          "Policy for Blueprints that already exist; required when non-interactive and any exist (interactive runs prompt per Blueprint)",
        ),
      )
      .addOption(noInteractiveOption("Never prompt; missing required input is an error"))
      .addHelpText(
        "after",
        `
Fails if .github/spindle.json already exists; use \`spindle update\` instead.
Prompts are also disabled when stdin or stdout is not a terminal.
Other commands: update (see \`spindle update --help\`), sdd (see \`spindle sdd --help\`), setup-project (see \`spindle setup-project --help\`).
Run \`spindle --version\` to print the installed version.
`,
      )
      .allowExcessArguments(false)
      .action(
        async (options: {
          stack: string[];
          var: string[];
          onConflict?: string;
          interactive: boolean;
        }) => {
          const interactive =
            options.interactive && Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY);
          const policy = parseConflictPolicy(options.onConflict);
          validateStacks(options.stack);
          const definitions = loadVariableDefinitions();
          const supplied = parseVariableFlags(options.var, definitions);
          if (!interactive && options.stack.length === 0) {
            throw new Error(
              `Provide at least one --stack flag <${supportedStacks.join("|")}> (or run interactively).`,
            );
          }
          if (!interactive) {
            const missing = definitions.find(
              (definition) => definition.default === undefined && !(definition.name in supplied),
            );
            if (missing) {
              throw new Error(
                `Variable '${missing.name}' (${missing.description}) has no default; provide --var ${missing.name}=<value>.`,
              );
            }
          }
          await (
            await createApp().get(InitCommand)
          ).run(options.stack, options.var, interactive, policy);
        },
      );
  }

  constructor(app: App) {
    super(app);
  }

  override async boot(): Promise<void> {
    this.#handlers = blueprintHandlers;
    this.#reconciliationService = await this.app.get(BlueprintReconciliationService);
  }

  async run(
    stackArguments: string[],
    variableArguments: string[],
    interactive: boolean,
    policy: ConflictPolicy | undefined,
  ): Promise<void> {
    const githubDirectory = join(this.app.workspaceRoot, ".github");
    if (await exists(join(githubDirectory, "spindle.json"))) {
      throw new Error(
        "This repository already has .github/spindle.json; run `spindle update` instead of `init`.",
      );
    }

    const definitions = loadVariableDefinitions();
    const supplied = parseVariableFlags(variableArguments, definitions);

    let stacks = [...new Set(stackArguments)];
    validateStacks(stacks);
    if (stacks.length === 0) {
      if (!interactive) {
        throw new Error(
          `Provide at least one --stack flag <${supportedStacks.join("|")}> (or run interactively).`,
        );
      }
      stacks = await promptStacks(supportedStacks);
    }

    const variables: Record<string, string> = {};
    for (const definition of definitions) {
      if (definition.name in supplied) {
        variables[definition.name] = supplied[definition.name];
      } else if (interactive) {
        variables[definition.name] = await promptVariable(definition);
      } else if (definition.default !== undefined) {
        variables[definition.name] = definition.default;
      } else {
        throw new Error(
          `Variable '${definition.name}' (${definition.description}) has no default; provide --var ${definition.name}=<value>.`,
        );
      }
    }

    const config = { stacks, variables };
    const outcomes = await this.#reconciliationService.reconcile(this.#handlers, {
      mode: "init",
      context: config,
      config,
      conflictPolicy: policy,
      chooseConflict: interactive ? promptConflict : undefined,
    });
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
  }
}
