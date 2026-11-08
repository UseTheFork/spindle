import type { Application } from "@/foundation/Application";
import { Bootstrapper } from "@/foundation/bootstrap/Bootstrapper";
import { ConsoleArgs, Invocation } from "@/foundation/tokens";
import { Repository } from "@/utilities/Repository";

export class LoadConsoleArgs extends Bootstrapper {
  public bootstrap(application: Application): void {
    const invocation = application.value(Invocation);
    const args = new Repository();
    args.set("raw", invocation.raw);
    args.set("script", invocation.script);
    args.set("commandPath", invocation.commandPath);
    args.set("options", invocation.options);
    args.set("positionals", invocation.positionals);
    application.instance(ConsoleArgs, args);
  }
}
