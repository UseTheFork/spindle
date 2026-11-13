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
import { isDeepStrictEqual } from "node:util";

import { Service } from "@/Foundation/Service";
import {
  ProjectSettingsService,
  type ProjectSettingsData,
} from "@/Settings/Services/ProjectSettingsService";
import { builtInTooling, isBuiltInToolingKey } from "@/Tooling/Models/BuiltInTooling";
import type { ToolingEntry } from "@/Tooling/Models/ToolingEntry";

const toolingPath = "docs/agents/tooling.md";
const projectSettingsPath = ".github/spindle.json";
const toolingKeyPattern = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

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
  public async initialize(previous: ProjectSettingsData): Promise<ToolingInitializationResult> {
    this.assertApplicationBooted();
    const workspace = this.app.workspacePath();
    const settingsFile = join(workspace, projectSettingsPath);
    this.assertRegularFileOrMissing(settingsFile, projectSettingsPath);

    const tooling = previous.tooling;
    const settings: ProjectSettingsData = {
      ...previous,
      stacks: previous.stacks,
      tooling,
    };

    const documentFile = join(workspace, toolingPath);
    this.assertRegularFileOrMissing(documentFile, toolingPath);
    const documentExisted = existsSync(documentFile);
    const original = readFileSync(settingsFile);
    const current = ProjectSettingsService.parse(original.toString("utf8"));
    if (current.status !== "valid") {
      throw new Error(
        current.status === "invalid" ? current.reason : "Project Settings are absent.",
      );
    }
    if (!isDeepStrictEqual(current.data, settings)) {
      throw new Error("Project Settings changed while preparing guidance; run again.");
    }
    const needsSettingsWrite = !isDeepStrictEqual(JSON.parse(original.toString("utf8")), settings);
    if (needsSettingsWrite) {
      this.writeProjectSettingsAndDocumentation(
        settingsFile,
        `${JSON.stringify(settings, null, 2)}\n`,
        documentFile,
        this.renderTooling(tooling),
        original,
      );
      await ProjectSettingsService.refresh(this.app);
    } else {
      const temporary = this.writeTemporary(documentFile, this.renderTooling(tooling));
      try {
        renameSync(temporary, documentFile);
      } finally {
        this.removeTemporary(temporary);
      }
    }
    return {
      created: documentExisted ? [] : [toolingPath],
      updated: [
        ...(needsSettingsWrite ? [projectSettingsPath] : []),
        ...(documentExisted ? [toolingPath] : []),
      ],
    };
  }

  public async listTooling(): Promise<ToolingEntry[]> {
    this.assertApplicationBooted();
    const state = ProjectSettingsService.current(this.app);
    if (state.status === "invalid") throw new Error(state.reason, { cause: state.error });
    if (state.status === "absent") {
      throw new Error("Project tooling is not initialized. Run `spindle init` first.");
    }
    return structuredClone([...builtInTooling, ...state.data.tooling]);
  }

  public async addTooling(input: ToolingEntryInput): Promise<ToolingEntry> {
    this.assertApplicationBooted();
    const entry = this.validateEntry(input);
    const settings = this.readInitializedSettings();
    const tooling = settings.tooling;
    if (tooling.some(({ key }) => key === entry.key)) {
      throw new Error(`Tooling key '${entry.key}' already exists; use 'spindle tool update'.`);
    }
    const updated = [...tooling, entry];
    await this.saveTooling(settings, updated);
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

    const settings = this.readInitializedSettings();
    const tooling = settings.tooling;
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
    updated[index] = { ...updatedEntry };
    await this.saveTooling(settings, updated);
    return updatedEntry;
  }

  public async removeTooling(key: string): Promise<{ key: string; removed: true }> {
    this.assertApplicationBooted();
    this.validateKey(key);
    const settings = this.readInitializedSettings();
    const tooling = settings.tooling;
    if (!tooling.some((entry) => entry.key === key)) {
      throw new Error(`No tooling command has key '${key}'.`);
    }
    await this.saveTooling(
      settings,
      tooling.filter((entry) => entry.key !== key),
    );
    return { key, removed: true };
  }

  private readInitializedSettings(): ProjectSettingsData {
    const state = ProjectSettingsService.current(this.app);
    if (state.status === "absent") {
      throw new Error(
        "Project tooling is not initialized. Run `spindle init` or `spindle update` first.",
      );
    }
    if (state.status === "invalid") throw new Error(state.reason, { cause: state.error });
    this.assertToolingDocumentAvailable();
    return state.data;
  }

  private async saveTooling(settings: ProjectSettingsData, tooling: ToolingEntry[]): Promise<void> {
    const updated = { ...settings, tooling };
    const settingsFile = this.app.workspacePath(projectSettingsPath);
    const documentFile = this.app.workspacePath(toolingPath);
    this.writeProjectSettingsAndDocumentation(
      settingsFile,
      `${JSON.stringify(updated, null, 2)}\n`,
      documentFile,
      this.renderTooling(tooling),
      readFileSync(settingsFile),
    );
    await ProjectSettingsService.refresh(this.app);
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

  private validateKey(key: string): void {
    if (!toolingKeyPattern.test(key)) {
      throw new Error("Tooling key must use lowercase letters, digits, and interior hyphens.");
    }
    if (isBuiltInToolingKey(key)) {
      throw new Error(`Tooling key '${key}' is reserved for a built-in command.`);
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
    for (const entry of [...builtInTooling, ...entries]) {
      const section = sections.get(entry.section) ?? [];
      section.push(entry);
      sections.set(entry.section, section);
    }
    const lines = ["# Project Tooling"];
    for (const [section, commands] of sections) {
      lines.push("", `## ${section}`, "");
      for (const entry of commands) {
        const description = entry.description ? `: ${entry.description}` : "";
        lines.push(`- ${inlineCode(entry.command)}${description}`);
      }
    }
    return `${lines.join("\n")}\n`;
  }

  private writeProjectSettingsAndDocumentation(
    settingsFile: string,
    settingsContent: string,
    documentFile: string,
    documentContent: string,
    previousSettings: Buffer | undefined,
  ): void {
    this.assertRegularFileOrMissing(settingsFile, projectSettingsPath);
    this.assertRegularFileOrMissing(documentFile, toolingPath);
    let settingsTemp: string | undefined;
    let documentTemp: string | undefined;
    try {
      settingsTemp = this.writeTemporary(settingsFile, settingsContent);
      documentTemp = this.writeTemporary(documentFile, documentContent);
      renameSync(settingsTemp, settingsFile);
      try {
        renameSync(documentTemp, documentFile);
      } catch (error) {
        try {
          this.restoreFile(settingsFile, previousSettings);
        } catch (rollbackError) {
          throw new AggregateError(
            [error, rollbackError],
            "Could not update the tooling guide and restore the previous Project Settings.",
          );
        }
        throw error;
      }
    } finally {
      if (settingsTemp) this.removeTemporary(settingsTemp);
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
