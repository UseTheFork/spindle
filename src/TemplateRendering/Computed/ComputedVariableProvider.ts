export interface ResolvedInputs {
  readonly stacks: readonly string[];
  readonly variables: Readonly<Record<string, string>>;
}

export abstract class ComputedVariableProvider {
  public constructor(public readonly inputs: ResolvedInputs) {}

  public abstract render(): string | undefined;
}

type ComputedVariableProviderClass = new (inputs: ResolvedInputs) => ComputedVariableProvider;

export type ComputedVariableRegistry = Readonly<Record<string, ComputedVariableProviderClass>>;
