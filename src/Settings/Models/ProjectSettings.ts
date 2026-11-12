import { readFileSync } from "node:fs";

import { z } from "zod";

import { commitSettingsSchema, defaultCommitSettings } from "@/Settings/Models/CommitSettings";
import { Stacks } from "@/Support/Stacks";
import { isBuiltInToolingKey } from "@/Tooling/Models/BuiltInTooling";

const singleLine = z.string().regex(/^(?=.*\S)[^\r\n]+$/, "Must be a non-empty single line.");
const toolingEntrySchema = z.looseObject({
  key: z
    .string()
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/)
    .refine((key) => !isBuiltInToolingKey(key), "Key is reserved for a built-in command."),
  section: singleLine,
  command: singleLine,
  description: singleLine.optional(),
});

export const projectSettingsSchema = z.looseObject({
  $schema: z.string().optional(),
  stacks: z.array(
    z
      .string()
      .refine(
        (stack) => Stacks.supported.some((supported) => supported === stack),
        "Unsupported stack.",
      )
      .meta({ enum: [...Stacks.supported] }),
  ),
  spindle_package_manager: singleLine.optional(),
  tooling: z
    .array(toolingEntrySchema)
    .default([])
    .superRefine((entries, context) => {
      if (new Set(entries.map((entry) => entry.key)).size !== entries.length) {
        context.addIssue({ code: "custom", message: "Tooling keys must be unique." });
      }
    }),
  commit: commitSettingsSchema.default(defaultCommitSettings),
});

export type ProjectSettings = z.output<typeof projectSettingsSchema>;

export class ProjectSettingsSchema {
  public static releaseUrl(): string {
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
    return `https://github.com/UseTheFork/spindle/releases/download/v${metadata.version}/spindle.schema.json`;
  }
}
