import { BlueprintManagementServiceProvider } from "@/BlueprintManagement/BlueprintManagementServiceProvider";
import { Cli } from "@/Cli";
import { Application } from "@/Foundation/Application";
import { ConsoleOutputService } from "@/Foundation/ConsoleOutputService";
import { ProjectServiceProvider } from "@/Project/ProjectServiceProvider";
import { SettingsServiceProvider } from "@/Settings/SettingsServiceProvider";
import { SubagentDrivenDevelopmentServiceProvider } from "@/SubagentDrivenDevelopment/SubagentDrivenDevelopmentServiceProvider";
import { TemplateRenderingServiceProvider } from "@/TemplateRendering/TemplateRenderingServiceProvider";
import { ToolingServiceProvider } from "@/Tooling/ToolingServiceProvider";

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
