import { join } from "node:path";

import chalk from "chalk";
import type { Command as CommanderCommand } from "commander";

import { BlueprintCommandOptions } from "@/BlueprintManagement/Commands/BlueprintCommandOptions";
import { parseConflictPolicy } from "@/BlueprintManagement/Commands/ConflictPolicy";
import {
  promptConflict,
  promptStacks,
  promptVariable,
} from "@/BlueprintManagement/Commands/Prompts";
import { blueprintHandlers } from "@/BlueprintManagement/Handlers/BlueprintHandlers";
import {
  loadVariableDefinitions,
  parseVariableFlags,
} from "@/BlueprintManagement/Rendering/Variables";
import { BlueprintReconciliationService } from "@/BlueprintManagement/Services/BlueprintReconciliationService";
import type { BlueprintHandler } from "@/BlueprintManagement/Types/Blueprint";
import type { ConflictPolicy } from "@/BlueprintManagement/Types/Installation";
import { Command } from "@/Commands/Command";
import { loadProjectConfiguration } from "@/Config/ProjectConfiguration";
import type { Application } from "@/Foundation/Application";
import { ProjectService } from "@/Project/Services/ProjectService";
import { Stacks } from "@/Support/Stacks";

export class InitCommand extends Command {
  private handlers: readonly BlueprintHandler[] = [];
  private reconciliationService!: BlueprintReconciliationService;

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
        "--var <name>=<value>",
        "Set a variable; repeat for several. Unset variables use their default",
        (value: string, previous: string[] = []) => [...previous, value],
        [],
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
          var: string[];
          onConflict?: string;
          interactive: boolean;
        }) => {
          const interactive =
            options.interactive && Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY);
          const policy = parseConflictPolicy(options.onConflict);
          Stacks.validate(options.stack);
          const definitions = loadVariableDefinitions();
          const supplied = parseVariableFlags(options.var, definitions);
          if (!interactive && options.stack.length === 0) {
            throw new Error(
              `Provide at least one --stack flag <${Stacks.supported.join("|")}> (or run interactively).`,
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
            await (await createApp()).make(InitCommand)
          ).run(options.stack, options.var, interactive, policy);
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
    variableArguments: string[],
    interactive: boolean,
    policy: ConflictPolicy | undefined,
  ): Promise<void> {
    const githubDirectory = join(this.app.workspaceRoot, ".github");
    const configPath = join(githubDirectory, "spindle.json");
    const existing = await loadProjectConfiguration(configPath);
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

    const definitions = loadVariableDefinitions();
    const supplied = parseVariableFlags(variableArguments, definitions);

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

    const config = {
      ...(existing.status === "valid" ? existing.data : {}),
      stacks,
      variables,
    };
    const outcomes = await this.reconciliationService.reconcile(this.handlers, {
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
    await (await this.app.make(ProjectService)).initialize();
    console.log(`${chalk.green("✔")} Initialized project guidance and tooling documentation.`);
  }
}
