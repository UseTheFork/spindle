#!/usr/bin/env node
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import chalk from "chalk";

import { BlueprintManagementServiceProvider } from "@/BlueprintManagement/BlueprintManagementServiceProvider";
import { dispatch } from "@/cli";
import { Application } from "@/Foundation/Application";
import { ProjectServiceProvider } from "@/Project/ProjectServiceProvider";
import { SubagentDrivenDevelopmentServiceProvider } from "@/SubagentDrivenDevelopment/SubagentDrivenDevelopmentServiceProvider";

export async function runExecutable(args: string[], startingDirectory: string): Promise<void> {
  await dispatch(
    args,
    (_invocation, providers) => Application.configure(startingDirectory, providers).create(),
    process.argv[1] ?? "spindle",
    [
      BlueprintManagementServiceProvider,
      ProjectServiceProvider,
      SubagentDrivenDevelopmentServiceProvider,
    ],
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
