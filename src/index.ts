#!/usr/bin/env node
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import chalk from "chalk";

import { dispatch } from "@/cli";
import { Application } from "@/Foundation/Application";
import { ProductionServiceProvider } from "@/services/ProductionServiceProvider";

export async function runExecutable(args: string[], startingDirectory: string): Promise<void> {
  await dispatch(
    args,
    (_invocation, providers) => Application.configure(startingDirectory, providers).create(),
    process.argv[1] ?? "spindle",
    [ProductionServiceProvider],
  );
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
