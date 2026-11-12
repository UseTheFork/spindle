import { readFile } from "node:fs/promises";

import { Command, CommanderError } from "commander";

import type { Application, ServiceProviderConstructor } from "@/Foundation/Application";
import type { ConsoleInvocation } from "@/Foundation/ConsoleInvocation";
import { ConsoleOutputService } from "@/Foundation/ConsoleOutputService";
import { FoundationServiceProvider } from "@/Foundation/FoundationServiceProvider";
import { Kernel } from "@/Foundation/Kernel";

export async function dispatch(
  args: string[],
  createApp: (
    invocation: ConsoleInvocation,
    providers: readonly ServiceProviderConstructor[],
  ) => Application,
  script = "spindle",
  providers: readonly ServiceProviderConstructor[] = [],
  output = new ConsoleOutputService(),
): Promise<void> {
  const selectedProviders = [...new Set(providers)];
  const packageMetadata = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version: string };
  const program = new Command()
    .name("spindle")
    .version(packageMetadata.version)
    .option("--json", "Write machine-readable results and diagnostics as JSON")
    .configureOutput({
      outputError: () => {},
      writeErr: (message) => {
        if (program.opts().json !== true) process.stderr.write(message);
      },
    })
    .exitOverride();
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
    (await app.make(ConsoleOutputService)).setMode(
      invocation.options.json === true ? "json" : "human",
    );
    return app;
  };

  const commands = new Set(
    [FoundationServiceProvider, ...selectedProviders].flatMap((provider) => provider.commands()),
  );
  for (const Command of commands) Command.register(program, resolveApp);

  try {
    await program.parseAsync(args, { from: "user" });
  } catch (error) {
    if (error instanceof CommanderError && error.exitCode === 0) return;
    if (error instanceof CommanderError && error.code === "commander.help") {
      throw new Error("A subcommand is required. Run spindle --help for available commands.");
    }
    throw error;
  } finally {
    output.setMode(program.opts().json === true ? "json" : "human");
  }
}
