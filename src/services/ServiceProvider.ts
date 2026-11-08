import type { Application } from "../foundation/Application.js";

export abstract class ServiceProvider {
  private readonly _app: Application;

  public constructor(app: Application) {
    this._app = app;
  }

  public get app(): Application {
    return this._app;
  }

  public abstract register(): void;

  public abstract boot(): Promise<void>;
}
