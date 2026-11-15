import type { Application } from "@spindle/Foundation/Application";
import { Bootstrapper } from "@spindle/Foundation/Bootstrap/Bootstrapper";
import type { ConsoleInvocation } from "@spindle/Foundation/ConsoleInvocation";
import { Repository } from "@spindle/Support/Repository";

export class LoadConsoleArgs extends Bootstrapper {
  public bootstrap(application: Application): void {
    const value = application.value("console.invocation");
    if (!LoadConsoleArgs.isConsoleInvocation(value)) {
      throw new Error(
        "Console invocation must include valid raw, script, command, options, and positional data.",
      );
    }
    const invocation = value;
    const args = new Repository();
    args.set("raw", invocation.raw);
    args.set("script", invocation.script);
    args.set("commandPath", invocation.commandPath);
    args.set("options", invocation.options);
    args.set("positionals", invocation.positionals);
    application.instance("console.args", args);
  }

  private static isStringArray(value: unknown): value is readonly string[] {
    if (!Array.isArray(value)) return false;
    for (const item of value) {
      if (typeof item !== "string") return false;
    }
    return true;
  }

  private static isOptions(value: unknown): value is Readonly<Record<string, unknown>> {
    return (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
    );
  }

  private static isConsoleInvocation(value: unknown): value is ConsoleInvocation {
    return (
      typeof value === "object" &&
      value !== null &&
      "raw" in value &&
      "script" in value &&
      "commandPath" in value &&
      "options" in value &&
      "positionals" in value &&
      LoadConsoleArgs.isStringArray(value.raw) &&
      typeof value.script === "string" &&
      LoadConsoleArgs.isStringArray(value.commandPath) &&
      LoadConsoleArgs.isOptions(value.options) &&
      LoadConsoleArgs.isStringArray(value.positionals)
    );
  }
}
