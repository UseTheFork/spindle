import { z } from "zod";

export const vsCodeSettingsSchema = z.strictObject({
  enabled: z
    .boolean()
    .default(false)
    .describe("Let Spindle manage VS Code workspace settings and commit-message guidance."),
});

export const defaultVsCodeSettings = vsCodeSettingsSchema.parse({});
