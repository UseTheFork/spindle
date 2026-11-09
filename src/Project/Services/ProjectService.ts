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
import {
  loadProjectConfiguration,
  type ProjectConfigurationData,
  type ToolingEntry,
} from "@/Config/ProjectConfiguration";
import { Service } from "@/Foundation/Service";

const assets = fileURLToPath(new URL("../../Assets/Templates/", import.meta.url));
const toolingPath = "docs/agents/tooling.md";
const configPath = ".github/spindle.json";
const copilotInstructionsPath = ".github/copilot-instructions.md";
const toolingKeyPattern = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

const defaultTooling: ToolingEntry[] = [
  {
    key: "spindle-init",
    section: "Spindle",
    command: "spindle init",
    description: "Install Spindle Blueprints for selected stacks.",
  },
  {
    key: "spindle-update",
    section: "Spindle",
    command: "spindle update",
    description: "Update installed Spindle Blueprints.",
  },
  {
    key: "spindle-project-init",
    section: "Spindle",
    command: "spindle project init",
    description: "Initialize project guidance and the tooling command registry.",
  },
];

export interface ProjectInitializationResult {
  workspace: string;
  created: string[];
  preserved: string[];
  updated: string[];
}

export interface ToolingEntryInput {
  key: string;
  section: string;
  command: string;
  description?: string;
}

export class ProjectService extends Service {
  public async initialize(): Promise<ProjectInitializationResult> {
    const workspace = realpathSync(this.app.workspaceRoot);
    const absolute = (path: string) => join(workspace, path);
    const configFile = absolute(configPath);
    this.assertRegularFileOrMissing(configFile, configPath);

    const state = await loadProjectConfiguration(configFile);
    if (state.status === "invalid") throw new Error(state.reason, { cause: state.error });

    const existed = state.status === "valid";
    const previous = existed ? state.data : undefined;
    const tooling =
      previous?.tooling === undefined ? structuredClone(defaultTooling) : previous.tooling;
    const config: ProjectConfigurationData = {
      ...(previous ?? {}),
      stacks: previous?.stacks ?? [],
      variables: previous?.variables ?? {},
      tooling,
    };

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

    const documentation = this.renderTooling(tooling);
    const documentFile = absolute(toolingPath);
    this.assertRegularFileOrMissing(documentFile, toolingPath);
    const documentExisted = existsSync(documentFile);
    this.writeConfigurationAndDocumentation(
      configFile,
      `${JSON.stringify(config, null, 2)}\n`,
      documentFile,
      documentation,
      existed ? readFileSync(configFile) : undefined,
    );
    if (existed) updated.push(configPath);
    else created.push(configPath);
    if (documentExisted) updated.push(toolingPath);
    else created.push(toolingPath);

    return { workspace, created, preserved, updated };
  }

  public async listTooling(): Promise<ToolingEntry[]> {
    return [...(await this.readInitializedConfiguration()).tooling!];
  }

  public async addTooling(input: ToolingEntryInput): Promise<ToolingEntry> {
    const entry = this.validateEntry(input);
    const config = await this.readInitializedConfiguration();
    const tooling = config.tooling!;
    if (tooling.some(({ key }) => key === entry.key)) {
      throw new Error(
        `Tooling key '${entry.key}' already exists; use 'spindle project tooling update'.`,
      );
    }
    const updated = [...tooling, entry];
    this.saveTooling(config, updated);
    return entry;
  }

  public async updateTooling(input: {
    key: string;
    section?: string;
    command?: string;
    description?: string;
    clearDescription?: boolean;
  }): Promise<ToolingEntry> {
    this.validateKey(input.key);
    if (
      input.section === undefined &&
      input.command === undefined &&
      input.description === undefined &&
      !input.clearDescription
    ) {
      throw new Error("Provide at least one tooling field to update.");
    }
    if (input.clearDescription && input.description !== undefined) {
      throw new Error("Use either --description or --clear-description, not both.");
    }

    const config = await this.readInitializedConfiguration();
    const tooling = config.tooling!;
    const index = tooling.findIndex(({ key }) => key === input.key);
    if (index < 0) throw new Error(`No tooling command has key '${input.key}'.`);

    const current = tooling[index]!;
    const updatedEntry: ToolingEntry = {
      ...current,
      ...(input.section === undefined
        ? {}
        : { section: this.requiredText(input.section, "section") }),
      ...(input.command === undefined
        ? {}
        : { command: this.requiredText(input.command, "command") }),
    };
    if (input.clearDescription) delete updatedEntry.description;
    else if (input.description !== undefined) {
      updatedEntry.description = this.requiredText(input.description, "description");
    }

    const updated = [...tooling];
    updated[index] = updatedEntry;
    this.saveTooling(config, updated);
    return updatedEntry;
  }

  public async removeTooling(key: string): Promise<{ key: string; removed: true }> {
    this.validateKey(key);
    const config = await this.readInitializedConfiguration();
    const tooling = config.tooling!;
    if (!tooling.some((entry) => entry.key === key)) {
      throw new Error(`No tooling command has key '${key}'.`);
    }
    this.saveTooling(
      config,
      tooling.filter((entry) => entry.key !== key),
    );
    return { key, removed: true };
  }

  private async readInitializedConfiguration(): Promise<ProjectConfigurationData> {
    const path = join(this.app.workspaceRoot, configPath);
    this.assertRegularFileOrMissing(path, configPath);
    const state = await loadProjectConfiguration(path);
    if (state.status === "absent") {
      throw new Error("Project tooling is not initialized. Run `spindle project init` first.");
    }
    if (state.status === "invalid") throw new Error(state.reason, { cause: state.error });
    if (state.data.tooling === undefined) {
      throw new Error("Project tooling is not initialized. Run `spindle project init` first.");
    }
    this.assertToolingDocumentAvailable();
    return state.data;
  }

  private saveTooling(config: ProjectConfigurationData, tooling: ToolingEntry[]): void {
    const updated = { ...config, tooling };
    const configFile = join(this.app.workspaceRoot, configPath);
    const documentFile = join(this.app.workspaceRoot, toolingPath);
    this.writeConfigurationAndDocumentation(
      configFile,
      `${JSON.stringify(updated, null, 2)}\n`,
      documentFile,
      this.renderTooling(tooling),
      readFileSync(configFile),
    );
  }

  private assertToolingDocumentAvailable(): void {
    const workspace = this.app.workspaceRoot;
    const parent = join(workspace, "docs", "agents");
    try {
      if (!lstatSync(parent).isDirectory()) {
        throw new Error("docs/agents must be a real directory.");
      }
    } catch (error) {
      if (isMissing(error)) {
        throw new Error("Project tooling is not initialized. Run `spindle project init` first.");
      }
      throw error;
    }
    this.assertRegularFileOrMissing(join(parent, "tooling.md"), toolingPath);
  }

  private validateEntry(input: ToolingEntryInput): ToolingEntry {
    this.validateKey(input.key);
    const entry: ToolingEntry = {
      key: input.key,
      section: this.requiredText(input.section, "section"),
      command: this.requiredText(input.command, "command"),
      ...(input.description === undefined
        ? {}
        : { description: this.requiredText(input.description, "description") }),
    };
    return entry;
  }

  private validateKey(key: string): void {
    if (!toolingKeyPattern.test(key)) {
      throw new Error("Tooling key must use lowercase letters, digits, and interior hyphens.");
    }
  }

  private requiredText(value: string, label: string): string {
    const trimmed = value.trim();
    if (!trimmed) throw new Error(`Tooling ${label} must not be empty.`);
    if (/[\r\n]/.test(trimmed)) throw new Error(`Tooling ${label} must be a single line.`);
    return trimmed;
  }

  private renderTooling(entries: ToolingEntry[]): string {
    const sections = new Map<string, ToolingEntry[]>();
    for (const entry of entries) {
      const section = sections.get(entry.section) ?? [];
      section.push(entry);
      sections.set(entry.section, section);
    }
    const lines = ["# Project Tooling"];
    for (const [section, commands] of sections) {
      lines.push("", `## ${section}`);
      for (const entry of commands) {
        const description = entry.description ? `: ${entry.description}` : "";
        lines.push(`- ${inlineCode(entry.command)}${description}`);
      }
    }
    return `${lines.join("\n")}\n`;
  }

  private writeConfigurationAndDocumentation(
    configFile: string,
    configContent: string,
    documentFile: string,
    documentContent: string,
    previousConfig: Buffer | undefined,
  ): void {
    this.assertRegularFileOrMissing(configFile, configPath);
    this.assertRegularFileOrMissing(documentFile, toolingPath);
    let configTemp: string | undefined;
    let documentTemp: string | undefined;
    try {
      configTemp = this.writeTemporary(configFile, configContent);
      documentTemp = this.writeTemporary(documentFile, documentContent);
      renameSync(configTemp, configFile);
      try {
        renameSync(documentTemp, documentFile);
      } catch (error) {
        try {
          this.restoreFile(configFile, previousConfig);
        } catch (rollbackError) {
          throw new AggregateError(
            [error, rollbackError],
            "Could not update the tooling guide and restore the previous project configuration.",
          );
        }
        throw error;
      }
    } finally {
      if (configTemp) this.removeTemporary(configTemp);
      if (documentTemp) this.removeTemporary(documentTemp);
    }
  }

  private writeTemporary(path: string, content: string): string {
    const temporary = `${path}.${randomUUID()}.tmp`;
    writeFileSync(temporary, content, { flag: "wx" });
    return temporary;
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

  private restoreFile(path: string, content: Buffer | undefined): void {
    if (content === undefined) {
      unlinkSync(path);
      return;
    }
    writeFileSync(path, content);
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

function inlineCode(value: string): string {
  const runs = value.match(/`+/g) ?? [];
  const delimiter = "`".repeat(Math.max(0, ...runs.map((run) => run.length)) + 1);
  return `${delimiter}${value}${delimiter}`;
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
