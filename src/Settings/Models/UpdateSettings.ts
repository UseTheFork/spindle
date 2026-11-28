import { z } from "zod";

export const updateSettingsSchema = z.strictObject({
  auto_commit: z.boolean().default(false).describe("Commit changes made by spindle update."),
  commit_message: z
    .string()
    .regex(/^(?=.*\S)[^\r\n\0]+$/, "Must be a non-empty single line without NUL characters.")
    .default("chore: update spindle")
    .describe("Commit message used by spindle update."),
});

export const defaultUpdateSettings = updateSettingsSchema.parse({});
