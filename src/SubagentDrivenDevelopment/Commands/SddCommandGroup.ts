import type { Command } from "commander";

export class SddCommandGroup {
  public static register(root: Command): Command {
    return (
      root.commands.find((command) => command.name() === "sdd") ??
      root.command("sdd").description("Manage subagent-driven development workspaces.")
    );
  }
}
