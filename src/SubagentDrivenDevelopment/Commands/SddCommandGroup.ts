import type { Command } from "commander";

export class SddCommandGroup {
  public static register(root: Command): Command {
    return (
      root.commands.find((command) => command.name() === "sdd") ??
      root.command("sdd").description("Manage subagent-driven development workspaces.")
    );
  }

  public static subgroup(
    root: Command,
    name: "ticket" | "task" | "review",
    description: string,
  ): Command {
    const sdd = this.register(root);
    return (
      sdd.commands.find((command) => command.name() === name) ??
      sdd.command(name).description(description)
    );
  }
}
