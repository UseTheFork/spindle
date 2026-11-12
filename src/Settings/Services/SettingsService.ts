import { UpdateCommand } from "@/BlueprintManagement/Commands/UpdateCommand";
import {
  LoadProjectConfiguration,
  type ProjectConfigurationData,
} from "@/Foundation/Bootstrap/LoadProjectConfiguration";
import { Service } from "@/Foundation/Service";
import { commitSettingsSchema } from "@/Settings/Models/CommitSettings";
import { projectSettingsSchema } from "@/Settings/Models/ProjectSettings";
import { Records } from "@/Support/Records";

const keys = new Set([
  ...Object.keys(projectSettingsSchema.shape).filter((key) => key !== "$schema"),
  ...Object.keys(commitSettingsSchema.shape).map((field) => `commit.${field}`),
]);

export class SettingsService extends Service {
  public async get(key?: string): Promise<unknown> {
    this.assertApplicationBooted();
    const { config } = LoadProjectConfiguration.require(
      await LoadProjectConfiguration.refresh(this.app),
    );
    if (key === undefined) return config;
    if (!keys.has(key)) throw new Error(`Unknown setting '${key}'.`);
    const [group, field] = key.split(".");
    const value = config[group!];
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
        : { ...config, commit: { ...config.commit, [field]: value } };
    return this.save(updated);
  }

  public async save(value: unknown): Promise<ProjectConfigurationData> {
    this.assertApplicationBooted();
    LoadProjectConfiguration.require(await LoadProjectConfiguration.refresh(this.app));
    const state = LoadProjectConfiguration.parse(JSON.stringify(value));
    if (state.status !== "valid")
      throw new Error(state.status === "invalid" ? state.reason : "Invalid settings.");
    await (await this.app.make(UpdateCommand)).run(state.data);
    return LoadProjectConfiguration.requireCurrent(this.app).config;
  }
}
