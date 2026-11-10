import { readFile } from "node:fs/promises";

import type { Application } from "@/Foundation/Application";
import { Bootstrapper } from "@/Foundation/Bootstrap/Bootstrapper";
import { Records } from "@/Support/Records";
import { Stacks } from "@/Support/Stacks";
import type { ToolingEntry } from "@/Tooling/Models/ToolingEntry";

export interface ProjectConfigurationData extends Record<string, unknown> {
  stacks: string[];
  spindle_package_manager?: string;
  tooling?: ToolingEntry[];
}

export type ProjectConfigurationState =
  | { status: "absent" }
  | { status: "valid"; data: ProjectConfigurationData }
  | { status: "invalid"; data: unknown; error: Error; reason: string };

const malformed =
  '.github/spindle.json is malformed; expected {"stacks": [...], "spindle_package_manager"?: string, "tooling"?: [...]}. Fix the file or run `spindle init`.';

export class LoadProjectConfiguration extends Bootstrapper {
  public static parse(raw: string): ProjectConfigurationState {
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      return {
        status: "invalid",
        data: raw,
        error,
        reason: ".github/spindle.json is not valid JSON.",
      };
    }
    if (!this.isConfiguration(data)) {
      return { status: "invalid", data, error: new Error(malformed), reason: malformed };
    }
    if (data.stacks.length > 0) {
      try {
        Stacks.validate(data.stacks);
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        return { status: "invalid", data, error, reason: error.message };
      }
    }
    return { status: "valid", data };
  }

  public static async load(path: string): Promise<ProjectConfigurationState> {
    let raw: string;
    try {
      raw = await readFile(path, "utf8");
    } catch (error) {
      if (Records.isRecord(error) && error.code === "ENOENT") return { status: "absent" };
      throw error;
    }
    return this.parse(raw);
  }

  public static current(application: Application): ProjectConfigurationState {
    const state = application.value("config.project");
    if (Records.isRecord(state)) {
      if (state.status === "absent") return { status: "absent" };
      if (state.status === "valid" && this.isConfiguration(state.data)) {
        return { status: "valid", data: state.data };
      }
      if (
        state.status === "invalid" &&
        state.error instanceof Error &&
        typeof state.reason === "string"
      ) {
        return { status: "invalid", data: state.data, error: state.error, reason: state.reason };
      }
    }
    throw new Error(
      "Application binding 'config.project' must contain a project configuration state.",
    );
  }

  public static async withTemporaryState<T>(
    application: Application,
    state: ProjectConfigurationState,
    operation: () => Promise<T>,
  ): Promise<T> {
    this.current(application);
    const current = application.value("config.project");
    if (!Records.isRecord(current)) {
      throw new Error(
        "Application binding 'config.project' must contain a project configuration state.",
      );
    }
    const previous = { ...current };
    const replace = (replacement: object) => {
      for (const key of Object.keys(current)) delete current[key];
      Object.assign(current, replacement);
    };
    replace(state);
    try {
      return await operation();
    } finally {
      replace(previous);
    }
  }

  public static require(state: ProjectConfigurationState) {
    if (state.status === "absent") {
      throw new Error(
        "This repository has no .github/spindle.json. Run `spindle init` to create .github/spindle.json.",
      );
    }
    if (state.status === "invalid") {
      if (state.reason.startsWith("Invalid stack '")) throw state.error;
      throw new Error(`${state.reason} Run \`spindle init\` to create .github/spindle.json.`);
    }
    return { config: state.data, stacks: state.data.stacks };
  }

  public static requireCurrent(application: Application) {
    return this.require(this.current(application));
  }

  public static async refresh(application: Application): Promise<ProjectConfigurationState> {
    const state = await this.load(application.workspacePath(".github/spindle.json"));
    if (application.bound("config.project")) {
      const current = application.value("config.project");
      if (!Records.isRecord(current)) {
        throw new Error(
          "Application binding 'config.project' must contain a project configuration state.",
        );
      }
      for (const key of Object.keys(current)) delete current[key];
      Object.assign(current, state);
    } else {
      application.instance("config.project", state);
    }
    return state;
  }

  public async bootstrap(application: Application): Promise<void> {
    await LoadProjectConfiguration.refresh(application);
  }

  private static isConfiguration(value: unknown): value is ProjectConfigurationData {
    return (
      Records.isRecord(value) &&
      Array.isArray(value.stacks) &&
      value.stacks.every((stack) => typeof stack === "string") &&
      (value.spindle_package_manager === undefined ||
        (typeof value.spindle_package_manager === "string" &&
          this.isSingleLine(value.spindle_package_manager))) &&
      (value.tooling === undefined ||
        (Array.isArray(value.tooling) &&
          value.tooling.every((entry) => this.isToolingEntry(entry)) &&
          new Set(value.tooling.map((entry) => entry.key)).size === value.tooling.length))
    );
  }

  private static isToolingEntry(value: unknown): value is ToolingEntry {
    return (
      Records.isRecord(value) &&
      typeof value.key === "string" &&
      /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value.key) &&
      typeof value.section === "string" &&
      this.isSingleLine(value.section) &&
      typeof value.command === "string" &&
      this.isSingleLine(value.command) &&
      (value.description === undefined ||
        (typeof value.description === "string" && this.isSingleLine(value.description)))
    );
  }

  private static isSingleLine(text: string): boolean {
    return text.trim().length > 0 && !/[\r\n]/.test(text);
  }
}
