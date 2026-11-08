import { expect, test } from "vitest";

import { Config } from "@/config/Config";
import { Application, type ServiceProviderConstructor } from "@/foundation/Application";
import { Bootstrapper, type BootstrapperConstructor } from "@/foundation/bootstrap/Bootstrapper";
import { RegisterProviders } from "@/foundation/bootstrap/RegisterProviders";
import { Kernel } from "@/foundation/Kernel";
import { Service } from "@/services/Service";
import { ServiceProvider } from "@/services/ServiceProvider";

function gate(): { promise: Promise<void>; release: () => void } {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

test("applications own empty isolated configuration available throughout provider construction and lifecycle", async () => {
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
  const options = {
    workspaceRoot: "/project",
    blueprintSourceRoot: "/blueprints",
    providers: [Provider],
  };
  const app = new Application(options);
  const other = new Application(options);
  expect(configurations).toEqual([app.config, other.config]);
  expect(app.config).not.toBe(other.config);
  app.config.set("isolated", "first");
  expect(other.config.has("isolated")).toBe(false);
  app.registerProviders();
  await app.boot();
  expect(app.config.array("provider.events")).toEqual(["boot"]);
  expect(other.config.has("provider.events")).toBe(false);
  expect(other.config.has("provider.registered")).toBe(false);
  const empty = new Application({ workspaceRoot: "/empty", blueprintSourceRoot: "/blueprints" });
  expect(empty.config.has("provider")).toBe(false);
  expect(empty.config.get("isolated")).toBeUndefined();
});

test("default kernel bootstrap registers providers without booting them", async () => {
  const events: string[] = [];
  class Provider extends ServiceProvider {
    public register(): void {
      events.push("register");
    }

    public async boot(): Promise<void> {
      events.push("boot");
    }
  }
  const app = new Application({
    workspaceRoot: "/project",
    blueprintSourceRoot: "/blueprints",
    providers: [Provider],
  });
  const kernel = new Kernel(app);
  expect(kernel.app).toBe(app);
  expect(app.hasBeenBootstrapped).toBe(false);
  expect(Reflect.set(app, "hasBeenBootstrapped", true)).toBe(false);

  await kernel.bootstrap();
  expect(app.hasBeenBootstrapped).toBe(true);
  expect(events).toEqual(["register"]);
  await kernel.bootstrap();
  app.registerProviders();
  expect(events).toEqual(["register"]);
  await kernel.boot();
  await new Kernel(app).boot();
  expect(events).toEqual(["register", "boot"]);
});

test("extended kernels directly construct and sequentially await independent bootstrappers", async () => {
  const events: string[] = [];
  const firstStarted = gate();
  const firstFinished = gate();
  const secondStarted = gate();
  const secondFinished = gate();
  const instances: Bootstrapper[] = [];
  const owners: Application[] = [];
  class Provider extends ServiceProvider {
    public register(): void {
      events.push("register");
    }

    public async boot(): Promise<void> {
      events.push("boot");
    }
  }
  class First extends Bootstrapper {
    public constructor() {
      super();
      instances.push(this);
      events.push("construct:first");
    }

    public async bootstrap(application: Application): Promise<void> {
      owners.push(application);
      events.push("start:first");
      firstStarted.release();
      await firstFinished.promise;
      events.push("end:first");
    }
  }
  class Second extends Bootstrapper {
    public constructor() {
      super();
      instances.push(this);
      events.push("construct:second");
    }

    public async bootstrap(application: Application): Promise<void> {
      owners.push(application);
      events.push("start:second");
      secondStarted.release();
      await secondFinished.promise;
      events.push("end:second");
    }
  }
  class ExtendedKernel extends Kernel {
    protected override bootstrappers(): readonly BootstrapperConstructor[] {
      return [...super.bootstrappers(), First, Second];
    }
  }
  const app = new Application({
    workspaceRoot: "/project",
    blueprintSourceRoot: "/blueprints",
    providers: [Provider],
  });
  const firstKernel = new ExtendedKernel(app);
  const secondKernel = new ExtendedKernel(app);
  let completions = 0;
  const requests = [
    firstKernel.boot(),
    secondKernel.boot(),
    secondKernel.bootstrap(),
    app.bootstrapWith([RegisterProviders, First, Second]),
  ].map((request) => request.then(() => completions++));
  await firstStarted.promise;
  expect(events).toEqual(["register", "construct:first", "start:first"]);
  expect(app.hasBeenBootstrapped).toBe(false);
  expect(completions).toBe(0);
  firstFinished.release();
  await secondStarted.promise;
  expect(events).toEqual([
    "register",
    "construct:first",
    "start:first",
    "end:first",
    "construct:second",
    "start:second",
  ]);
  expect(app.hasBeenBootstrapped).toBe(false);
  expect(completions).toBe(0);
  secondFinished.release();
  await Promise.all(requests);
  expect(app.hasBeenBootstrapped).toBe(true);
  expect(events.slice(-2)).toEqual(["end:second", "boot"]);
  expect(owners).toEqual([app, app]);
  expect(instances).toHaveLength(2);
  for (const instance of instances) expect(instance).not.toBeInstanceOf(Service);
  await firstKernel.boot();
  expect(completions).toBe(4);
  expect(instances).toHaveLength(2);
});

test("the application owns the first bootstrap list and isolates separate applications", async () => {
  const owners: Application[] = [];
  let unexpectedConstructions = 0;
  class First extends Bootstrapper {
    public bootstrap(application: Application): void {
      owners.push(application);
    }
  }
  class Unexpected extends Bootstrapper {
    public constructor() {
      super();
      unexpectedConstructions++;
    }

    public bootstrap(): void {}
  }
  class OtherKernel extends Kernel {
    protected override bootstrappers(): readonly BootstrapperConstructor[] {
      return [Unexpected];
    }
  }
  const app = new Application({ workspaceRoot: "/first", blueprintSourceRoot: "/blueprints" });
  const other = new Application({ workspaceRoot: "/second", blueprintSourceRoot: "/blueprints" });
  const list: BootstrapperConstructor[] = [RegisterProviders, First];
  const first = app.bootstrapWith(list);
  list.splice(0, list.length, Unexpected);
  await Promise.all([first, new OtherKernel(app).bootstrap()]);
  await new OtherKernel(app).boot();
  expect(owners).toEqual([app]);
  expect(unexpectedConstructions).toBe(0);
  expect(other.hasBeenBootstrapped).toBe(false);
  await other.bootstrapWith([RegisterProviders, First]);
  expect(owners).toEqual([app, other]);
});

test("premature boot rejects without poisoning later registered initialization", async () => {
  const events: string[] = [];
  const premature: Promise<void>[] = [];
  class Provider extends ServiceProvider {
    public register(): void {
      events.push("register");
      premature.push(this.app.boot());
      expect(() => this.app.registerProviders()).toThrow(/already in progress/);
    }

    public async boot(): Promise<void> {
      events.push("boot");
    }
  }
  const app = new Application({
    workspaceRoot: "/project",
    blueprintSourceRoot: "/blueprints",
    providers: [Provider],
  });
  await expect(app.boot()).rejects.toThrow(/must be registered/);
  expect(events).toEqual([]);
  app.registerProviders();
  expect(events).toEqual(["register"]);
  await expect(premature[0]).rejects.toThrow(/must be registered/);
  expect(app.hasBeenBootstrapped).toBe(false);
  await Promise.all([app.boot(), app.boot()]);
  expect(events).toEqual(["register", "boot"]);
});

test("empty bootstrap lists complete but do not implicitly register providers", async () => {
  const app = new Application({ workspaceRoot: "/project", blueprintSourceRoot: "/blueprints" });
  const bootstrap = app.bootstrapWith([]);
  expect(app.hasBeenBootstrapped).toBe(false);
  await bootstrap;
  expect(app.hasBeenBootstrapped).toBe(true);
  await expect(app.boot()).rejects.toThrow(/must be registered/);
  await expect(new Kernel(app).boot()).rejects.toThrow(/must be registered/);
  app.registerProviders();
  await expect(new Kernel(app).boot()).resolves.toBeUndefined();
});

test.each([new Error("registration failed"), undefined])(
  "synchronous registration caches even non-Error failures (%j)",
  async (failure) => {
    let registrations = 0;
    let boots = 0;
    class Provider extends ServiceProvider {
      public register(): void {
        registrations++;
        throw failure;
      }

      public async boot(): Promise<void> {
        boots++;
      }
    }
    const app = new Application({
      workspaceRoot: "/project",
      blueprintSourceRoot: "/blueprints",
      providers: [Provider],
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      let threw = false;
      try {
        app.registerProviders();
      } catch (error) {
        threw = true;
        expect(error).toBe(failure);
      }
      expect(threw).toBe(true);
    }
    await expect(new Kernel(app).bootstrap()).rejects.toBe(failure);
    await expect(new Kernel(app).boot()).rejects.toBe(failure);
    await expect(app.boot()).rejects.toBe(failure);
    expect(app.hasBeenBootstrapped).toBe(false);
    expect(registrations).toBe(1);
    expect(boots).toBe(0);
  },
);

test("failed asynchronous bootstrap is shared across kernels and never completes or retries", async () => {
  const failure = new Error("bootstrap failed");
  const started = gate();
  const finish = gate();
  const events: string[] = [];
  class Failing extends Bootstrapper {
    public constructor() {
      super();
      events.push("construct");
    }

    public async bootstrap(application: Application): Promise<void> {
      expect(application.hasBeenBootstrapped).toBe(false);
      events.push("start");
      started.release();
      await finish.promise;
      throw failure;
    }
  }
  class Later extends Bootstrapper {
    public constructor() {
      super();
      events.push("unexpected");
    }

    public bootstrap(): void {}
  }
  class FailingKernel extends Kernel {
    protected override bootstrappers(): readonly BootstrapperConstructor[] {
      return [Failing, RegisterProviders, Later];
    }
  }
  const app = new Application({ workspaceRoot: "/project", blueprintSourceRoot: "/blueprints" });
  const results = Promise.allSettled([
    new FailingKernel(app).bootstrap(),
    new FailingKernel(app).boot(),
  ]);
  await started.promise;
  expect(app.hasBeenBootstrapped).toBe(false);
  await expect(app.boot()).rejects.toThrow(/must be registered/);
  const concurrent = expect(app.bootstrapWith([Later])).rejects.toBe(failure);
  finish.release();
  expect(await results).toEqual([
    { status: "rejected", reason: failure },
    { status: "rejected", reason: failure },
  ]);
  await concurrent;
  await expect(new Kernel(app).boot()).rejects.toBe(failure);
  await expect(app.bootstrapWith([])).rejects.toBe(failure);
  expect(app.hasBeenBootstrapped).toBe(false);
  expect(events).toEqual(["construct", "start"]);
  expect((await app.get(Service)).isBooted).toBe(true);
});

test("bootstrapper constructor failures reject asynchronously and are cached", async () => {
  const failure = new Error("construction failed");
  let constructions = 0;
  class Failing extends Bootstrapper {
    public constructor() {
      super();
      constructions++;
      throw failure;
    }

    public bootstrap(): void {}
  }
  const app = new Application({ workspaceRoot: "/project", blueprintSourceRoot: "/blueprints" });
  const first = app.bootstrapWith([Failing]);
  expect(first).toBeInstanceOf(Promise);
  expect(constructions).toBe(0);
  const results = await Promise.allSettled([first, app.bootstrapWith([Failing])]);
  expect(results).toEqual([
    { status: "rejected", reason: failure },
    { status: "rejected", reason: failure },
  ]);
  await expect(new Kernel(app).boot()).rejects.toBe(failure);
  expect(constructions).toBe(1);
  expect(app.hasBeenBootstrapped).toBe(false);
});

test("applications retain their own immutable explicit roots", () => {
  const first = new Application({
    workspaceRoot: "/workspaces/first",
    blueprintSourceRoot: "/blueprints/first",
  });
  const second = new Application({
    workspaceRoot: "/workspaces/second",
    blueprintSourceRoot: "/blueprints/second",
  });

  expect(first.workspaceRoot).toBe("/workspaces/first");
  expect(first.blueprintSourceRoot).toBe("/blueprints/first");
  expect(second.workspaceRoot).toBe("/workspaces/second");
  expect(second.blueprintSourceRoot).toBe("/blueprints/second");
  expect(first).not.toBe(second);

  expect(Reflect.set(first, "workspaceRoot", "/workspaces/changed")).toBe(false);
  expect(Reflect.set(first, "blueprintSourceRoot", "/blueprints/changed")).toBe(false);
  expect(first.workspaceRoot).toBe("/workspaces/first");
  expect(first.blueprintSourceRoot).toBe("/blueprints/first");
});

test("application providers all register before booting in supplied order", async () => {
  const events: string[] = [];

  class FirstProvider extends ServiceProvider {
    public register(): void {
      events.push("register:first");
    }

    public async boot(): Promise<void> {
      events.push("boot:first");
    }
  }
  class SecondProvider extends ServiceProvider {
    public register(): void {
      events.push("register:second");
    }

    public async boot(): Promise<void> {
      events.push("boot:second");
    }
  }
  class ThirdProvider extends ServiceProvider {
    public register(): void {
      events.push("register:third");
    }

    public async boot(): Promise<void> {
      events.push("boot:third");
    }
  }

  const app = new Application({
    workspaceRoot: "/workspaces/project",
    blueprintSourceRoot: "/blueprints/source",
    providers: Object.freeze([FirstProvider, SecondProvider, ThirdProvider]),
  });
  expect(events).toEqual([]);

  await new Kernel(app).boot();

  expect(events).toEqual([
    "register:first",
    "register:second",
    "register:third",
    "boot:first",
    "boot:second",
    "boot:third",
  ]);
});

test("providers are constructed once per owning application and cannot be added through options", async () => {
  const instances: OwnedProvider[] = [];
  const registered: Application[] = [];
  const booted: Application[] = [];

  class OwnedProvider extends ServiceProvider {
    public constructor(app: Application) {
      super(app);
      expect(this.app.workspaceRoot).toBe(app.workspaceRoot);
      expect(this.app.blueprintSourceRoot).toBe(app.blueprintSourceRoot);
      instances.push(this);
    }

    public register(): void {
      registered.push(this.app);
    }

    public async boot(): Promise<void> {
      booted.push(this.app);
      expect((await this.app.get(Service)).app).toBe(this.app);
    }
  }
  const providers: ServiceProviderConstructor[] = [OwnedProvider];
  const first = new Application({
    workspaceRoot: "/workspaces/first",
    blueprintSourceRoot: "/blueprints/first",
    providers,
  });
  const second = new Application({
    workspaceRoot: "/workspaces/second",
    blueprintSourceRoot: "/blueprints/second",
    providers,
  });

  expect(instances).toHaveLength(2);
  expect(instances[0]).not.toBe(instances[1]);
  expect(instances[0]?.app).toBe(first);
  expect(instances[1]?.app).toBe(second);
  expect(Reflect.set(instances[0]!, "app", second)).toBe(false);
  expect(instances[0]?.app).toBe(first);
  providers.push(OwnedProvider);

  await new Kernel(first).boot();
  expect(registered).toEqual([first]);
  expect(booted).toEqual([first]);
  providers.length = 0;
  await new Kernel(second).boot();
  await Promise.all([first.boot(), second.boot()]);
  expect(registered).toEqual([first, second]);
  expect(booted).toEqual([first, second]);
  expect(instances).toHaveLength(2);
  expect(await first.get(Service)).not.toBe(await second.get(Service));
});

test("application boot awaits each asynchronous provider before starting the next", async () => {
  const events: string[] = [];
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let signalFirstStarted!: () => void;
  const firstStarted = new Promise<void>((resolve) => {
    signalFirstStarted = resolve;
  });
  let releaseSecond!: () => void;
  const secondGate = new Promise<void>((resolve) => {
    releaseSecond = resolve;
  });
  let signalSecondStarted!: () => void;
  const secondStarted = new Promise<void>((resolve) => {
    signalSecondStarted = resolve;
  });

  class FirstProvider extends ServiceProvider {
    public register(): void {
      events.push("register:first");
    }

    public async boot(): Promise<void> {
      events.push("start:first");
      signalFirstStarted();
      await firstGate;
      events.push("end:first");
    }
  }
  class SecondProvider extends ServiceProvider {
    public register(): void {
      events.push("register:second");
    }

    public async boot(): Promise<void> {
      events.push("start:second");
      signalSecondStarted();
      await secondGate;
      events.push("end:second");
    }
  }
  const app = new Application({
    workspaceRoot: "/workspaces/project",
    blueprintSourceRoot: "/blueprints/source",
    providers: [FirstProvider, SecondProvider],
  });
  let settled = false;
  app.registerProviders();
  const request = app.boot().then(() => {
    settled = true;
  });

  await firstStarted;
  expect(events).toEqual(["register:first", "register:second", "start:first"]);
  expect(settled).toBe(false);
  releaseFirst();
  await secondStarted;
  expect(events).toEqual([
    "register:first",
    "register:second",
    "start:first",
    "end:first",
    "start:second",
  ]);
  expect(settled).toBe(false);
  releaseSecond();
  await request;
  expect(events.at(-1)).toBe("end:second");
  expect(settled).toBe(true);
});

test("concurrent and reentrant application boot calls share one initialization", async () => {
  let constructions = 0;
  let registrations = 0;
  let boots = 0;
  let completions = 0;
  let releaseBoot!: () => void;
  const bootGate = new Promise<void>((resolve) => {
    releaseBoot = resolve;
  });
  let signalBootStarted!: () => void;
  const bootStarted = new Promise<void>((resolve) => {
    signalBootStarted = resolve;
  });
  const reentrantRequests: Promise<void>[] = [];

  class OnceProvider extends ServiceProvider {
    public constructor(app: Application) {
      super(app);
      constructions += 1;
    }

    public register(): void {
      registrations += 1;
      reentrantRequests.push(new Kernel(this.app).boot());
    }

    public async boot(): Promise<void> {
      boots += 1;
      signalBootStarted();
      await bootGate;
      completions += 1;
    }
  }
  const app = new Application({
    workspaceRoot: "/workspaces/project",
    blueprintSourceRoot: "/blueprints/source",
    providers: [OnceProvider],
  });
  const first = new Kernel(app).boot();
  const second = new Kernel(app).boot();
  let settled = 0;
  const observed = [first, second].map((request) =>
    request.then(() => {
      settled += 1;
    }),
  );

  await bootStarted;
  const third = app.boot();
  expect(settled).toBe(0);
  expect(constructions).toBe(1);
  expect(registrations).toBe(1);
  expect(boots).toBe(1);
  expect(completions).toBe(0);
  releaseBoot();
  await Promise.all([...observed, third, ...reentrantRequests]);
  await app.boot();
  expect(settled).toBe(2);
  expect(constructions).toBe(1);
  expect(registrations).toBe(1);
  expect(boots).toBe(1);
  expect(completions).toBe(1);
});

test("registration failures reject every application boot call without booting or retrying", async () => {
  const failure = new Error("registration failed");
  const events: string[] = [];

  class FirstProvider extends ServiceProvider {
    public register(): void {
      events.push("register:first");
    }

    public async boot(): Promise<void> {
      events.push("boot:first");
    }
  }
  class FailingProvider extends ServiceProvider {
    public register(): void {
      events.push("register:failure");
      throw failure;
    }

    public async boot(): Promise<void> {
      events.push("boot:failure");
    }
  }
  class LaterProvider extends ServiceProvider {
    public register(): void {
      events.push("register:later");
    }

    public async boot(): Promise<void> {
      events.push("boot:later");
    }
  }
  const app = new Application({
    workspaceRoot: "/workspaces/project",
    blueprintSourceRoot: "/blueprints/source",
    providers: [FirstProvider, FailingProvider, LaterProvider],
  });

  const results = await Promise.allSettled([new Kernel(app).boot(), new Kernel(app).boot()]);
  expect(results).toEqual([
    { status: "rejected", reason: failure },
    { status: "rejected", reason: failure },
  ]);
  await expect(app.boot()).rejects.toBe(failure);
  expect(events).toEqual(["register:first", "register:failure"]);
});

test("provider boot failures are shared, stop later hooks, and never retry initialization", async () => {
  const failure = new Error("provider boot failed");
  const events: string[] = [];
  let rejectBoot!: (reason: Error) => void;
  const bootGate = new Promise<void>((_resolve, reject) => {
    rejectBoot = reject;
  });
  let signalBootStarted!: () => void;
  const bootStarted = new Promise<void>((resolve) => {
    signalBootStarted = resolve;
  });

  class FirstProvider extends ServiceProvider {
    public register(): void {
      events.push("register:first");
    }

    public async boot(): Promise<void> {
      events.push("boot:first");
    }
  }
  class FailingProvider extends ServiceProvider {
    public register(): void {
      events.push("register:failure");
    }

    public async boot(): Promise<void> {
      events.push("boot:failure");
      signalBootStarted();
      await bootGate;
    }
  }
  class LaterProvider extends ServiceProvider {
    public register(): void {
      events.push("register:later");
    }

    public async boot(): Promise<void> {
      events.push("boot:later");
    }
  }
  const app = new Application({
    workspaceRoot: "/workspaces/project",
    blueprintSourceRoot: "/blueprints/source",
    providers: [FirstProvider, FailingProvider, LaterProvider],
  });
  const first = new Kernel(app).boot();
  const second = new Kernel(app).boot();
  const results = Promise.allSettled([first, second]);
  await bootStarted;
  expect(app.hasBeenBootstrapped).toBe(true);
  const third = new Kernel(app).boot();
  const thirdRejection = expect(third).rejects.toBe(failure);
  rejectBoot(failure);

  expect(await results).toEqual([
    { status: "rejected", reason: failure },
    { status: "rejected", reason: failure },
  ]);
  await thirdRejection;
  await expect(app.boot()).rejects.toBe(failure);
  await expect(new Kernel(app).boot()).rejects.toBe(failure);
  expect(app.hasBeenBootstrapped).toBe(true);
  expect(events).toEqual([
    "register:first",
    "register:failure",
    "register:later",
    "boot:first",
    "boot:failure",
  ]);
});

test.each([undefined, []] as const)(
  "application boot with providers %j is an asynchronous no-op",
  async (providers) => {
    const app = new Application({
      workspaceRoot: "/workspaces/project",
      blueprintSourceRoot: "/blueprints/source",
      providers,
    });
    const first = new Kernel(app).boot();
    expect(first).toBeInstanceOf(Promise);
    expect(await Promise.all([first, new Kernel(app).boot()])).toEqual([undefined, undefined]);
    await expect(app.boot()).resolves.toBeUndefined();
    const singleton = await app.get(Service);
    const fresh = await app.create(Service);
    expect(singleton.isBooted).toBe(true);
    expect(fresh.isBooted).toBe(true);
    expect(fresh).not.toBe(singleton);
  },
);

test("direct service boot does not mark application-managed initialization complete", async () => {
  const app = new Application({
    workspaceRoot: "/workspaces/project",
    blueprintSourceRoot: "/blueprints/source",
  });
  const service = new Service(app);
  expect(service.isBooted).toBe(false);
  await service.boot();
  expect(service.isBooted).toBe(false);
  expect((await app.get(Service)).isBooted).toBe(true);
  expect(service.isBooted).toBe(false);
});

test("singleton retrieval shares delayed boot and exposes only the initialized service", async () => {
  const app = new Application({
    workspaceRoot: "/workspaces/project",
    blueprintSourceRoot: "/blueprints/source",
  });
  let releaseBoot!: () => void;
  const bootGate = new Promise<void>((resolve) => {
    releaseBoot = resolve;
  });
  let signalBootStarted!: () => void;
  const bootStarted = new Promise<void>((resolve) => {
    signalBootStarted = resolve;
  });
  let bootCount = 0;

  class DelayedService extends Service {
    readonly derivedValue = "initialized by the derived constructor";
    completedValue: string | undefined;

    override async boot(): Promise<void> {
      bootCount += 1;
      expect(this.isBooted).toBe(false);
      signalBootStarted();
      await bootGate;
      this.completedValue = this.derivedValue;
    }
  }

  const firstRequest = app.get(DelayedService);
  const secondRequest = app.get(DelayedService);
  let firstRequestSettled = false;
  void firstRequest.then(() => {
    firstRequestSettled = true;
  });

  await bootStarted;
  await Promise.resolve();
  expect(firstRequestSettled).toBe(false);
  releaseBoot();

  const [first, second] = await Promise.all([firstRequest, secondRequest]);
  expect(first).toBe(second);
  expect(first.app).toBe(app);
  expect(first).not.toBeInstanceOf(Application);
  expect(first.completedValue).toBe("initialized by the derived constructor");
  expect(first.isBooted).toBe(true);
  const otherApp = new Application({
    workspaceRoot: "/workspaces/other",
    blueprintSourceRoot: "/blueprints/other",
  });
  expect(Reflect.set(first, "app", otherApp)).toBe(false);
  expect(Reflect.set(first, "isBooted", false)).toBe(false);
  expect(first.app).toBe(app);
  expect(first.isBooted).toBe(true);
  expect(bootCount).toBe(1);
});

test("create returns distinct booted services without registering them as the singleton", async () => {
  const app = new Application({
    workspaceRoot: "/workspaces/project",
    blueprintSourceRoot: "/blueprints/source",
  });
  let bootCount = 0;

  class FreshService extends Service {
    override async boot(): Promise<void> {
      bootCount += 1;
    }
  }

  const firstCreation = app.create(FreshService);
  const secondCreation = app.create(FreshService);
  expect(firstCreation).toBeInstanceOf(Promise);
  expect(secondCreation).toBeInstanceOf(Promise);

  const [first, second] = await Promise.all([firstCreation, secondCreation]);
  const singleton = await app.get(FreshService);

  expect(first).not.toBe(second);
  expect(first).not.toBe(singleton);
  expect(second).not.toBe(singleton);
  expect(first.isBooted).toBe(true);
  expect(second.isBooted).toBe(true);
  expect(singleton.isBooted).toBe(true);
  expect(await app.get(FreshService)).toBe(singleton);
  expect(bootCount).toBe(3);
});

test("fresh service boot can retrieve its already-initialized same-type singleton", async () => {
  const app = new Application({
    workspaceRoot: "/workspaces/project",
    blueprintSourceRoot: "/blueprints/source",
  });
  let bootCount = 0;

  class SharedLifetimeService extends Service {
    singleton: SharedLifetimeService | undefined;

    override async boot(): Promise<void> {
      bootCount += 1;
      if (bootCount > 1) {
        this.singleton = await this.app.get(SharedLifetimeService);
        expect(this.singleton.isBooted).toBe(true);
      }
    }
  }

  const singleton = await app.get(SharedLifetimeService);
  expect(singleton.isBooted).toBe(true);

  const fresh = await app.create(SharedLifetimeService);
  expect(fresh).not.toBe(singleton);
  expect(fresh.singleton).toBe(singleton);
  expect(fresh.isBooted).toBe(true);
  expect(await app.get(SharedLifetimeService)).toBe(singleton);
  expect(bootCount).toBe(2);
});

test("singleton dependency cycles reject with the service chain", async () => {
  const app = new Application({
    workspaceRoot: "/workspaces/project",
    blueprintSourceRoot: "/blueprints/source",
  });

  class FirstService extends Service {
    override async boot(): Promise<void> {
      await this.app.get(SecondService);
    }
  }
  class SecondService extends Service {
    override async boot(): Promise<void> {
      await this.app.get(FirstService);
    }
  }

  await expect(app.get(FirstService)).rejects.toThrow(
    /Circular service dependency: FirstService -> SecondService -> FirstService/,
  );
});

test("fresh-instance dependency cycles reject with the service chain", async () => {
  const app = new Application({
    workspaceRoot: "/workspaces/project",
    blueprintSourceRoot: "/blueprints/source",
  });

  class FirstFreshService extends Service {
    override async boot(): Promise<void> {
      await this.app.create(SecondFreshService);
    }
  }
  class SecondFreshService extends Service {
    override async boot(): Promise<void> {
      await this.app.create(FirstFreshService);
    }
  }

  await expect(app.create(FirstFreshService)).rejects.toThrow(
    /Circular service dependency: FirstFreshService -> SecondFreshService -> FirstFreshService/,
  );
});

test("concurrent services share a non-cyclic singleton dependency", async () => {
  const app = new Application({
    workspaceRoot: "/workspaces/project",
    blueprintSourceRoot: "/blueprints/source",
  });
  let releaseSharedBoot!: () => void;
  const sharedBootGate = new Promise<void>((resolve) => {
    releaseSharedBoot = resolve;
  });
  let signalSharedBootStarted!: () => void;
  const sharedBootStarted = new Promise<void>((resolve) => {
    signalSharedBootStarted = resolve;
  });
  let sharedBootCount = 0;

  class SharedService extends Service {
    override async boot(): Promise<void> {
      sharedBootCount += 1;
      signalSharedBootStarted();
      await sharedBootGate;
    }
  }
  class FirstBranch extends Service {
    shared: SharedService | undefined;

    override async boot(): Promise<void> {
      this.shared = await this.app.get(SharedService);
    }
  }
  class SecondBranch extends Service {
    shared: SharedService | undefined;

    override async boot(): Promise<void> {
      this.shared = await this.app.get(SharedService);
    }
  }
  class RootService extends Service {
    first: FirstBranch | undefined;
    second: SecondBranch | undefined;

    override async boot(): Promise<void> {
      [this.first, this.second] = await Promise.all([
        this.app.get(FirstBranch),
        this.app.get(SecondBranch),
      ]);
    }
  }

  const rootRequest = app.get(RootService);
  await sharedBootStarted;
  releaseSharedBoot();
  const root = await rootRequest;

  expect(root.first?.shared).toBeTruthy();
  expect(root.first?.shared).toBe(root.second?.shared);
  expect(sharedBootCount).toBe(1);
});

test("concurrent singleton branches reject a cycle formed through shared initialization", async () => {
  const app = new Application({
    workspaceRoot: "/workspaces/project",
    blueprintSourceRoot: "/blueprints/source",
  });

  class SharedService extends Service {
    override async boot(): Promise<void> {
      await this.app.get(SecondBranch);
    }
  }
  class FirstBranch extends Service {
    override async boot(): Promise<void> {
      await this.app.get(SharedService);
    }
  }
  class SecondBranch extends Service {
    override async boot(): Promise<void> {
      await this.app.get(SharedService);
    }
  }
  class RootService extends Service {
    override async boot(): Promise<void> {
      await Promise.all([this.app.get(FirstBranch), this.app.get(SecondBranch)]);
    }
  }

  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error("Service resolution timed out")), 1_000);
  });
  try {
    await expect(Promise.race([app.get(RootService), timedOut])).rejects.toThrow(
      /Circular service dependency: SharedService -> SecondBranch -> SharedService/,
    );
  } finally {
    if (timeout) clearTimeout(timeout);
  }
});

test("failed singleton boot propagates and a later request creates a fresh usable instance", async () => {
  const app = new Application({
    workspaceRoot: "/workspaces/project",
    blueprintSourceRoot: "/blueprints/source",
  });
  const bootFailure = new Error("boot did not complete");
  let bootCount = 0;
  const attempts: RetryService[] = [];

  class RetryService extends Service {
    constructor(owner: Application) {
      super(owner);
      attempts.push(this);
    }

    override async boot(): Promise<void> {
      bootCount += 1;
      if (bootCount === 1) throw bootFailure;
    }
  }

  await expect(app.get(RetryService)).rejects.toBe(bootFailure);
  expect(attempts[0]?.isBooted).toBe(false);

  const retry = await app.get(RetryService);
  expect(retry).not.toBe(attempts[0]);
  expect(retry.isBooted).toBe(true);
  expect(await app.get(RetryService)).toBe(retry);
  expect(bootCount).toBe(2);
});

test("the base service boots asynchronously and singleton state is application-local", async () => {
  const firstApp = new Application({
    workspaceRoot: "/workspaces/first",
    blueprintSourceRoot: "/blueprints/first",
  });
  const secondApp = new Application({
    workspaceRoot: "/workspaces/second",
    blueprintSourceRoot: "/blueprints/second",
  });

  const firstRequest = firstApp.get(Service);
  const secondRequest = secondApp.get(Service);
  expect(firstRequest).toBeInstanceOf(Promise);
  expect(secondRequest).toBeInstanceOf(Promise);

  const [first, second] = await Promise.all([firstRequest, secondRequest]);
  expect(first).not.toBe(second);
  expect(first.app).toBe(firstApp);
  expect(second.app).toBe(secondApp);
  expect(first.isBooted).toBe(true);
  expect(second.isBooted).toBe(true);
  expect(await firstApp.get(Service)).toBe(first);
  expect(await secondApp.get(Service)).toBe(second);
});
