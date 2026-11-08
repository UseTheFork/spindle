import { afterEach, expect, test } from "vitest";

import { Config } from "@/config/Config";
import { Application } from "@/foundation/Application";
import { ApplicationBuilder } from "@/foundation/ApplicationBuilder";
import { Bootstrapper, type BootstrapperConstructor } from "@/foundation/bootstrap/Bootstrapper";
import { RegisterProviders } from "@/foundation/bootstrap/RegisterProviders";
import type { ConsoleInvocation } from "@/foundation/ConsoleInvocation";
import { Kernel } from "@/foundation/Kernel";
import { ServiceProvider } from "@/services/ServiceProvider";

afterEach(() => RegisterProviders.merge([]));

const invocation: ConsoleInvocation = {
  raw: [],
  script: "spindle",
  commandPath: [],
  options: {},
  positionals: [],
};

class ProviderKernel extends Kernel {
  protected override bootstrappers(): readonly BootstrapperConstructor[] {
    return [RegisterProviders];
  }
}

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

test("base path is normalized immutable and separate from explicitly bound roots", () => {
  const first = new Application({ basePath: "/workspaces/first/nested/.." });
  const second = new Application({ basePath: "/workspaces/second" });
  expect(first.basePath).toBe("/workspaces/first");
  expect(second.basePath).toBe("/workspaces/second");
  expect(() => first.workspaceRoot).toThrow(/Unbound/);
  first.instance("path.workspace", "/workspaces");
  first.instance("path.blueprints", "/blueprints/first");
  expect(first.workspaceRoot).toBe("/workspaces");
  expect(first.blueprintSourceRoot).toBe("/blueprints/first");
  for (const key of ["basePath", "workspaceRoot", "blueprintSourceRoot"]) {
    expect(Reflect.set(first, key, "/changed")).toBe(false);
  }
  expect(first.basePath).toBe("/workspaces/first");
  expect(() => second.workspaceRoot).toThrow(/Unbound/);
  const invalidPath = new Application({ basePath: "/invalid" });
  invalidPath.instance("path.workspace", 42);
  expect(() => invalidPath.workspaceRoot).toThrow(/must be a string/);
});

test("configuration is isolated and available before explicit provider construction", async () => {
  const configurations: Config[] = [];
  class Provider extends ServiceProvider {
    public constructor(app: Application) {
      super(app);
      expect(app.config).toBeInstanceOf(Config);
      expect(app.config.has("provider")).toBe(false);
      configurations.push(app.config);
      app.config.set("provider.constructed", true);
    }
    public register(): void {
      expect(this.app.config.boolean("provider.constructed")).toBe(true);
      this.app.config.set("provider.registered", true);
    }
    public async boot(): Promise<void> {
      expect(this.app.config.boolean("provider.registered")).toBe(true);
      this.app.config.push("provider.events", "boot");
    }
  }
  const app = new Application({ basePath: "/first" });
  const other = new Application({ basePath: "/second" });
  expect(configurations).toEqual([]);
  app.register(Provider);
  other.register(Provider);
  expect(configurations).toEqual([app.config, other.config]);
  expect(app.config).not.toBe(other.config);
  app.config.set("isolated", "first");
  expect(other.config.has("isolated")).toBe(false);
  await app.boot();
  expect(app.config.array("provider.events")).toEqual(["boot"]);
  expect(other.config.has("provider.events")).toBe(false);
});

test("register constructs and registers once per application, queues ordered shared provider boot", async () => {
  const events: string[] = [];
  const instances: ServiceProvider[] = [];
  const started = gate();
  const finish = gate();
  class First extends ServiceProvider {
    public constructor(app: Application) {
      super(app);
      instances.push(this);
    }
    public register(): void {
      events.push("register:first");
      this.app.register(First);
    }
    public async boot(): Promise<void> {
      events.push("start:first");
      started.release();
      await finish.promise;
      events.push("end:first");
    }
  }
  class Second extends ServiceProvider {
    public register(): void {
      events.push("register:second");
    }
    public async boot(): Promise<void> {
      events.push("boot:second");
    }
  }
  const app = new Application({ basePath: "/first" });
  const other = new Application({ basePath: "/second" });
  app.register(First);
  app.register(Second);
  app.register(First);
  other.register(First);
  expect(instances).toHaveLength(2);
  expect(instances[0]?.app).toBe(app);
  expect(Reflect.set(instances[0]!, "app", other)).toBe(false);
  expect(events).toEqual(["register:first", "register:second", "register:first"]);
  const boots = [app.boot(), app.boot()];
  await started.promise;
  expect(events.at(-1)).toBe("start:first");
  finish.release();
  await Promise.all(boots);
  await app.boot();
  expect(events.slice(-3)).toEqual(["start:first", "end:first", "boot:second"]);
});

test("registration is developer ordered, without registration phase gates", async () => {
  const app = new Application({ basePath: "/empty" });
  await expect(app.boot()).resolves.toBeUndefined();
  const events: string[] = [];
  class Provider extends ServiceProvider {
    public register(): void {
      events.push("register");
    }
    public async boot(): Promise<void> {
      events.push("boot");
    }
  }
  app.register(Provider);
  await app.boot();
  expect(events).toEqual(["register"]);
});

test("provider merge replaces a fresh ordered nullish-filtered deduplicated global list", async () => {
  const events: string[] = [];
  class First extends ServiceProvider {
    public register(): void {
      events.push("first");
    }
    public async boot(): Promise<void> {}
  }
  class Removed extends ServiceProvider {
    public register(): void {
      events.push("removed");
    }
    public async boot(): Promise<void> {}
  }
  class Second extends ServiceProvider {
    public register(): void {
      events.push("second");
    }
    public async boot(): Promise<void> {}
  }
  RegisterProviders.merge([Removed]);
  const list = [Second, null, First, undefined, Second];
  RegisterProviders.merge(list);
  list.length = 0;
  const app = new Application({ basePath: "/first" });
  await new ProviderKernel(app).bootstrap();
  new RegisterProviders().bootstrap(app);
  expect(events).toEqual(["second", "first"]);
  await new ProviderKernel(new Application({ basePath: "/other" })).bootstrap();
  expect(events).toEqual(["second", "first", "second", "first"]);
  RegisterProviders.merge([]);
  await new ProviderKernel(new Application({ basePath: "/empty" })).bootstrap();
  expect(events).toHaveLength(4);
});

test("builder is fluent and registers an ordinary lazy Kernel singleton idempotently", async () => {
  const app = new Application({ basePath: "/project" });
  const builder = new ApplicationBuilder(app);
  expect(builder.withKernels()).toBe(builder);
  expect(builder.withKernels().withProviders().create()).toBe(app);
  const [first, second] = await Promise.all([app.make(Kernel), app.make(Kernel)]);
  expect(first).toBe(second);
  expect(first.app).toBe(app);
  expect(app.hasBeenBootstrapped).toBe(false);
  expect(() => app.singleton(Kernel, (owner) => new Kernel(owner))).toThrow(/already bound/);
  const configured = Application.configure("/other").create();
  expect(configured.bound(Kernel)).toBe(true);
  expect(await configured.make(Kernel)).not.toBe(first);
});

test("configure defaults clear provider selection rather than retaining prior global providers", async () => {
  let registrations = 0;
  class Provider extends ServiceProvider {
    public register(): void {
      registrations++;
    }
    public async boot(): Promise<void> {}
  }
  Application.configure("/first", [Provider]);
  const app = Application.configure("/second").create();
  await new ProviderKernel(app).boot(invocation);
  expect(registrations).toBe(0);
});

test("extended bootstrap lists construct sequentially, share app-owned state and capture first list", async () => {
  const events: string[] = [];
  const started = gate();
  const finish = gate();
  const owners: Application[] = [];
  class First extends Bootstrapper {
    public constructor() {
      super();
      events.push("construct:first");
    }
    public async bootstrap(app: Application): Promise<void> {
      owners.push(app);
      events.push("start:first");
      started.release();
      await finish.promise;
      events.push("end:first");
    }
  }
  class Second extends Bootstrapper {
    public constructor() {
      super();
      events.push("construct:second");
    }
    public bootstrap(app: Application): void {
      owners.push(app);
      events.push("second");
    }
  }
  class Extended extends ProviderKernel {
    protected override bootstrappers(): readonly BootstrapperConstructor[] {
      return [...super.bootstrappers(), First, Second];
    }
  }
  const app = new Application({ basePath: "/first" });
  const list = [RegisterProviders, First, Second];
  const first = app.bootstrapWith(list);
  list.length = 0;
  const requests = [first, new Extended(app).boot(invocation), new ProviderKernel(app).bootstrap()];
  await started.promise;
  expect(events).toEqual(["construct:first", "start:first"]);
  expect(app.hasBeenBootstrapped).toBe(false);
  finish.release();
  await Promise.all(requests);
  expect(events).toEqual([
    "construct:first",
    "start:first",
    "end:first",
    "construct:second",
    "second",
  ]);
  expect(owners).toEqual([app, app]);
  expect(app.hasBeenBootstrapped).toBe(true);
  expect(Reflect.set(app, "hasBeenBootstrapped", false)).toBe(false);
  await new Extended(app).bootstrap();
  expect(owners).toHaveLength(2);
  const other = new Application({ basePath: "/second" });
  await other.bootstrapWith([]);
  expect(other.hasBeenBootstrapped).toBe(true);
});

test.each([new Error("registration failure"), undefined, null, "failure", 0])(
  "failed bootstrap registration propagates %j without booting a partial provider queue",
  async (failure) => {
    const events: string[] = [];
    class First extends ServiceProvider {
      public register(): void {
        events.push("register:first");
      }
      public async boot(): Promise<void> {
        events.push("boot:first");
      }
    }
    class Failing extends ServiceProvider {
      public register(): void {
        events.push("register:failure");
        throw failure;
      }
      public async boot(): Promise<void> {
        events.push("boot:failure");
      }
    }
    RegisterProviders.merge([First, Failing]);
    const app = new Application({ basePath: "/project" });
    const results = await Promise.allSettled([
      new ProviderKernel(app).boot(invocation),
      new ProviderKernel(app).boot(invocation),
    ]);
    expect(results).toEqual([
      { status: "rejected", reason: failure },
      { status: "rejected", reason: failure },
    ]);
    await expect(new ProviderKernel(app).boot(invocation)).rejects.toBe(failure);
    expect(events).toEqual(["register:first", "register:failure"]);
    expect(app.hasBeenBootstrapped).toBe(false);
  },
);

test.each(["constructor", "hook"] as const)(
  "bootstrap %s failure is asynchronous shared cached and isolated",
  async (stage) => {
    const failure = new Error(stage);
    const events: string[] = [];
    const started = gate();
    const finish = gate();
    class Failing extends Bootstrapper {
      public constructor() {
        super();
        events.push("constructor");
        if (stage === "constructor") throw failure;
      }
      public async bootstrap(): Promise<void> {
        events.push("hook");
        started.release();
        await finish.promise;
        throw failure;
      }
    }
    class Later extends Bootstrapper {
      public bootstrap(): void {
        events.push("unexpected");
      }
    }
    const app = new Application({ basePath: "/project" });
    const first = app.bootstrapWith([Failing, Later]);
    expect(events).toEqual([]);
    const results = Promise.allSettled([first, app.bootstrapWith([])]);
    if (stage === "hook") {
      await started.promise;
      finish.release();
    }
    expect(await results).toEqual([
      { status: "rejected", reason: failure },
      { status: "rejected", reason: failure },
    ]);
    await expect(new ProviderKernel(app).boot(invocation)).rejects.toBe(failure);
    expect(app.hasBeenBootstrapped).toBe(false);
    expect(events).toEqual(stage === "hook" ? ["constructor", "hook"] : ["constructor"]);
    const other = new Application({ basePath: "/other" });
    await other.bootstrapWith([]);
    expect(other.hasBeenBootstrapped).toBe(true);
  },
);

test("provider boot failure is shared cached and stops later hooks without undoing successful bootstrap", async () => {
  const failure = new Error("boot failure");
  const events: string[] = [];
  class Failing extends ServiceProvider {
    public register(): void {
      events.push("register:first");
    }
    public async boot(): Promise<void> {
      events.push("boot:first");
      throw failure;
    }
  }
  class Later extends ServiceProvider {
    public register(): void {
      events.push("register:later");
    }
    public async boot(): Promise<void> {
      events.push("boot:later");
    }
  }
  RegisterProviders.merge([Failing, Later]);
  const app = new Application({ basePath: "/project" });
  const results = await Promise.allSettled([
    new ProviderKernel(app).boot(invocation),
    new ProviderKernel(app).boot(invocation),
  ]);
  expect(results).toEqual([
    { status: "rejected", reason: failure },
    { status: "rejected", reason: failure },
  ]);
  await expect(app.boot()).rejects.toBe(failure);
  expect(app.hasBeenBootstrapped).toBe(true);
  expect(events).toEqual(["register:first", "register:later", "boot:first"]);
});

test("non-awaited reentrant kernel boot shares initialization", async () => {
  let boots = 0;
  const requests: Promise<void>[] = [];
  class Provider extends ServiceProvider {
    public register(): void {
      requests.push(new ProviderKernel(this.app).boot(invocation));
    }
    public async boot(): Promise<void> {
      boots++;
      requests.push(this.app.boot());
    }
  }
  RegisterProviders.merge([Provider]);
  const app = new Application({ basePath: "/project" });
  await new ProviderKernel(app).boot(invocation);
  await Promise.all(requests);
  expect(boots).toBe(1);
});
