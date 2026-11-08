import type { Application } from "@/foundation/Application";

export abstract class Bootstrapper {
  public abstract bootstrap(application: Application): void | Promise<void>;
}

export type BootstrapperConstructor<T extends Bootstrapper = Bootstrapper> = new () => T;
