import { readFile } from "node:fs/promises";

import { Command } from "commander";

import type { App } from "./app.js";
import { InitCommand } from "./commands/init/init-command.js";
import { SddCommand } from "./commands/sdd/sdd-command.js";
import { SetupProjectCommand } from "./commands/setup-project/setup-project-command.js";
import { UpdateCommand } from "./commands/update/update-command.js";

export async function dispatch(args: string[], createApp: () => App): Promise<void> {
  const packageMetadata = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version: string };
  const program = new Command().name("spindle").version(packageMetadata.version);

  InitCommand.register(program, createApp);
  UpdateCommand.register(program, createApp);
  const sdd = program
    .command("sdd")
    .description("Subagent-driven development workflow")
    .allowExcessArguments(false);
  SddCommand.register(sdd, createApp);
  SetupProjectCommand.register(program, createApp);

  await program.parseAsync(args, { from: "user" });
}
