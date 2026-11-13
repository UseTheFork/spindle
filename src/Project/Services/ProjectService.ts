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
import { join, relative } from "node:path";

import { templateCatalog } from "@/Assets/Templates/Catalog";
import { Service } from "@/Foundation/Service";
import {
  ProjectSettingsService,
  type ProjectSettingsData,
} from "@/Settings/Services/ProjectSettingsService";
import { resolveRenderContext } from "@/TemplateRendering/Computed/ResolveRenderContext";
import { renderText } from "@/TemplateRendering/Rendering/RenderText";
import { ToolingService } from "@/Tooling/Services/ToolingService";

const projectSettingsPath = ".github/spindle.json";
const copilotPath = ".github/copilot-instructions.md";
const startMarker = "<!-- spindle:start -->";
const endMarker = "<!-- spindle:end -->";
const initializationDirectories = ["docs", "docs/adr", ".scratch", "docs/agents", ".github"];
const updateDirectories = ["docs", "docs/agents", ".github"];

export interface ProjectInitializationResult {
  workspace: string;
  created: string[];
  preserved: string[];
  updated: string[];
}

export interface PreparedProjectGuidance {
  workspace: string;
  settings: ProjectSettingsData;
  directories: readonly string[];
  files: {
    destination: string;
    content: string;
    original: string | undefined;
    createOnce: boolean;
  }[];
}

function copilotInstructions(template: string, existing: string | undefined): string {
  const block = `${startMarker}\n${template.trimEnd()}\n${endMarker}`;
  if (existing === undefined) return `${block}\n`;
  const start = existing.indexOf(startMarker);
  const end = existing.indexOf(endMarker);
  if (
    start < 0 ||
    end < start ||
    existing.indexOf(startMarker, start + startMarker.length) !== -1 ||
    existing.indexOf(endMarker, end + endMarker.length) !== -1
  ) {
    return `${block}\n`;
  }
  return existing.slice(0, start) + block + existing.slice(end + endMarker.length);
}

export class ProjectService extends Service {
  public async prepare(
    settings: ProjectSettingsData,
    mode: "init" | "update" = "init",
  ): Promise<PreparedProjectGuidance> {
    this.assertApplicationBooted();
    const state = ProjectSettingsService.parse(JSON.stringify(settings));
    if (state.status !== "valid")
      throw new Error(state.status === "invalid" ? state.reason : "Invalid Project Settings.");
    if (settings.stacks.length === 0) {
      throw new Error(
        "Install at least one Blueprint stack with `spindle init` before initializing project guidance.",
      );
    }
    const workspace = realpathSync(this.app.workspacePath());
    const directories = mode === "init" ? initializationDirectories : updateDirectories;
    for (const directory of directories) this.validateDirectory(workspace, directory);
    this.assertRegularFileOrMissing(join(workspace, projectSettingsPath), projectSettingsPath);
    this.assertRegularFileOrMissing(
      join(workspace, "docs/agents/tooling.md"),
      "docs/agents/tooling.md",
    );
    const context = await ProjectSettingsService.withTemporaryState(
      this.app,
      { status: "valid", data: settings },
      async () => resolveRenderContext(this.app, { stacks: settings.stacks, variables: {} }),
    );
    const files = templateCatalog.project.map(({ source, destination, createOnce }) => {
      const target = join(workspace, destination);
      this.assertRegularFileOrMissing(target, destination);
      const original = lstatSync(target, { throwIfNoEntry: false })
        ? readFileSync(target, "utf8")
        : undefined;
      const rendered = renderText(
        readFileSync(join(this.app.assetsPath("Templates"), source), "utf8"),
        {
          stacks: [...context.stacks],
          variables: { ...context.variables },
          computed: { ...context.computed },
        },
      );
      return {
        destination,
        original,
        createOnce: createOnce ?? false,
        content: destination === copilotPath ? copilotInstructions(rendered, original) : rendered,
      };
    });
    return { workspace, settings, directories, files };
  }

  public async initialize(): Promise<ProjectInitializationResult> {
    this.assertApplicationBooted();
    const { settings } = ProjectSettingsService.requireCurrent(this.app);
    return this.apply(await this.prepare(settings));
  }

  public async apply(prepared: PreparedProjectGuidance): Promise<ProjectInitializationResult> {
    this.assertApplicationBooted();
    const { workspace, files, settings, directories } = prepared;
    const created: string[] = [];
    const preserved: string[] = [];
    const updated: string[] = [];
    try {
      for (const directory of directories) {
        (this.ensureDirectory(workspace, directory) ? created : preserved).push(directory);
      }
      for (const { destination, content, original, createOnce } of files) {
        const target = join(workspace, destination);
        this.assertRegularFileOrMissing(target, destination);
        const stat = lstatSync(target, { throwIfNoEntry: false });
        const current = stat ? readFileSync(target, "utf8") : undefined;
        if (current !== original)
          throw new Error(`'${destination}' changed while preparing project guidance; run again.`);
        if (createOnce && original !== undefined) {
          preserved.push(destination);
          continue;
        }
        if (current === content) {
          preserved.push(destination);
          continue;
        }
        const temporary = `${target}.${randomUUID()}.tmp`;
        try {
          writeFileSync(temporary, content, { flag: "wx" });
          if (stat) chmodSync(temporary, stat.mode & 0o777);
          renameSync(temporary, target);
        } finally {
          this.removeTemporary(temporary);
        }
        (stat ? updated : created).push(destination);
      }
      const tooling = await (await this.app.make(ToolingService)).initialize(settings);
      created.push(...tooling.created);
      updated.push(...tooling.updated);
    } catch (error) {
      const completed = [...created, ...updated];
      throw new Error(
        `Failed to apply project guidance: ${error instanceof Error ? error.message : String(error)}.${completed.length ? ` Completed changes: ${completed.join(", ")}.` : ""} Application stopped; rollback was not attempted.`,
        { cause: error },
      );
    }
    return { workspace, created, preserved, updated };
  }

  private validateDirectory(workspace: string, path: string): void {
    let current = workspace;
    for (const segment of path.split("/")) {
      current = join(current, segment);
      const entry = lstatSync(current, { throwIfNoEntry: false });
      if (!entry) return;
      if (!entry.isDirectory())
        throw new Error(`${relative(workspace, current)} must be a real directory.`);
    }
  }

  private ensureDirectory(workspace: string, path: string): boolean {
    let current = workspace;
    let created = false;
    for (const segment of path.split("/")) {
      current = join(current, segment);
      const entry = lstatSync(current, { throwIfNoEntry: false });
      if (entry) {
        if (!entry.isDirectory())
          throw new Error(`${relative(workspace, current)} must be a real directory.`);
      } else {
        mkdirSync(current);
        created = true;
      }
    }
    return created;
  }

  private assertRegularFileOrMissing(path: string, relativePath: string): void {
    const entry = lstatSync(path, { throwIfNoEntry: false });
    if (entry && !entry.isFile()) {
      throw new Error(`${relativePath} must be a regular file, not a directory or symlink.`);
    }
  }

  private isMissing(error: unknown): boolean {
    return (
      typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"
    );
  }

  private removeTemporary(path: string): void {
    try {
      unlinkSync(path);
    } catch (error) {
      if (!this.isMissing(error)) throw error;
    }
  }
}
