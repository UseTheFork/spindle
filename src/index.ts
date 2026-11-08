#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import chalk from "chalk";

import { dispatch } from "./cli.js";
import { Application } from "./foundation/Application.js";
import { resolveBlueprintSourceRoot } from "./utilities/blueprint-source-root.js";

export function discoverGitRoot(startingDirectory: string): string {
  let root: string;
  try {
    root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: startingDirectory,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    throw new Error(
      "Unable to discover the Git working-tree root. Ensure Git is available and run Spindle inside a Git working tree.",
    );
  }
  if (!root) {
    throw new Error(
      "Unable to discover the Git working-tree root. Ensure Git is available and run Spindle inside a Git working tree.",
    );
  }
  return root;
}

export async function runExecutable(args: string[], startingDirectory: string): Promise<void> {
  await dispatch(args, () => {
    const workspaceRoot = discoverGitRoot(startingDirectory);
    return new Application({
      workspaceRoot,
      blueprintSourceRoot: resolveBlueprintSourceRoot(workspaceRoot),
    });
  });
}

function isExecutable() {
  const entrypoint = process.argv[1];
  return entrypoint !== undefined && pathToFileURL(resolve(entrypoint)).href === import.meta.url;
}

if (isExecutable()) {
  runExecutable(process.argv.slice(2), process.cwd()).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${chalk.red.bold("spindle:")} ${message}`);
    process.exitCode = 1;
  });
}
