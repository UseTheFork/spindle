import { cancel, confirm, isCancel, multiselect, select, text } from "@clack/prompts";

import type { ProjectConfigurationData } from "@/Foundation/Bootstrap/LoadProjectConfiguration";
import {
  defaultCommitSettings,
  commitSettingsSchema,
  type CommitSettings,
} from "@/Settings/Models/CommitSettings";
import { Stacks } from "@/Support/Stacks";
import { isBuiltInToolingKey } from "@/Tooling/Models/BuiltInTooling";
import type { ToolingEntry } from "@/Tooling/Models/ToolingEntry";

function answer<T>(value: T | symbol): T {
  if (typeof value === "symbol" && isCancel(value)) {
    cancel("Cancelled.");
    throw new Error("Cancelled by user.");
  }
  return value as T;
}

export async function promptCommitSettings(
  initial: CommitSettings = defaultCommitSettings,
): Promise<CommitSettings> {
  const allow_body = answer<boolean>(
    await confirm({ message: "Allow commit message bodies?", initialValue: initial.allow_body }),
  );
  const allow_breaking_changes = answer<boolean>(
    await confirm({
      message: "Allow breaking-change notation?",
      initialValue: initial.allow_breaking_changes,
    }),
  );
  const minimumLength = allow_breaking_changes ? 12 : 11;
  const title = answer<string>(
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
  const scopes_enabled = answer<boolean>(
    await confirm({ message: "Require commit scopes?", initialValue: initial.scopes_enabled }),
  );
  let allowed_scopes = initial.allowed_scopes;
  if (scopes_enabled) {
    const scopes = answer<string>(
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

async function promptRequired(message: string, initialValue: string): Promise<string> {
  return answer<string>(
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

async function promptTooling(initial: ToolingEntry[]): Promise<ToolingEntry[]> {
  const entries = structuredClone(initial);
  while (true) {
    const action = answer<string>(
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
      index = answer<number>(
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
    const key = answer<string>(
      await text({
        message: "Tooling key",
        initialValue: current?.key ?? "",
        validate: (value) => {
          const key = value ?? "";
          if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(key)) {
            return "Use lowercase letters, digits, and interior hyphens.";
          }
          if (
            isBuiltInToolingKey(key) ||
            entries.some((entry, i) => i !== index && entry.key === key)
          ) {
            return "This key is reserved or already in use.";
          }
          return undefined;
        },
      }),
    );
    const section = await promptRequired("Tooling section", current?.section ?? "");
    const command = await promptRequired("Tooling command", current?.command ?? "");
    const description = answer<string>(
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

export async function promptSettings(
  config: ProjectConfigurationData,
): Promise<Record<string, unknown>> {
  const stacks = answer<string[]>(
    await multiselect({
      message: "Which stacks does this project use?",
      options: Stacks.supported.map((value) => ({ value, label: value })),
      initialValues: config.stacks,
      required: true,
    }),
  );
  const spindle_package_manager = await promptRequired(
    "Spindle package-manager command",
    config.spindle_package_manager ?? "",
  );
  const tooling = await promptTooling(config.tooling);
  const commit = await promptCommitSettings(config.commit);
  return { ...config, stacks, spindle_package_manager, tooling, commit };
}
