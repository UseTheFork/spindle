import type { Application } from "@/Foundation/Application";

const bootedServices = new WeakSet<Service>();

export class Service {
  private readonly _app: Application;

  public constructor(app: Application) {
    this._app = app;
  }

  public get app(): Application {
    return this._app;
  }

  public get isBooted(): boolean {
    return bootedServices.has(this);
  }

  public async boot(): Promise<void> {}
}

export async function bootService(service: Service): Promise<void> {
  await service.boot();
  bootedServices.add(service);
}
