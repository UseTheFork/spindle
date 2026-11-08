import { ValueToken } from "@/foundation/Container";
import type { Repository } from "@/utilities/Repository";

export interface ConsoleInvocation {
  readonly raw: readonly string[];
  readonly script: string;
  readonly commandPath: readonly string[];
  readonly options: Readonly<Record<string, unknown>>;
  readonly positionals: readonly string[];
}

export const WorkspaceRoot = new ValueToken<string>("workspaceRoot");
export const BlueprintSourceRoot = new ValueToken<string>("blueprintSourceRoot");
export const Invocation = new ValueToken<ConsoleInvocation>("invocation");
export const ConsoleArgs = new ValueToken<Repository>("args");
