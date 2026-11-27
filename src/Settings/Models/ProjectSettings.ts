import { readFileSync } from "node:fs";

import {
  commitSettingsSchema,
  defaultCommitSettings,
} from "@spindle/Settings/Models/CommitSettings";
import {
  defaultModelsSettings,
  modelsSettingsSchema,
} from "@spindle/Settings/Models/ModelSettings";
import { sddSettingsSchema } from "@spindle/Settings/Models/SddSettings";
import {
  defaultVsCodeSettings,
  vsCodeSettingsSchema,
} from "@spindle/Settings/Models/VsCodeSettings";
import { Stacks } from "@spindle/Support/Stacks";
import { BuiltInTooling } from "@spindle/Tooling/Models/BuiltInTooling";
import { z } from "zod";

const singleLine = z.string().regex(/^(?=.*\S)[^\r\n]+$/, "Must be a non-empty single line.");
const toolingEntrySchema = z.looseObject({
  key: z
    .string()
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/)
    .refine(
      (key) => !BuiltInTooling.isBuiltInToolingKey(key),
      "Key is reserved for a built-in command.",
    )
    .describe("Unique key for the documented tooling command."),
  section: singleLine.describe("Section heading in the generated tooling guide."),
  command: singleLine.describe("Command to display in the generated tooling guide."),
  description: singleLine.optional().describe("Optional explanation shown in the tooling guide."),
});

export const projectSettingsSchema = z.looseObject({
  $schema: z.string().optional(),
  stacks: z
    .array(
      z
        .string()
        .refine(
          (stack) => Stacks.supported.some((supported) => supported === stack),
          "Unsupported stack.",
        )
        .meta({ enum: [...Stacks.supported] }),
    )
    .describe("Stacks used to select project Blueprints."),
  spindle_package_manager: singleLine
    .optional()
    .describe("Preferred package-manager command for generated project guidance."),
  tooling: z
    .array(toolingEntrySchema)
    .default([])
    .superRefine((entries, context) => {
      if (new Set(entries.map((entry) => entry.key)).size !== entries.length) {
        context.addIssue({ code: "custom", message: "Tooling keys must be unique." });
      }
    })
    .describe(
      "Additional commands documented in the project tooling guide; each entry has a key, section, command, and optional description.",
    ),
  commit: commitSettingsSchema
    .default(defaultCommitSettings)
    .describe("Conventional Commit guidance settings."),
  sdd: sddSettingsSchema.optional().describe("Shared SDD worktree and setup settings."),
  models: modelsSettingsSchema
    .default(defaultModelsSettings)
    .describe("Preferred model settings for Spindle-assigned Agent profiles."),
  vscode: vsCodeSettingsSchema
    .default(defaultVsCodeSettings)
    .describe("Opt-in VS Code integration settings."),
});

export type ProjectSettings = z.output<typeof projectSettingsSchema>;

export class ProjectSettingsSchema {
  public static schemaUrl(): string {
    const metadata: unknown = JSON.parse(
      readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
    );
    if (
      typeof metadata !== "object" ||
      metadata === null ||
      !("version" in metadata) ||
      typeof metadata.version !== "string"
    ) {
      throw new Error("Package metadata must contain a version.");
    }
    return `https://unpkg.com/@use-the-fork/spindle@${metadata.version}/build/spindle.schema.json`;
  }
}
