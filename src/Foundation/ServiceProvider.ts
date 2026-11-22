import type { CommandConstructor } from "@spindle/Commands/Command";
import type { Application } from "@spindle/Foundation/Application";
import type { ProjectLifecycleContext } from "@spindle/Foundation/ProjectLifecycleContext";

export type ProjectLifecycleHook = "beforeInit" | "afterInit" | "beforeUpdate" | "afterUpdate";

export abstract class ServiceProvider {
  private readonly _app: Application;

  public constructor(app: Application) {
    this._app = app;
  }

  public get app(): Application {
    return this._app;
  }

  public static commands(): readonly CommandConstructor[] {
    return [];
  }

  public abstract register(): void;

  public abstract boot(): Promise<void>;

  public async beforeInit(_context: ProjectLifecycleContext): Promise<void> {}

  public async afterInit(_context: ProjectLifecycleContext): Promise<void> {}

  public async beforeUpdate(_context: ProjectLifecycleContext): Promise<void> {}

  public async afterUpdate(_context: ProjectLifecycleContext): Promise<void> {}
}
