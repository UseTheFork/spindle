import { BlueprintManagementServiceProvider } from "@spindle/BlueprintManagement/BlueprintManagementServiceProvider";
import { Cli } from "@spindle/Cli";
import { Application } from "@spindle/Foundation/Application";
import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import { ProjectServiceProvider } from "@spindle/Project/ProjectServiceProvider";
import { SettingsServiceProvider } from "@spindle/Settings/SettingsServiceProvider";
import { SubagentDrivenDevelopmentServiceProvider } from "@spindle/SubagentDrivenDevelopment/SubagentDrivenDevelopmentServiceProvider";
import { TemplateRenderingServiceProvider } from "@spindle/TemplateRendering/TemplateRenderingServiceProvider";
import { ToolingServiceProvider } from "@spindle/Tooling/ToolingServiceProvider";

export class SpindleExecutable {
  public static async run(
    args: string[],
    startingDirectory: string,
    output = new ConsoleOutputService(),
  ): Promise<void> {
    await Cli.dispatch(
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
}
