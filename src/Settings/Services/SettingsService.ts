import { UpdateCommand } from "@/BlueprintManagement/Commands/UpdateCommand";
import {
  LoadProjectConfiguration,
  type ProjectConfigurationData,
} from "@/Foundation/Bootstrap/LoadProjectConfiguration";
import { Service } from "@/Foundation/Service";
import { defaultCommitSettings } from "@/Settings/Models/CommitSettings";
import { Records } from "@/Support/Records";

const keys = new Set([
  "stacks",
  "spindle_package_manager",
  "tooling",
  "commit",
  "commit.allow_body",
  "commit.title_max_length",
  "commit.scopes_enabled",
  "commit.allowed_scopes",
  "commit.allow_breaking_changes",
]);

export class SettingsService extends Service {
  public async get(key?: string): Promise<unknown> {
    this.assertApplicationBooted();
    const { config } = LoadProjectConfiguration.require(
      await LoadProjectConfiguration.refresh(this.app),
    );
    const effective: ProjectConfigurationData = {
      ...config,
      tooling: config.tooling ?? [],
      commit: config.commit ?? defaultCommitSettings,
    };
    if (key === undefined) return effective;
    if (!keys.has(key)) throw new Error(`Unknown setting '${key}'.`);
    const [group, field] = key.split(".");
    const value = effective[group!];
    if (field === undefined) {
      if (value === undefined) throw new Error(`Setting '${key}' is not configured.`);
      return value;
    }
    if (!Records.isRecord(value)) throw new Error(`Setting '${key}' is not configured.`);
    return value[field];
  }

  public async set(key: string, value: unknown): Promise<ProjectConfigurationData> {
    if (!keys.has(key)) throw new Error(`Unknown setting '${key}'.`);
    const { config } = LoadProjectConfiguration.require(
      await LoadProjectConfiguration.refresh(this.app),
    );
    const [group, field] = key.split(".");
    const updated =
      field === undefined
        ? { ...config, [group!]: value }
        : { ...config, commit: { ...(config.commit ?? defaultCommitSettings), [field]: value } };
    return this.save(updated);
  }

  public async save(value: unknown): Promise<ProjectConfigurationData> {
    this.assertApplicationBooted();
    const state = LoadProjectConfiguration.parse(JSON.stringify(value));
    if (state.status !== "valid")
      throw new Error(state.status === "invalid" ? state.reason : "Invalid settings.");
    await (await this.app.make(UpdateCommand)).run(state.data);
    return LoadProjectConfiguration.requireCurrent(this.app).config;
  }
}
