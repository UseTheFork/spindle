import { randomUUID } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import {
  LoadProjectConfiguration,
  type ProjectConfigurationData,
} from "@/Foundation/Bootstrap/LoadProjectConfiguration";
import { Service } from "@/Foundation/Service";
import type { ToolingEntry } from "@/Tooling/Models/ToolingEntry";

const toolingPath = "docs/agents/tooling.md";
const configPath = ".github/spindle.json";
const toolingKeyPattern = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

const defaultTooling: ToolingEntry[] = [
  {
    key: "spindle-init",
    section: "Spindle",
    command: "spindle init",
    description: "Install Spindle Blueprints and initialize project guidance.",
  },
  {
    key: "spindle-update",
    section: "Spindle",
    command: "spindle update",
    description: "Update installed Spindle Blueprints.",
  },
  {
    key: "spindle-tool",
    section: "Spindle",
    command: "spindle tool <list|add|update|remove>",
    description: "Manage documented project tooling commands.",
  },
];

export interface ToolingEntryInput {
  key: string;
  section: string;
  command: string;
  description?: string;
}

export interface ToolingInitializationResult {
  created: string[];
  updated: string[];
}

export class ToolingService extends Service {
  public async initialize(
    previous: ProjectConfigurationData,
  ): Promise<ToolingInitializationResult> {
    this.assertApplicationBooted();
    const workspace = this.app.workspacePath();
    const configFile = join(workspace, configPath);
    this.assertRegularFileOrMissing(configFile, configPath);

    const tooling =
      previous.tooling === undefined
        ? structuredClone(defaultTooling)
        : this.migrateDefaultTooling(previous.tooling);
    const config: ProjectConfigurationData = {
      ...previous,
      stacks: previous.stacks,
      variables: previous.variables,
      tooling,
    };

    const documentFile = join(workspace, toolingPath);
    this.assertRegularFileOrMissing(documentFile, toolingPath);
    const documentExisted = existsSync(documentFile);
    this.writeConfigurationAndDocumentation(
      configFile,
      `${JSON.stringify(config, null, 2)}\n`,
      documentFile,
      this.renderTooling(tooling),
      readFileSync(configFile),
    );
    await LoadProjectConfiguration.refresh(this.app);
    return {
      created: documentExisted ? [] : [toolingPath],
      updated: documentExisted ? [configPath, toolingPath] : [configPath],
    };
  }

  public async listTooling(): Promise<ToolingEntry[]> {
    this.assertApplicationBooted();
    return [...this.readInitializedConfiguration().tooling!];
  }

  public async addTooling(input: ToolingEntryInput): Promise<ToolingEntry> {
    this.assertApplicationBooted();
    const entry = this.validateEntry(input);
    const config = this.readInitializedConfiguration();
    const tooling = config.tooling!;
    if (tooling.some(({ key }) => key === entry.key)) {
      throw new Error(`Tooling key '${entry.key}' already exists; use 'spindle tool update'.`);
    }
    const updated = [...tooling, entry];
    await this.saveTooling(config, updated);
    return entry;
  }

  public async updateTooling(input: {
    key: string;
    section?: string;
    command?: string;
    description?: string;
    clearDescription?: boolean;
  }): Promise<ToolingEntry> {
    this.assertApplicationBooted();
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

    const config = this.readInitializedConfiguration();
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
    await this.saveTooling(config, updated);
    return updatedEntry;
  }

  public async removeTooling(key: string): Promise<{ key: string; removed: true }> {
    this.assertApplicationBooted();
    this.validateKey(key);
    const config = this.readInitializedConfiguration();
    const tooling = config.tooling!;
    if (!tooling.some((entry) => entry.key === key)) {
      throw new Error(`No tooling command has key '${key}'.`);
    }
    await this.saveTooling(
      config,
      tooling.filter((entry) => entry.key !== key),
    );
    return { key, removed: true };
  }

  private readInitializedConfiguration(): ProjectConfigurationData {
    const state = LoadProjectConfiguration.current(this.app);
    if (state.status === "absent") {
      throw new Error("Project tooling is not initialized. Run `spindle init` first.");
    }
    if (state.status === "invalid") throw new Error(state.reason, { cause: state.error });
    if (state.data.tooling === undefined) {
      throw new Error("Project tooling is not initialized. Run `spindle init` first.");
    }
    this.assertToolingDocumentAvailable();
    return state.data;
  }

  private async saveTooling(
    config: ProjectConfigurationData,
    tooling: ToolingEntry[],
  ): Promise<void> {
    const updated = { ...config, tooling };
    const configFile = this.app.workspacePath(configPath);
    const documentFile = this.app.workspacePath(toolingPath);
    this.writeConfigurationAndDocumentation(
      configFile,
      `${JSON.stringify(updated, null, 2)}\n`,
      documentFile,
      this.renderTooling(tooling),
      readFileSync(configFile),
    );
    await LoadProjectConfiguration.refresh(this.app);
  }

  private assertToolingDocumentAvailable(): void {
    const workspace = this.app.workspacePath();
    const parent = join(workspace, "docs", "agents");
    try {
      if (!lstatSync(parent).isDirectory()) {
        throw new Error("docs/agents must be a real directory.");
      }
    } catch (error) {
      if (isMissing(error)) {
        throw new Error("Project tooling is not initialized. Run `spindle init` first.");
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

  private migrateDefaultTooling(entries: ToolingEntry[]): ToolingEntry[] {
    const migrated = [...entries];
    const legacyIndex = entries.findIndex(
      ({ key, command }) => key === "spindle-project-init" && command === "spindle project init",
    );
    if (legacyIndex >= 0) {
      if (migrated.some(({ key }) => key === "spindle-tool")) {
        migrated.splice(legacyIndex, 1);
      } else {
        migrated[legacyIndex] = structuredClone(defaultTooling[2]!);
      }
    }

    const initIndex = migrated.findIndex(
      ({ key, command, description }) =>
        key === "spindle-init" &&
        command === "spindle init" &&
        description === "Install Spindle Blueprints for selected stacks.",
    );
    if (initIndex >= 0) {
      migrated[initIndex] = structuredClone(defaultTooling[0]!);
    }
    return migrated;
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

  private assertRegularFileOrMissing(path: string, relativePath: string): void {
    const entry = lstatSync(path, { throwIfNoEntry: false });
    if (entry && !entry.isFile()) {
      throw new Error(`${relativePath} must be a regular file, not a directory or symlink.`);
    }
  }
}

function inlineCode(value: string): string {
  const runs = value.match(/`+/g) ?? [];
  const delimiter = "`".repeat(Math.max(0, ...runs.map((run) => run.length)) + 1);
  return `${delimiter}${value}${delimiter}`;
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
