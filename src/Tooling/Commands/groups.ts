import type { Command } from "commander";

export function toolGroup(root: Command): Command {
  return (
    root.commands.find((command) => command.name() === "tool") ??
    root.command("tool").description("Manage project tooling command documentation.")
  );
}
