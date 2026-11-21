import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import { Service } from "@spindle/Foundation/Service";
import {
  ProjectSettingsService,
  type ProjectSettingsData,
} from "@spindle/Settings/Services/ProjectSettingsService";
import { computedVariableProviders } from "@spindle/TemplateRendering/Computed/ComputedVariableProviders";
import { ResolveRenderContext } from "@spindle/TemplateRendering/Computed/ResolveRenderContext";
import { RenderText } from "@spindle/TemplateRendering/Rendering/RenderText";
import { VsCodeWorkspaceSettings } from "@spindle/VsCodeIntegration/Settings/VsCodeWorkspaceSettings";

export interface PreparedVsCodeIntegration {
  readonly workspace: string;
  readonly files: readonly {
    readonly destination: string;
    readonly original: string | undefined;
    readonly content: string;
  }[];
}

export class VsCodeIntegrationService extends Service {
  public async prepare(settings: ProjectSettingsData): Promise<PreparedVsCodeIntegration> {
    this.assertApplicationBooted();
    const state = ProjectSettingsService.parse(JSON.stringify(settings));
    if (state.status !== "valid") {
      throw new Error(state.status === "invalid" ? state.reason : "Invalid Project Settings.");
    }
    if (!state.data.vscode.enabled) return { workspace: this.app.workspacePath(), files: [] };

    const workspace = realpathSync(this.app.workspacePath());
    const settingsDestination = ".vscode/settings.json";
    const guidanceDestination = ".github/copilot/commit-message-style.md";
    const originalSettings = this.readOriginal(workspace, settingsDestination);
    const originalGuidance = this.readOriginal(workspace, guidanceDestination);
    const settingsAsset = this.app.assetsPath("VsCodeIntegration/settings.json");
    const managed = VsCodeWorkspaceSettings.parse(
      readFileSync(settingsAsset, "utf8"),
      settingsAsset,
    );
    const content = VsCodeWorkspaceSettings.merge(originalSettings, managed, settingsDestination);
    const guidanceAsset = this.app.assetsPath("VsCodeIntegration/commit-message-style.md");
    const source = readFileSync(guidanceAsset, "utf8");
    const guidance = await ProjectSettingsService.withTemporaryState(this.app, state, async () => {
      try {
        const context = ResolveRenderContext.resolve(
          this.app,
          { stacks: state.data.stacks, variables: {} },
          { commit_guidance: computedVariableProviders.commit_guidance },
        );
        return RenderText.render(source, context);
      } catch (error) {
        throw new Error(
          `Failed to prepare '${guidanceDestination}' from '${guidanceAsset}': ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
    });
    return {
      workspace,
      files: [
        { destination: settingsDestination, original: originalSettings, content },
        {
          destination: guidanceDestination,
          original: originalGuidance,
          content: guidance,
        },
      ],
    };
  }

  private readOriginal(workspace: string, destination: string): string | undefined {
    let directory = workspace;
    for (const segment of dirname(destination).split("/")) {
      directory = join(directory, segment);
      const entry = lstatSync(directory, { throwIfNoEntry: false });
      if (!entry) return undefined;
      if (!entry.isDirectory()) {
        throw new Error(`'${relative(workspace, directory)}' must be a real directory.`);
      }
    }
    const target = join(workspace, destination);
    const entry = lstatSync(target, { throwIfNoEntry: false });
    if (!entry) return undefined;
    if (!entry.isFile()) throw new Error(`'${destination}' must be a regular file.`);
    return readFileSync(target, "utf8");
  }
}
