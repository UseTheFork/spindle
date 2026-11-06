import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import chalk from "chalk";

import { App } from "./app.js";
import { InitCommand } from "./commands/init/init-command.js";
import { SddWorkspaceCommand } from "./commands/sdd-workspace/sdd-workspace-command.js";
import { SetupProjectCommand } from "./commands/setup-project/setup-project-command.js";
import { UpdateCommand } from "./commands/update/update-command.js";
import { resolveBlueprintSourceRoot } from "./utilities/blueprint-source-root.js";
import { parseConflictPolicy } from "./utilities/conflict-policy.js";
import { supportedStacks } from "./utilities/stacks.js";

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
Run \`spindle --version\` to print the installed version.
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
  --workspace <path>  Existing absolute target directory (may be outside Git)
  --help              Show this help

Run workspace commands from a Git working tree.
`;

function createApplication(workspaceRoot: string | undefined): App {
  if (workspaceRoot === undefined) {
    throw new Error("Cannot run a workspace command without a discovered Git working-tree root.");
  }
  return new App({
    workspaceRoot,
    blueprintSourceRoot: resolveBlueprintSourceRoot(workspaceRoot),
  });
}

export async function dispatch(args: string[], workspaceRoot: string | undefined) {
  if (args.length === 1 && args[0] === "--version") {
    const packageMetadata = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    ) as { version: string };
    console.log(packageMetadata.version);
    return;
  }
  if (args[0] === "sdd") {
    const sddArgs = args.slice(1);
    if (sddArgs.length === 0 || (sddArgs.length === 1 && sddArgs[0] === "--help")) {
      console.log(sddHelpText);
      return;
    }
    if (sddArgs[0] !== "workspace") {
      throw new Error("Usage: spindle sdd workspace [options]. See `spindle sdd --help`.");
    }

    const commandArgs = sddArgs.slice(1);
    const optionNames = new Set(["--workspace", "--reports-dir", "--ticket", "--round", "--help"]);
    const seenOptions = new Set<string>();
    for (const argument of commandArgs) {
      const option = argument.split("=", 1)[0];
      if (!optionNames.has(option)) continue;
      if (seenOptions.has(option)) {
        throw new Error(`Option '${option}' may only be provided once.`);
      }
      seenOptions.add(option);
    }

    const { values, positionals } = parseArgs({
      args: commandArgs,
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
      if (positionals.length || sddArgs.length !== 2) {
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

    const command = await createApplication(workspaceRoot).get(SddWorkspaceCommand);
    const resolution = command.run({
      workspacePath: values.workspace,
      reportsDirectory: values["reports-dir"],
      ticket: values.ticket,
      round: values.round,
    });
    console.log(JSON.stringify(resolution, null, 2));
    return;
  }
  if (args[0] === "setup-project") {
    const commandArgs = args.slice(1);
    if (commandArgs.length === 1 && commandArgs[0] === "--help") {
      console.log(setupProjectHelpText);
      return;
    }

    const optionNames = new Set(["--workspace", "--help"]);
    const seenOptions = new Set<string>();
    for (const argument of commandArgs) {
      const option = argument.split("=", 1)[0];
      if (!optionNames.has(option)) continue;
      if (seenOptions.has(option)) {
        throw new Error(`Option '${option}' may only be provided once.`);
      }
      seenOptions.add(option);
    }

    const { values, positionals } = parseArgs({
      args: commandArgs,
      options: {
        workspace: { type: "string" },
        help: { type: "boolean" },
      },
      allowPositionals: true,
      strict: true,
    });

    if (values.help) {
      if (commandArgs.length !== 1 || positionals.length) {
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

    const command = await createApplication(workspaceRoot).get(SetupProjectCommand);
    console.log(JSON.stringify(command.run({ workspacePath: values.workspace }), null, 2));
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

  const app = createApplication(workspaceRoot);

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
    await (await app.get(UpdateCommand)).run(interactive, policy, values["include-new"]);
    return;
  }

  if (values["include-new"]) {
    throw new Error("`spindle init` does not accept --include-new; use `spindle update`.");
  }

  await (await app.get(InitCommand)).run(values.stack ?? [], values.var ?? [], interactive, policy);
}
