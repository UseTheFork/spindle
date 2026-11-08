export interface ConsoleInvocation {
  readonly raw: readonly string[];
  readonly script: string;
  readonly commandPath: readonly string[];
  readonly options: Readonly<Record<string, unknown>>;
  readonly positionals: readonly string[];
}
