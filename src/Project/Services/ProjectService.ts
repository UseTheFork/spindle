import { randomUUID } from "node:crypto";
import {
  chmodSync,
  constants,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { templateCatalog } from "@/Assets/Templates/Catalog";
import { loadProjectConfiguration } from "@/Config/ProjectConfiguration";
import { Service } from "@/Foundation/Service";
import { ToolingService } from "@/Tooling/Services/ToolingService";

const assets = fileURLToPath(new URL("../../Assets/Templates/", import.meta.url));
const configPath = ".github/spindle.json";
const copilotInstructionsPath = ".github/copilot-instructions.md";

export interface ProjectInitializationResult {
  workspace: string;
  created: string[];
  preserved: string[];
  updated: string[];
}

export class ProjectService extends Service {
  public async initialize(): Promise<ProjectInitializationResult> {
    const workspace = realpathSync(this.app.workspaceRoot);
    const absolute = (path: string) => join(workspace, path);
    const configFile = absolute(configPath);
    this.assertRegularFileOrMissing(configFile, configPath);

    const state = await loadProjectConfiguration(configFile);
    if (state.status === "invalid") throw new Error(state.reason, { cause: state.error });
    if (state.status === "absent" || state.data.stacks.length === 0) {
      throw new Error(
        "Install at least one Blueprint stack with `spindle init` before initializing project guidance.",
      );
    }
    const configuration = state.data;

    const created: string[] = [];
    const preserved: string[] = [];
    const updated: string[] = [];

    for (const directory of ["docs", "docs/adr", ".scratch", "docs/agents", ".github"]) {
      const wasCreated = this.ensureDirectory(workspace, directory);
      (wasCreated ? created : preserved).push(directory);
    }

    for (const { source, destination } of templateCatalog.project) {
      const target = absolute(destination);
      this.assertRegularFileOrMissing(target, destination);
      if (destination === copilotInstructionsPath) {
        const status = this.initializeCopilotInstructions(absoluteAsset(source), target);
        if (status === "created") created.push(destination);
        else if (status === "updated") updated.push(destination);
        else preserved.push(destination);
        continue;
      }
      if (existsSync(target)) {
        preserved.push(destination);
      } else {
        copyFileSync(absoluteAsset(source), target, constants.COPYFILE_EXCL);
        created.push(destination);
      }
    }

    const tooling = await (await this.app.make(ToolingService)).initialize(configuration);
    created.push(...tooling.created);
    updated.push(...tooling.updated);

    return { workspace, created, preserved, updated };
  }

  private initializeCopilotInstructions(
    source: string,
    destination: string,
  ): "created" | "updated" | "preserved" {
    const existingStat = lstatSync(destination, { throwIfNoEntry: false });
    if (!existingStat) {
      copyFileSync(source, destination, constants.COPYFILE_EXCL);
      return "created";
    }
    if (!existingStat.isFile()) {
      throw new Error(
        `${copilotInstructionsPath} must be a regular file, not a directory or symlink.`,
      );
    }

    const existing = readFileSync(destination, "utf8");
    const template = readFileSync(source, "utf8");
    if (existing.includes(template)) return "preserved";

    const temporary = this.writeTemporary(destination, `${template}\n${existing}`);
    try {
      chmodSync(temporary, existingStat.mode & 0o777);
      renameSync(temporary, destination);
    } finally {
      this.removeTemporary(temporary);
    }
    return "updated";
  }

  private writeTemporary(path: string, content: string): string {
    const temporary = `${path}.${randomUUID()}.tmp`;
    writeFileSync(temporary, content, { flag: "wx" });
    return temporary;
  }

  private removeTemporary(path: string): void {
    try {
      unlinkSync(path);
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }

  private ensureDirectory(workspace: string, path: string): boolean {
    let current = workspace;
    let created = false;
    for (const segment of path.split("/")) {
      current = join(current, segment);
      const entry = lstatSync(current, { throwIfNoEntry: false });
      if (entry) {
        if (!entry.isDirectory()) {
          throw new Error(`${relative(workspace, current)} must be a real directory.`);
        }
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
}

function absoluteAsset(path: string): string {
  return join(assets, path);
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
