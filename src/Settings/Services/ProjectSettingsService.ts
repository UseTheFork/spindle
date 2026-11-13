import { readFile } from "node:fs/promises";

import type { Application } from "@/Foundation/Application";
import { projectSettingsSchema, type ProjectSettings } from "@/Settings/Models/ProjectSettings";
import { Records } from "@/Support/Records";
import { Stacks } from "@/Support/Stacks";

export type ProjectSettingsData = ProjectSettings;

export type ProjectSettingsState =
  | { status: "absent" }
  | { status: "valid"; data: ProjectSettingsData }
  | { status: "invalid"; data: unknown; error: Error; reason: string };

export class ProjectSettingsService {
  public static parse(raw: string): ProjectSettingsState {
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
    if (
      Records.isRecord(data) &&
      Array.isArray(data.stacks) &&
      data.stacks.every((stack) => typeof stack === "string")
    ) {
      try {
        Stacks.validate(data.stacks);
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        return { status: "invalid", data, error, reason: error.message };
      }
    }
    const result = projectSettingsSchema.safeParse(data);
    if (!result.success) {
      const details = result.error.issues
        .map((issue) => `${issue.path.join(".") || "settings"}: ${issue.message}`)
        .join("; ");
      const reason = `.github/spindle.json is malformed: ${details}.`;
      return { status: "invalid", data, error: result.error, reason };
    }
    return { status: "valid", data: result.data };
  }

  public static async load(path: string): Promise<ProjectSettingsState> {
    let raw: string;
    try {
      raw = await readFile(path, "utf8");
    } catch (error) {
      if (Records.isRecord(error) && error.code === "ENOENT") return { status: "absent" };
      throw error;
    }
    return this.parse(raw);
  }

  public static current(application: Application): ProjectSettingsState {
    const state = application.value("settings.project");
    if (Records.isRecord(state)) {
      if (state.status === "absent") return { status: "absent" };
      if (state.status === "valid") {
        const result = projectSettingsSchema.safeParse(state.data);
        if (result.success) return { status: "valid", data: result.data };
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
      "Application binding 'settings.project' must contain a Project Settings state.",
    );
  }

  public static async withTemporaryState<T>(
    application: Application,
    state: ProjectSettingsState,
    operation: () => Promise<T>,
  ): Promise<T> {
    this.current(application);
    const current = application.value("settings.project");
    if (!Records.isRecord(current)) {
      throw new Error(
        "Application binding 'settings.project' must contain a Project Settings state.",
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

  public static require(state: ProjectSettingsState) {
    if (state.status === "absent") {
      throw new Error(
        "This repository has no .github/spindle.json. Run `spindle init` to create Project Settings.",
      );
    }
    if (state.status === "invalid") {
      if (state.reason.startsWith("Invalid stack '")) throw state.error;
      throw new Error(`${state.reason} Fix .github/spindle.json before continuing.`);
    }
    return { settings: state.data, stacks: state.data.stacks };
  }

  public static requireCurrent(application: Application) {
    return this.require(this.current(application));
  }

  public static async refresh(application: Application): Promise<ProjectSettingsState> {
    const state = await this.load(application.workspacePath(".github/spindle.json"));
    if (application.bound("settings.project")) {
      const current = application.value("settings.project");
      if (!Records.isRecord(current)) {
        throw new Error(
          "Application binding 'settings.project' must contain a Project Settings state.",
        );
      }
      for (const key of Object.keys(current)) delete current[key];
      Object.assign(current, state);
    } else {
      application.instance("settings.project", state);
    }
    return state;
  }
}
