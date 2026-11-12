import type { ToolingEntry } from "@/Tooling/Models/ToolingEntry";

export const builtInTooling: readonly ToolingEntry[] = [
  {
    key: "spindle-init",
    section: "Spindle",
    command: "spindle init",
    description: "Install Spindle Blueprints and initialize project guidance.",
  },
  {
    key: "spindle-update",
    section: "Spindle",
    command: "spindle update",
    description: "Update installed Spindle Blueprints.",
  },
  {
    key: "spindle-tool",
    section: "Spindle",
    command: "spindle tool <list|add|update|remove>",
    description: "Manage documented project tooling commands.",
  },
];

export function isBuiltInToolingKey(key: string): boolean {
  return builtInTooling.some((entry) => entry.key === key);
}
