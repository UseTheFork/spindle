import { readFile } from "node:fs/promises";

import { Command } from "commander";

import { InitCommand } from "@/commands/init/init-command";
import { SddCommand } from "@/commands/sdd/sdd-command";
import { SetupProjectCommand } from "@/commands/setup-project/setup-project-command";
import { UpdateCommand } from "@/commands/update/update-command";
import type { Application } from "@/foundation/Application";
import { Kernel } from "@/foundation/Kernel";
import type { ConsoleInvocation } from "@/foundation/tokens";

export async function dispatch(
  args: string[],
  createApp: (invocation: ConsoleInvocation) => Application,
  script = "spindle",
): Promise<void> {
  const packageMetadata = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version: string };
  const program = new Command().name("spindle").version(packageMetadata.version);
  let invocation: ConsoleInvocation | undefined;
  program.hook("preAction", (_program, command) => {
    const commandPath: string[] = [];
    for (let current: Command | null = command; current.parent; current = current.parent) {
      commandPath.unshift(current.name());
    }
    invocation = {
      raw: [...args],
      script,
      commandPath,
      options: command.optsWithGlobals<Record<string, unknown>>(),
      positionals: [...command.args],
    };
  });
  const resolveApp = async (): Promise<Application> => {
    if (!invocation) throw new Error("No validated command invocation.");
    const app = createApp(invocation);
    const kernel = await app.make(Kernel);
    await kernel.boot(invocation);
    return app;
  };

  InitCommand.register(program, resolveApp);
  UpdateCommand.register(program, resolveApp);
  const sdd = program
    .command("sdd")
    .description("Subagent-driven development workflow")
    .allowExcessArguments(false);
  SddCommand.register(sdd, resolveApp);
  SetupProjectCommand.register(program, resolveApp);

  await program.parseAsync(args, { from: "user" });
}
