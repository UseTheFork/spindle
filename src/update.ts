import { readFile } from "node:fs/promises";
import { join } from "node:path";

import chalk from "chalk";

import {
  assertSafeInstallPaths,
  listSkillStubs,
  stubsRoot,
  validateStacks,
  type ConflictPolicy,
} from "./install.js";
import { promptOutdated } from "./prompts.js";
import { reconcileSkills } from "./reconcile.js";
import { loadVariableDefinitions } from "./variables.js";

const missingConfig = (reason: string) =>
  new Error(`${reason} Run \`spindle init\` to create .github/spindle.json.`);

async function readConfig(path: string, definitionsRoot: string) {
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

  // Resolved on every run so hand-edits and newly added manifest variables are honoured.
  const variables: Record<string, string> = {};
  for (const definition of await loadVariableDefinitions(definitionsRoot)) {
    const value = (stored as Record<string, string>)[definition.name] ?? definition.default;
    if (value === undefined) {
      throw new Error(
        `Variable '${definition.name}' (${definition.description}) has no value in .github/spindle.json and no default; add it under "variables".`,
      );
    }
    variables[definition.name] = value;
  }
  return { stacks: stacks as string[], variables };
}

export async function update(interactive: boolean, policy: ConflictPolicy | undefined) {
  const githubDirectory = join(process.cwd(), ".github");
  await assertSafeInstallPaths(githubDirectory, await listSkillStubs());
  const context = await readConfig(join(githubDirectory, "spindle.json"), stubsRoot());

  const outcomes = await reconcileSkills({
    mode: "update",
    githubDirectory,
    stubRoot: stubsRoot(),
    context,
    conflictPolicy: policy,
    chooseConflict:
      interactive && policy === undefined
        ? async (name, installed, available) => promptOutdated(name, installed!, available!)
        : undefined,
  });
  for (const outcome of outcomes) {
    if (outcome.warning) {
      console.error(chalk.yellow(outcome.warning));
    }
  }
  const updated = outcomes.filter((outcome) => outcome.status === "updated").length;
  const skipped = outcomes.filter((outcome) => outcome.status === "skipped").length;
  const upToDate = outcomes.filter((outcome) => outcome.status === "up-to-date").length;

  console.log(
    `${chalk.green("✔")} Updated ${updated}, skipped ${skipped}, up to date ${upToDate} skill(s)`,
  );
}
