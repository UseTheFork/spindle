import { join } from "node:path";

import chalk from "chalk";

import { App, Service } from "../../app.js";
import { blueprintHandlers } from "../../blueprints/registry.js";
import type { BlueprintHandler } from "../../blueprints/types.js";
import { InstallationService } from "../../installation/installation-service.js";
import type { ConflictPolicy } from "../../installation/types.js";
import { promptConflict, promptStacks, promptVariable } from "../../prompts.js";
import { exists } from "../../utilities/blueprint-files.js";
import { supportedStacks, validateStacks } from "../../utilities/stacks.js";
import { loadVariableDefinitions, parseVariableFlags } from "../../variables.js";

export class InitCommand extends Service {
  #handlers: readonly BlueprintHandler[] = [];
  #installationService!: InstallationService;

  constructor(app: App) {
    super(app);
  }

  override async boot(): Promise<void> {
    this.#handlers = blueprintHandlers;
    this.#installationService = await this.app.get(InstallationService);
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
    const outcomes = await this.#installationService.reconcile(this.#handlers, {
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
