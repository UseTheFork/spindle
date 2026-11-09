import type { Command } from "commander";

export function projectGroup(root: Command): Command {
  return (
    root.commands.find((command) => command.name() === "project") ??
    root.command("project").description("Initialize project guidance and manage tooling commands.")
  );
}

export function toolingGroup(root: Command): Command {
  const project = projectGroup(root);
  return (
    project.commands.find((command) => command.name() === "tooling") ??
    project.command("tooling").description("Manage project tooling command documentation.")
  );
}
