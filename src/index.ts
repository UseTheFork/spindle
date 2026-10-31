#!/usr/bin/env node
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { parseArgs } from "node:util";

import chalk from "chalk";

import {
  exists,
  parseConflictPolicy,
  stubsRoot,
  supportedStacks,
  validateStacks,
  type ConflictPolicy,
} from "./install.js";
import { promptConflict, promptStacks, promptVariable } from "./prompts.js";
import { reconcileSkills } from "./reconcile.js";
import { update } from "./update.js";
import { loadVariableDefinitions, parseVariableFlags } from "./variables.js";

const justInstallUrl = "https://just.systems/man/en/installation.html";

async function isExecutable(path: string) {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function requireJust() {
  const extensions =
    process.platform === "win32"
      ? ["", ...(process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)]
      : [""];
  const searchPath = process.env.PATH ?? process.env.Path ?? "";

  for (const directory of searchPath.split(delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      if (await isExecutable(join(directory, `just${extension}`))) {
        return;
      }
    }
  }

  throw new Error(
    `\`just\` is not installed or not on PATH. spindle requires it; install it from ${justInstallUrl}`,
  );
}

async function init(
  stacks: string[],
  variables: Record<string, string>,
  interactive: boolean,
  policy: ConflictPolicy | undefined,
) {
  const githubDirectory = join(process.cwd(), ".github");
  const outcomes = await reconcileSkills({
    mode: "init",
    githubDirectory,
    stubRoot: stubsRoot(),
    context: { stacks, variables },
    config: { stacks, variables },
    conflictPolicy: policy,
    chooseConflict: interactive ? async (name) => promptConflict(name) : undefined,
  });
  const installed = outcomes.filter((outcome) => outcome.status === "installed").length;
  const skipped = outcomes.filter((outcome) => outcome.status === "skipped").length;

  console.log(
    `${chalk.green("✔")} Installed ${installed} skill(s) for ${chalk.cyan(stacks.join(", "))}${skipped > 0 ? `. Skipped ${skipped} existing skill(s)` : ""}`,
  );
}

const helpText = `${chalk.bold("Usage:")} spindle init [options]

Install the spindle skills into .github/skills and save .github/spindle.json.

${chalk.bold("Options:")}
  --stack <id>          Stack to install; repeat for several (${supportedStacks.join(", ")})
  --var <name>=<value>  Set a variable; repeat for several. Unset variables use their default
  --on-conflict <overwrite|skip>
                        Policy for skill directories that already exist; required when
                        non-interactive and any exist (interactive runs prompt per skill)
  --no-interactive      Never prompt; missing required input is an error
  --help                Show this help

Fails if .github/spindle.json already exists; use \`spindle update\` instead.
Prompts are also disabled when stdin or stdout is not a terminal.
Other commands: update (see \`spindle update --help\`).
`;

const updateHelpText = `${chalk.bold("Usage:")} spindle update [options]

Re-render installed skills whose shipped version is newer than the installed one.
Reads stacks and variables from .github/spindle.json (edit it by hand to change them)
and normally leaves it unchanged. New shipped Skills are offered interactively; use
--include-new to install all of them without a prompt.

${chalk.bold("Options:")}
  --on-conflict <overwrite|skip>
                        Policy for outdated skills; required when non-interactive and any
                        are outdated (interactive runs prompt per skill)
  --include-new        Install every newly shipped Skill without prompting
  --no-interactive      Never prompt; outdated skills without --on-conflict are an error
  --help                Show this help

Requires .github/spindle.json; run \`spindle init\` first.
Installed skills with a missing or non-semver version are skipped with a warning.
`;

async function main() {
  await requireJust();

  const { positionals, values } = parseArgs({
    args: process.argv.slice(2),
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

  const definitions = await loadVariableDefinitions(stubsRoot());
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
