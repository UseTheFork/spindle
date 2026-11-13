import { UpdateCommand } from "@/BlueprintManagement/Commands/UpdateCommand";
import { Service } from "@/Foundation/Service";
import { commitSettingsSchema } from "@/Settings/Models/CommitSettings";
import { projectSettingsSchema } from "@/Settings/Models/ProjectSettings";
import {
  ProjectSettingsService,
  type ProjectSettingsData,
} from "@/Settings/Services/ProjectSettingsService";
import { Records } from "@/Support/Records";

const keys = new Set([
  ...Object.keys(projectSettingsSchema.shape).filter((key) => key !== "$schema"),
  ...Object.keys(commitSettingsSchema.shape).map((field) => `commit.${field}`),
]);

export class SettingsService extends Service {
  public async get(key?: string): Promise<unknown> {
    this.assertApplicationBooted();
    const { settings } = ProjectSettingsService.requireCurrent(this.app);
    if (key === undefined) return settings;
    if (!keys.has(key)) throw new Error(`Unknown setting '${key}'.`);
    const [group, field] = key.split(".");
    const value = settings[group!];
    if (field === undefined) {
      if (value === undefined) throw new Error(`Setting '${key}' is not configured.`);
      return value;
    }
    if (!Records.isRecord(value)) throw new Error(`Setting '${key}' is not configured.`);
    return value[field];
  }

  public async set(key: string, value: unknown): Promise<ProjectSettingsData> {
    if (!keys.has(key)) throw new Error(`Unknown setting '${key}'.`);
    const { settings } = ProjectSettingsService.requireCurrent(this.app);
    const [group, field] = key.split(".");
    const updated =
      field === undefined
        ? { ...settings, [group!]: value }
        : { ...settings, commit: { ...settings.commit, [field]: value } };
    return this.save(updated);
  }

  public async save(value: unknown): Promise<ProjectSettingsData> {
    this.assertApplicationBooted();
    ProjectSettingsService.requireCurrent(this.app);
    const state = ProjectSettingsService.parse(JSON.stringify(value));
    if (state.status !== "valid")
      throw new Error(state.status === "invalid" ? state.reason : "Invalid settings.");
    await (await this.app.make(UpdateCommand)).run(state.data);
    return ProjectSettingsService.requireCurrent(this.app).settings;
  }
}
