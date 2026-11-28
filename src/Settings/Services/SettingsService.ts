import { UpdateCommand } from "@spindle/BlueprintManagement/Commands/UpdateCommand";
import { Service } from "@spindle/Foundation/Service";
import { commitSettingsSchema } from "@spindle/Settings/Models/CommitSettings";
import { modelsSettingsSchema } from "@spindle/Settings/Models/ModelSettings";
import { projectSettingsSchema } from "@spindle/Settings/Models/ProjectSettings";
import { sddSettingsSchema } from "@spindle/Settings/Models/SddSettings";
import { updateSettingsSchema } from "@spindle/Settings/Models/UpdateSettings";
import { vsCodeSettingsSchema } from "@spindle/Settings/Models/VsCodeSettings";
import {
  ProjectSettingsService,
  type ProjectSettingsData,
} from "@spindle/Settings/Services/ProjectSettingsService";
import { Records } from "@spindle/Support/Records";
import { z } from "zod";

const keys = new Set([
  ...Object.keys(projectSettingsSchema.shape).filter((key) => key !== "$schema"),
  ...Object.keys(commitSettingsSchema.shape).map((field) => `commit.${field}`),
  ...Object.keys(sddSettingsSchema.shape).map((field) => `sdd.${field}`),
  ...Object.keys(updateSettingsSchema.shape).map((field) => `update.${field}`),
  ...Object.keys(modelsSettingsSchema.shape).map((field) => `models.${field}`),
  ...Object.keys(vsCodeSettingsSchema.shape).map((field) => `vscode.${field}`),
]);

export interface SettingDescription {
  readonly key: string;
  readonly type: string;
  readonly description: string;
  readonly required: boolean;
  readonly group_optional?: boolean;
  readonly default?: unknown;
  readonly constraints?: Record<string, unknown>;
}

export class SettingsService extends Service {
  public list(): SettingDescription[] {
    const schema = z.toJSONSchema(projectSettingsSchema, { io: "input" });
    return [...keys].map((key) => {
      const [group, field] = key.split(".");
      const parent = this.propertySchema(schema, group!);
      const setting = field === undefined ? parent : this.propertySchema(parent, field);
      const parentRequired = schema.required?.includes(group!) ?? false;
      const required =
        field === undefined ? parentRequired : (parent.required?.includes(field) ?? false);
      const constraints = this.constraints(setting);
      const groupOptional = field !== undefined && !parentRequired && parent.default === undefined;
      return {
        key,
        type: this.settingType(setting),
        description: setting.description ?? "",
        required,
        ...(groupOptional ? { group_optional: true } : {}),
        ...(setting.default === undefined ? {} : { default: setting.default }),
        ...(Object.keys(constraints).length === 0 ? {} : { constraints }),
      };
    });
  }

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
    const current = settings[group!];
    const nestedSettings = Records.isRecord(current) ? current : {};
    const updated =
      field === undefined
        ? { ...settings, [group!]: value }
        : {
            ...settings,
            [group!]: {
              ...nestedSettings,
              [field]: value,
            },
          };
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

  private propertySchema(
    schema: z.core.JSONSchema.BaseSchema,
    key: string,
  ): z.core.JSONSchema.BaseSchema {
    const property = schema.properties?.[key];
    if (typeof property !== "object" || property === null) {
      throw new Error(`Setting schema is missing '${key}'.`);
    }
    return property;
  }

  private settingType(schema: z.core.JSONSchema.BaseSchema): string {
    if (schema.type === "array") {
      const items = Records.isRecord(schema.items) ? schema.items : undefined;
      return `${typeof items?.type === "string" ? items.type : "unknown"}[]`;
    }
    return Array.isArray(schema.type) ? schema.type.join(" | ") : (schema.type ?? "unknown");
  }

  private constraints(schema: z.core.JSONSchema.BaseSchema): Record<string, unknown> {
    const constraints: Record<string, unknown> = {};
    for (const key of [
      "minimum",
      "maximum",
      "exclusiveMinimum",
      "exclusiveMaximum",
      "multipleOf",
      "minLength",
      "maxLength",
      "minItems",
      "maxItems",
      "uniqueItems",
      "pattern",
      "enum",
    ]) {
      if (schema[key] !== undefined) constraints[key] = schema[key];
    }
    if (Records.isRecord(schema.items)) {
      const itemConstraints: Record<string, unknown> = {};
      for (const key of ["minimum", "maximum", "minLength", "maxLength", "pattern", "enum"]) {
        if (schema.items[key] !== undefined) itemConstraints[key] = schema.items[key];
      }
      if (Object.keys(itemConstraints).length > 0) constraints.items = itemConstraints;
    }
    return constraints;
  }
}
