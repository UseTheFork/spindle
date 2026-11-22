import { randomUUID } from "node:crypto";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";

import { Service } from "@spindle/Foundation/Service";
import {
  ProjectSettingsService,
  type ProjectSettingsData,
} from "@spindle/Settings/Services/ProjectSettingsService";
import { computedVariableProviders } from "@spindle/TemplateRendering/Computed/ComputedVariableProviders";
import { ResolveRenderContext } from "@spindle/TemplateRendering/Computed/ResolveRenderContext";
import { RenderText } from "@spindle/TemplateRendering/Rendering/RenderText";
import { PreparedVsCodeIntegration } from "@spindle/VsCodeIntegration/Models/PreparedVsCodeIntegration";
import { VsCodeWorkspaceSettings } from "@spindle/VsCodeIntegration/Settings/VsCodeWorkspaceSettings";

export { PreparedVsCodeIntegration } from "@spindle/VsCodeIntegration/Models/PreparedVsCodeIntegration";

export interface VsCodeIntegrationResult {
  readonly created: string[];
  readonly updated: string[];
  readonly preserved: string[];
}

export class VsCodeIntegrationService extends Service {
  public async prepare(settings: ProjectSettingsData): Promise<PreparedVsCodeIntegration> {
    this.assertApplicationBooted();
    const state = ProjectSettingsService.parse(JSON.stringify(settings));
    if (state.status !== "valid") {
      throw new Error(state.status === "invalid" ? state.reason : "Invalid Project Settings.");
    }
    if (!state.data.vscode.enabled)
      return new PreparedVsCodeIntegration(this.app.workspacePath(), []);

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
    return new PreparedVsCodeIntegration(workspace, [
      { destination: settingsDestination, original: originalSettings, content },
      {
        destination: guidanceDestination,
        original: originalGuidance,
        content: guidance,
      },
    ]);
  }

  public async apply(prepared: PreparedVsCodeIntegration): Promise<VsCodeIntegrationResult> {
    this.assertApplicationBooted();
    const created: string[] = [];
    const updated: string[] = [];
    const preserved: string[] = [];
    try {
      for (const file of prepared.files) this.assertUnchanged(prepared.workspace, file);
      for (const file of prepared.files) {
        this.ensureDirectory(prepared.workspace, dirname(file.destination), created);
        this.assertUnchanged(prepared.workspace, file);
        if (file.original === file.content) {
          preserved.push(file.destination);
          continue;
        }
        const target = join(prepared.workspace, file.destination);
        const stat = lstatSync(target, { throwIfNoEntry: false });
        const temporary = `${target}.${randomUUID()}.tmp`;
        try {
          writeFileSync(temporary, file.content, { flag: "wx" });
          if (stat) chmodSync(temporary, stat.mode & 0o777);
          renameSync(temporary, target);
        } finally {
          this.removeTemporary(temporary);
        }
        (stat ? updated : created).push(file.destination);
      }
    } catch (error) {
      const completed = [...created, ...updated];
      throw new Error(
        `Failed to apply VS Code integration: ${error instanceof Error ? error.message : String(error)}.${completed.length ? ` Completed changes: ${completed.join(", ")}.` : ""} Application stopped; rollback was not attempted.`,
        { cause: error },
      );
    }
    return { created, updated, preserved };
  }

  private removeTemporary(path: string): void {
    try {
      unlinkSync(path);
    } catch (error) {
      if (
        typeof error !== "object" ||
        error === null ||
        !("code" in error) ||
        error.code !== "ENOENT"
      ) {
        throw error;
      }
    }
  }

  private assertUnchanged(
    workspace: string,
    file: PreparedVsCodeIntegration["files"][number],
  ): void {
    if (this.readOriginal(workspace, file.destination) !== file.original) {
      throw new Error(
        `'${file.destination}' changed while preparing VS Code integration; run again`,
      );
    }
  }

  private ensureDirectory(workspace: string, path: string, created: string[]): void {
    let current = workspace;
    for (const segment of path.split("/")) {
      current = join(current, segment);
      const entry = lstatSync(current, { throwIfNoEntry: false });
      if (entry) {
        if (!entry.isDirectory())
          throw new Error(`'${relative(workspace, current)}' must be a real directory`);
      } else {
        mkdirSync(current);
        created.push(relative(workspace, current));
      }
    }
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
