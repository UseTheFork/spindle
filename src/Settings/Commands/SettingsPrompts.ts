import { cancel, confirm, isCancel, multiselect, select, text } from "@clack/prompts";

import {
  defaultCommitSettings,
  commitSettingsSchema,
  type CommitSettings,
} from "@/Settings/Models/CommitSettings";
import type { ProjectSettingsData } from "@/Settings/Services/ProjectSettingsService";
import { Stacks } from "@/Support/Stacks";
import { BuiltInTooling } from "@/Tooling/Models/BuiltInTooling";
import type { ToolingEntry } from "@/Tooling/Models/ToolingEntry";

export class SettingsPrompts {
  private static answer<T>(value: T | symbol): T {
    if (typeof value === "symbol" && isCancel(value)) {
      cancel("Cancelled.");
      throw new Error("Cancelled by user.");
    }
    return value as T;
  }

  public static async promptCommitSettings(
    initial: CommitSettings = defaultCommitSettings,
  ): Promise<CommitSettings> {
    const allow_body = SettingsPrompts.answer<boolean>(
      await confirm({ message: "Allow commit message bodies?", initialValue: initial.allow_body }),
    );
    const allow_breaking_changes = SettingsPrompts.answer<boolean>(
      await confirm({
        message: "Allow breaking-change notation?",
        initialValue: initial.allow_breaking_changes,
      }),
    );
    const minimumLength = allow_breaking_changes ? 12 : 11;
    const title = SettingsPrompts.answer<string>(
      await text({
        message: "Maximum commit title length",
        initialValue: String(initial.title_max_length),
        validate: (value) =>
          /^[1-9]\d*$/.test(value ?? "") &&
          commitSettingsSchema.safeParse({
            ...initial,
            allow_breaking_changes,
            title_max_length: Number(value),
            scopes_enabled: false,
          }).success
            ? undefined
            : `Enter an integer of at least ${minimumLength}.`,
      }),
    );
    const scopes_enabled = SettingsPrompts.answer<boolean>(
      await confirm({ message: "Require commit scopes?", initialValue: initial.scopes_enabled }),
    );
    let allowed_scopes = initial.allowed_scopes;
    if (scopes_enabled) {
      const scopes = SettingsPrompts.answer<string>(
        await text({
          message: "Allowed scopes (comma-separated lowercase kebab-case)",
          initialValue: initial.allowed_scopes.join(", "),
          validate: (value) => {
            const proposed = (value ?? "").split(",").map((scope) => scope.trim());
            return commitSettingsSchema.safeParse({
              ...initial,
              allow_breaking_changes,
              title_max_length: Number(title),
              scopes_enabled: true,
              allowed_scopes: proposed,
            }).success
              ? undefined
              : "Enter distinct lowercase kebab-case scopes that fit within the title limit.";
          },
        }),
      );
      allowed_scopes = scopes.split(",").map((scope) => scope.trim());
    }
    return {
      ...initial,
      allow_body,
      title_max_length: Number(title),
      scopes_enabled,
      allowed_scopes,
      allow_breaking_changes,
    };
  }

  private static async promptRequired(message: string, initialValue: string): Promise<string> {
    return SettingsPrompts.answer<string>(
      await text({
        message,
        initialValue,
        validate: (input) =>
          (input ?? "").trim() && !/[\r\n]/.test(input ?? "")
            ? undefined
            : "Enter a nonempty single-line value.",
      }),
    ).trim();
  }

  private static async promptTooling(initial: ToolingEntry[]): Promise<ToolingEntry[]> {
    const entries = structuredClone(initial);
    while (true) {
      const action = SettingsPrompts.answer<string>(
        await select({
          message: "Manage tooling entries",
          options: [
            { value: "done", label: `Continue (${entries.length} entries)` },
            { value: "add", label: "Add an entry" },
            ...(entries.length
              ? [
                  { value: "edit", label: "Edit an entry" },
                  { value: "remove", label: "Remove an entry" },
                ]
              : []),
          ],
        }),
      );
      if (action === "done") return entries;
      let index = -1;
      if (action !== "add") {
        index = SettingsPrompts.answer<number>(
          await select({
            message: "Choose a tooling entry",
            options: entries.map((entry, value) => ({ value, label: entry.key })),
          }),
        );
        if (action === "remove") {
          entries.splice(index, 1);
          continue;
        }
      }
      const current = entries[index];
      const key = SettingsPrompts.answer<string>(
        await text({
          message: "Tooling key",
          initialValue: current?.key ?? "",
          validate: (value) => {
            const key = value ?? "";
            if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(key)) {
              return "Use lowercase letters, digits, and interior hyphens.";
            }
            if (
              BuiltInTooling.isBuiltInToolingKey(key) ||
              entries.some((entry, i) => i !== index && entry.key === key)
            ) {
              return "This key is reserved or already in use.";
            }
            return undefined;
          },
        }),
      );
      const section = await SettingsPrompts.promptRequired(
        "Tooling section",
        current?.section ?? "",
      );
      const command = await SettingsPrompts.promptRequired(
        "Tooling command",
        current?.command ?? "",
      );
      const description = SettingsPrompts.answer<string>(
        await text({
          message: "Tooling description (optional)",
          initialValue: current?.description ?? "",
          validate: (value) => (/[\r\n]/.test(value ?? "") ? "Enter a single line." : undefined),
        }),
      ).trim();
      const entry: ToolingEntry = { ...current, key, section, command };
      if (description) entry.description = description;
      else delete entry.description;
      if (index < 0) entries.push(entry);
      else entries[index] = entry;
    }
  }

  public static async promptSettings(
    settings: ProjectSettingsData,
  ): Promise<Record<string, unknown>> {
    const stacks = SettingsPrompts.answer<string[]>(
      await multiselect({
        message: "Which stacks does this project use?",
        options: Stacks.supported.map((value) => ({ value, label: value })),
        initialValues: settings.stacks,
        required: true,
      }),
    );
    const spindle_package_manager = await SettingsPrompts.promptRequired(
      "Spindle package-manager command",
      settings.spindle_package_manager ?? "",
    );
    const tooling = await SettingsPrompts.promptTooling(settings.tooling);
    const commit = await SettingsPrompts.promptCommitSettings(settings.commit);
    return { ...settings, stacks, spindle_package_manager, tooling, commit };
  }
}
