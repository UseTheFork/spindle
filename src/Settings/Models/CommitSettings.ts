import { z } from "zod";

export const commitSettingsSchema = z
  .looseObject({
    allow_body: z.boolean().default(false).describe("Allow commit message bodies."),
    title_max_length: z
      .number()
      .int()
      .min(11)
      .default(72)
      .describe("Maximum length of the complete commit title."),
    scopes_enabled: z
      .boolean()
      .default(false)
      .describe("Require an allowed scope in commit titles."),
    allowed_scopes: z
      .array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/))
      .default([])
      .describe("Allowed lowercase kebab-case commit scopes."),
    allow_breaking_changes: z.boolean().default(false).describe("Allow breaking-change notation."),
  })
  .superRefine((settings, context) => {
    if (settings.allow_breaking_changes && settings.title_max_length < 12) {
      context.addIssue({
        code: "custom",
        path: ["title_max_length"],
        message: "Must be at least 12 when breaking changes are enabled.",
      });
    }
    if (new Set(settings.allowed_scopes).size !== settings.allowed_scopes.length) {
      context.addIssue({
        code: "custom",
        path: ["allowed_scopes"],
        message: "Scopes must be unique.",
      });
    }
    if (settings.scopes_enabled && settings.allowed_scopes.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["allowed_scopes"],
        message: "At least one scope is required.",
      });
    }
    if (
      settings.scopes_enabled &&
      settings.allowed_scopes.some(
        (scope) =>
          scope.length + 13 + Number(settings.allow_breaking_changes) > settings.title_max_length,
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["allowed_scopes"],
        message: "Scopes must fit within the title limit.",
      });
    }
  });

export type CommitSettings = z.output<typeof commitSettingsSchema>;
export const defaultCommitSettings = commitSettingsSchema.parse({});
