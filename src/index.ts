#!/usr/bin/env node
import { BlueprintManagementServiceProvider } from "@/BlueprintManagement/BlueprintManagementServiceProvider";
import { dispatch } from "@/cli";
import { Application } from "@/Foundation/Application";
import { ConsoleOutputService } from "@/Foundation/ConsoleOutputService";
import { ProjectServiceProvider } from "@/Project/ProjectServiceProvider";
import { SettingsServiceProvider } from "@/Settings/SettingsServiceProvider";
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
      SettingsServiceProvider,
      ToolingServiceProvider,
      SubagentDrivenDevelopmentServiceProvider,
    ],
    output,
  );
}

if (import.meta.main) {
  const output = new ConsoleOutputService();
  runExecutable(process.argv.slice(2), process.cwd(), output).catch((error: unknown) => {
    output.error(error);
    process.exitCode = 1;
  });
}
