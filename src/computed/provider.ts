export interface ResolvedConfig {
  readonly stacks: readonly string[];
  readonly variables: Readonly<Record<string, string>>;
}

export abstract class ComputedVariableProvider {
  constructor(readonly config: ResolvedConfig) {}

  abstract render(): string;
}

type ComputedVariableProviderClass = new (config: ResolvedConfig) => ComputedVariableProvider;

export type ComputedVariableRegistry = Readonly<Record<string, ComputedVariableProviderClass>>;
