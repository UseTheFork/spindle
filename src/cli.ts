import { readFile } from "node:fs/promises";

import { Command } from "commander";

import type { Application, ServiceProviderConstructor } from "@/foundation/Application";
import type { ConsoleInvocation } from "@/foundation/ConsoleInvocation";
import { FoundationServiceProvider } from "@/foundation/FoundationServiceProvider";
import { Kernel } from "@/foundation/Kernel";

export async function dispatch(
  args: string[],
  createApp: (
    invocation: ConsoleInvocation,
    providers: readonly ServiceProviderConstructor[],
  ) => Application,
  script = "spindle",
  providers: readonly ServiceProviderConstructor[] = [],
): Promise<void> {
  const selectedProviders = [...new Set(providers)];
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
    const app = createApp(invocation, selectedProviders);
    app.selectBootstrapProviders(selectedProviders);
    const kernel = await app.make(Kernel);
    await kernel.boot(invocation);
    return app;
  };

  const commands = new Set(
    [FoundationServiceProvider, ...selectedProviders].flatMap((provider) => provider.commands()),
  );
  for (const Command of commands) Command.register(program, resolveApp);

  await program.parseAsync(args, { from: "user" });
}
