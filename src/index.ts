#!/usr/bin/env node
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { BlueprintManagementServiceProvider } from "@/BlueprintManagement/BlueprintManagementServiceProvider";
import { dispatch } from "@/cli";
import { Application } from "@/Foundation/Application";
import { ConsoleOutputService } from "@/Foundation/ConsoleOutputService";
import { ProjectServiceProvider } from "@/Project/ProjectServiceProvider";
import { SubagentDrivenDevelopmentServiceProvider } from "@/SubagentDrivenDevelopment/SubagentDrivenDevelopmentServiceProvider";
import { TemplateRenderingServiceProvider } from "@/TemplateRendering/TemplateRenderingServiceProvider";
import { ToolingServiceProvider } from "@/Tooling/ToolingServiceProvider";

export async function runExecutable(
  args: string[],
  startingDirectory: string,
  output = new ConsoleOutputService(),
): Promise<void> {
  await dispatch(
    args,
    (_invocation, providers) => Application.configure(startingDirectory, providers).create(),
    process.argv[1] ?? "spindle",
    [
      TemplateRenderingServiceProvider,
      BlueprintManagementServiceProvider,
      ProjectServiceProvider,
      ToolingServiceProvider,
      SubagentDrivenDevelopmentServiceProvider,
    ],
    output,
  );
}

function isExecutable() {
  const entrypoint = process.argv[1];
  return entrypoint !== undefined && pathToFileURL(resolve(entrypoint)).href === import.meta.url;
}

if (isExecutable()) {
  const output = new ConsoleOutputService();
  runExecutable(process.argv.slice(2), process.cwd(), output).catch((error: unknown) => {
    output.error(error);
    process.exitCode = 1;
  });
}
