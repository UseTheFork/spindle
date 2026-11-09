import { readFile } from "node:fs/promises";

import type { Application } from "@/Foundation/Application";
import { Records } from "@/Support/Records";
import { Stacks } from "@/Support/Stacks";

export interface ProjectConfigurationData extends Record<string, unknown> {
  stacks: string[];
  variables: Record<string, string>;
}

export type ProjectConfigurationState =
  | { status: "absent" }
  | { status: "valid"; data: ProjectConfigurationData }
  | { status: "invalid"; data: unknown; error: Error; reason: string };

const malformed =
  '.github/spindle.json is malformed; expected {"stacks": [...], "variables": {...}}. Fix the file or run `spindle init`.';

function isStringRecord(value: unknown): value is Record<string, string> {
  return Records.isRecord(value) && Object.values(value).every((item) => typeof item === "string");
}

function isConfiguration(value: unknown): value is ProjectConfigurationData {
  return (
    Records.isRecord(value) &&
    Array.isArray(value.stacks) &&
    value.stacks.length > 0 &&
    value.stacks.every((stack) => typeof stack === "string") &&
    isStringRecord(value.variables)
  );
}

export function parseProjectConfiguration(raw: string): ProjectConfigurationState {
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
  if (!isConfiguration(data)) {
    return { status: "invalid", data, error: new Error(malformed), reason: malformed };
  }
  try {
    Stacks.validate(data.stacks);
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return { status: "invalid", data, error, reason: error.message };
  }
  return { status: "valid", data };
}

export async function loadProjectConfiguration(path: string): Promise<ProjectConfigurationState> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if (Records.isRecord(error) && error.code === "ENOENT") return { status: "absent" };
    throw error;
  }
  return parseProjectConfiguration(raw);
}

export function projectConfiguration(application: Application): ProjectConfigurationState {
  const state = application.value("config.project");
  if (Records.isRecord(state)) {
    if (state.status === "absent") return { status: "absent" };
    if (state.status === "valid" && isConfiguration(state.data)) {
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

export function requireProjectConfiguration(state: ProjectConfigurationState) {
  if (state.status === "absent") {
    throw new Error(
      "This repository has no .github/spindle.json. Run `spindle init` to create .github/spindle.json.",
    );
  }
  if (state.status === "invalid") {
    if (state.reason.startsWith("Invalid stack '")) throw state.error;
    throw new Error(`${state.reason} Run \`spindle init\` to create .github/spindle.json.`);
  }
  return { config: state.data, stacks: state.data.stacks, variables: state.data.variables };
}

export async function readConfig(path: string) {
  return requireProjectConfiguration(await loadProjectConfiguration(path));
}
