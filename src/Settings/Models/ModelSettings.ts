import { z } from "zod";

const modelIds = z
  .array(z.string().regex(/^(?=.*\S)[^\r\n]+$/, "Must be a non-empty single-line model ID."))
  .min(1, "At least one model ID is required.");

const defaultModelProfiles = {
  fast: ["gemini-3.8-flash", "auto"],
  balanced: ["gemini-3.8-flash", "auto"],
  deep: ["gemini-3.8-flash", "auto"],
};

export const modelProfilesSchema = z.strictObject({
  fast: modelIds
    .default(["gemini-3.8-flash", "auto"])
    .describe("Ordered model IDs for Agents assigned to fast lookup tasks."),
  balanced: modelIds
    .default(["gemini-3.8-flash", "auto"])
    .describe("Ordered model IDs for Agents assigned to routine specialist tasks."),
  deep: modelIds
    .default(["gemini-3.8-flash", "auto"])
    .describe("Ordered model IDs for Agents assigned to complex analysis and review."),
});

export const modelsSettingsSchema = z.strictObject({
  enabled: z
    .boolean()
    .default(true)
    .describe("Enable preferred model fields in selected Agent Blueprints."),
  profiles: modelProfilesSchema
    .prefault(defaultModelProfiles)
    .describe("Ordered model IDs for Spindle-assigned workload profiles."),
});

export type ModelProfileName = keyof z.output<typeof modelProfilesSchema>;
export type ModelProfiles = z.output<typeof modelProfilesSchema>;
export type ModelsSettings = z.output<typeof modelsSettingsSchema>;

export const defaultModelsSettings = modelsSettingsSchema.parse({});
