#!/usr/bin/env node
import { join } from "node:path";
import { parseArgs } from "node:util";

import chalk from "chalk";

import { reconcileBlueprints } from "./blueprints/lifecycle.js";
import { blueprintHandlers } from "./blueprints/registry.js";
import {
  exists,
  parseConflictPolicy,
  supportedStacks,
  validateStacks,
  type ConflictPolicy,
} from "./install.js";
import { promptConflict, promptStacks, promptVariable } from "./prompts.js";
import { setupProject } from "./setup-project/setup.js";
import { resolveWorkspace } from "./subagent-driven-dev/workspace.js";
import { update } from "./update.js";
import { loadVariableDefinitions, parseVariableFlags } from "./variables.js";

async function init(
  stacks: string[],
  variables: Record<string, string>,
  interactive: boolean,
  policy: ConflictPolicy | undefined,
) {
  const githubDirectory = join(process.cwd(), ".github");
  const config = { stacks, variables };
  const outcomes = await reconcileBlueprints(blueprintHandlers, {
    mode: "init",
    githubDirectory,
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

const helpText = `${chalk.bold("Usage:")} spindle init [options]

Install spindle Blueprints (Skills, Agents, and Instructions) into .github and save .github/spindle.json.

${chalk.bold("Options:")}
  --stack <id>          Stack to install; repeat for several (${supportedStacks.join(", ")})
  --var <name>=<value>  Set a variable; repeat for several. Unset variables use their default
  --on-conflict <overwrite|skip>
                        Policy for Blueprints that already exist; required when
                        non-interactive and any exist (interactive runs prompt per Blueprint)
  --no-interactive      Never prompt; missing required input is an error
  --help                Show this help

Fails if .github/spindle.json already exists; use \`spindle update\` instead.
Prompts are also disabled when stdin or stdout is not a terminal.
Other commands: update (see \`spindle update --help\`), sdd (see \`spindle sdd --help\`), setup-project (see \`spindle setup-project --help\`).
`;

const updateHelpText = `${chalk.bold("Usage:")} spindle update [options]

Re-render installed Blueprints (Skills, Agents, and Instructions) whose shipped version is newer.
Reads stacks and variables from .github/spindle.json (edit it by hand to change them)
and normally leaves it unchanged. New shipped Blueprints are offered interactively; use
--include-new to install all of them without a prompt.

${chalk.bold("Options:")}
  --on-conflict <overwrite|skip>
                        Policy for outdated Blueprints; required when non-interactive and any
                        are outdated (interactive runs prompt per Blueprint)
  --include-new         Install every newly shipped Blueprint without prompting
  --no-interactive      Never prompt; outdated Blueprints without --on-conflict are an error
  --help                Show this help

Requires .github/spindle.json; run \`spindle init\` first.
Installed Blueprints with a missing or non-semver version are skipped with a warning.
`;

const sddHelpText = `${chalk.bold("Usage:")} spindle sdd <command>

Subagent-driven development workflow commands.

${chalk.bold("Commands:")}
  workspace             Resolve durable report destinations

Run \`spindle sdd workspace --help\` for workspace options.
`;

const sddWorkspaceHelpText = `${chalk.bold("Usage:")} spindle sdd workspace --workspace CHECKOUT_ROOT --reports-dir .scratch/FEATURE/reports --ticket NN [--round R]

Resolve durable report destinations in an existing Git checkout. This command does not create files or modify the checkout.

${chalk.bold("Options:")}
  --workspace <path>       Absolute Git checkout root
  --reports-dir <path>     Report directory inside .scratch
  --ticket <id>            Positive ticket identifier, for example 03
  --round <number>         Optional positive review round
  --help                   Show this help
`;

const setupProjectHelpText = `${chalk.bold("Usage:")} spindle setup-project --workspace ABSOLUTE_PROJECT_ROOT

Create the project documentation directories and missing Spindle defaults without overwriting existing files.

${chalk.bold("Options:")}
  --workspace <path>  Existing absolute project directory (Git and Spindle initialization are not required)
  --help              Show this help
`;

function runSdd(args: string[]) {
  if (args.length === 0 || (args.length === 1 && args[0] === "--help")) {
    console.log(sddHelpText);
    return;
  }
  if (args[0] !== "workspace") {
    throw new Error("Usage: spindle sdd workspace [options]. See `spindle sdd --help`.");
  }

  const optionNames = new Set(["--workspace", "--reports-dir", "--ticket", "--round", "--help"]);
  const seenOptions = new Set<string>();
  for (const argument of args.slice(1)) {
    const option = argument.split("=", 1)[0];
    if (!optionNames.has(option)) continue;
    if (seenOptions.has(option)) {
      throw new Error(`Option '${option}' may only be provided once.`);
    }
    seenOptions.add(option);
  }

  const { values, positionals } = parseArgs({
    args: args.slice(1),
    options: {
      workspace: { type: "string" },
      "reports-dir": { type: "string" },
      ticket: { type: "string" },
      round: { type: "string" },
      help: { type: "boolean" },
    },
    allowPositionals: true,
    strict: true,
  });

  if (values.help) {
    if (positionals.length || args.length !== 2) {
      throw new Error("`--help` must be used alone for `spindle sdd workspace`.");
    }
    console.log(sddWorkspaceHelpText);
    return;
  }
  if (positionals.length) {
    throw new Error("`spindle sdd workspace` does not accept positional arguments.");
  }
  if (!values.workspace || !values["reports-dir"] || !values.ticket) {
    throw new Error(
      "Usage: spindle sdd workspace --workspace CHECKOUT_ROOT --reports-dir .scratch/FEATURE/reports --ticket NN [--round R].",
    );
  }

  const resolution = resolveWorkspace({
    workspacePath: values.workspace,
    reportsDirectory: values["reports-dir"],
    ticket: values.ticket,
    round: values.round,
  });
  console.log(JSON.stringify(resolution, null, 2));
}

function runSetupProject(args: string[]) {
  if (args.length === 1 && args[0] === "--help") {
    console.log(setupProjectHelpText);
    return;
  }

  const optionNames = new Set(["--workspace", "--help"]);
  const seenOptions = new Set<string>();
  for (const argument of args) {
    const option = argument.split("=", 1)[0];
    if (!optionNames.has(option)) continue;
    if (seenOptions.has(option)) {
      throw new Error(`Option '${option}' may only be provided once.`);
    }
    seenOptions.add(option);
  }

  const { values, positionals } = parseArgs({
    args,
    options: {
      workspace: { type: "string" },
      help: { type: "boolean" },
    },
    allowPositionals: true,
    strict: true,
  });

  if (values.help) {
    if (args.length !== 1 || positionals.length) {
      throw new Error("`--help` must be used alone for `spindle setup-project`.");
    }
    console.log(setupProjectHelpText);
    return;
  }
  if (positionals.length) {
    throw new Error("`spindle setup-project` does not accept positional arguments.");
  }
  if (!values.workspace) {
    throw new Error("Usage: spindle setup-project --workspace ABSOLUTE_PROJECT_ROOT.");
  }

  console.log(JSON.stringify(setupProject({ workspacePath: values.workspace }), null, 2));
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "sdd") {
    runSdd(args.slice(1));
    return;
  }
  if (args[0] === "setup-project") {
    runSetupProject(args.slice(1));
    return;
  }

  const { positionals, values } = parseArgs({
    args,
    options: {
      stack: { type: "string", multiple: true },
      var: { type: "string", multiple: true },
      "no-interactive": { type: "boolean" },
      "on-conflict": { type: "string" },
      "include-new": { type: "boolean" },
      help: { type: "boolean" },
    },
    allowPositionals: true,
    strict: true,
  });

  if (values.help) {
    console.log(positionals[0] === "update" ? updateHelpText : helpText);
    return;
  }

  const command = positionals[0];
  if ((command !== "init" && command !== "update") || positionals.length !== 1) {
    throw new Error(
      "Usage: spindle init [--stack <id>] [--var <name>=<value>] [--on-conflict <overwrite|skip>] [--no-interactive] | spindle update [--on-conflict <overwrite|skip>] [--no-interactive]. See --help.",
    );
  }

  const policy = parseConflictPolicy(values["on-conflict"]);
  const interactive =
    !values["no-interactive"] && Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY);

  if (command === "update") {
    if (values.stack || values.var) {
      throw new Error(
        "`spindle update` does not accept --stack or --var; edit .github/spindle.json.",
      );
    }
    await update(interactive, policy, values["include-new"]);
    return;
  }

  if (values["include-new"]) {
    throw new Error("`spindle init` does not accept --include-new; use `spindle update`.");
  }

  const githubDirectory = join(process.cwd(), ".github");
  if (await exists(join(githubDirectory, "spindle.json"))) {
    throw new Error(
      "This repository already has .github/spindle.json; run `spindle update` instead of `init`.",
    );
  }

  const definitions = loadVariableDefinitions();
  const supplied = parseVariableFlags(values.var ?? [], definitions);

  let stacks = [...new Set(values.stack ?? [])];
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

  await init(stacks, variables, interactive, policy);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`${chalk.red.bold("spindle:")} ${message}`);
  process.exitCode = 1;
});
