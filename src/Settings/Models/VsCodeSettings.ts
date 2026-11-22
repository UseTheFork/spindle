import { z } from "zod";

export const vsCodeSettingsSchema = z.strictObject({
  enabled: z
    .boolean()
    .default(false)
    .describe(
      "Enable VS Code management; Spindle overwrites managed settings, commit-message instructions, and the commit-message guidance file.",
    ),
});

export const defaultVsCodeSettings = vsCodeSettingsSchema.parse({});
