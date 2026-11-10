import type { Application } from "@/Foundation/Application";

export abstract class ComputedVariableProvider {
  public constructor(public readonly app: Application) {}

  public abstract render(): string | undefined;
}

type ComputedVariableProviderClass = new (app: Application) => ComputedVariableProvider;

export type ComputedVariableRegistry = Readonly<Record<string, ComputedVariableProviderClass>>;
