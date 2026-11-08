import { expect, expectTypeOf, test } from "vitest";

import { Application } from "@/foundation/Application";
import { ValueToken } from "@/foundation/Container";
import { Service } from "@/services/Service";

test("registration types require ordinary factories and preserve typed token values", () => {
  class Ordinary {
    public constructor(public readonly argument: string) {}
  }
  const token = new ValueToken<string>("typed");
  const check = (app: Application): void => {
    app.bind(Ordinary, () => new Ordinary("value"));
    app.singleton(Service);
    app.bind(token, async () => "value");
    // @ts-expect-error Ordinary constructors require explicit factories.
    app.bind(Ordinary);
    // @ts-expect-error Factory results must match the token, not widen its type.
    app.singleton(token, () => 42);
    // @ts-expect-error Supplied values must match the token.
    app.instance(token, 42);
  };
  expectTypeOf(check).parameter(0).toEqualTypeOf<Application>();
});

test("singleton factory failures coalesce then retry without caching unsuccessful values", async () => {
  const app = new Application({ basePath: "/project" });
  const token = new ValueToken<number>("retry factory");
  const failure = new Error("factory failed");
  let attempts = 0;
  app.singleton(token, async () => {
    if (++attempts === 1) throw failure;
    return attempts;
  });
  expect(await Promise.allSettled([app.make(token), app.make(token)])).toEqual([
    { status: "rejected", reason: failure },
    { status: "rejected", reason: failure },
  ]);
  expect(await app.make(token)).toBe(2);
  expect(await app.make(token)).toBe(2);
  expect(attempts).toBe(2);
});

test("all registration kinds are strict explicit and keyed by constructor or token identity", async () => {
  const app = new Application({ basePath: "/project" });
  const missing = new ValueToken<string>("value");
  expect(app.bound(missing)).toBe(false);
  await expect(app.make(missing)).rejects.toThrow(/Unbound dependency: value/);
  await expect(app.make(Service)).rejects.toThrow(/Unbound dependency: Service/);
  const first = class SameName {};
  const second = class SameName {};
  app.singleton(first, () => new first());
  app.bind(second, () => new second());
  expect(app.bound(first)).toBe(true);
  expect(app.bound(second)).toBe(true);
  expect(await app.make(first)).not.toBe(await app.make(second));
  const token = new ValueToken<string>("value");
  app.instance(token, "bound");
  expect(app.bound(token)).toBe(true);
  expect(await app.make(token)).toBe("bound");
  expect(app.value(token)).toBe("bound");
  expect(app.bound(missing)).toBe(false);
  expectTypeOf(app.make(token)).toEqualTypeOf<Promise<string>>();
  expect(() => app.instance(token, "replacement")).toThrow(/already bound/);
  expect(() => app.bind(token, () => "replacement")).toThrow(/already bound/);
  expect(() => app.singleton(token, () => "replacement")).toThrow(/already bound/);
  expect(() => app.singleton(first, () => new first())).toThrow(/already bound/);
  expect(() => app.instance(second, new second())).toThrow(/already bound/);
  expect(() => app.singleton(second, () => new second())).toThrow(/already bound/);
});

test("typed sync and async factories receive Application and only Services auto boot", async () => {
  const app = new Application({ basePath: "/project" });
  const owners: Application[] = [];
  class Ordinary {
    public boots = 0;
    public boot(): void {
      this.boots++;
    }
  }
  app.singleton(Ordinary, async (owner) => {
    owners.push(owner);
    return new Ordinary();
  });
  const ordinary = await app.make(Ordinary);
  expect(ordinary.boots).toBe(0);
  expect(await app.make(Ordinary)).toBe(ordinary);
  app.bind(Service, (owner) => {
    owners.push(owner);
    return new Service(owner);
  });
  const first = await app.make(Service);
  const second = await app.make(Service);
  expect(first.isBooted).toBe(true);
  expect(second.isBooted).toBe(true);
  expect(first).not.toBe(second);
  expect(owners).toEqual([app, app, app]);
  const token = new ValueToken<Service>("async service");
  app.singleton(token, async (owner) => new Service(owner));
  expect((await app.make(token)).isBooted).toBe(true);
  expect(() => app.value(token)).toThrow(/synchronous access/);
  const empty = new ValueToken<undefined>("empty");
  let calls = 0;
  app.singleton(empty, () => {
    calls++;
    return undefined;
  });
  await Promise.all([app.make(empty), app.make(empty), app.make(empty)]);
  await app.make(empty);
  expect(calls).toBe(1);
});

test("supplied Service instances must already be booted and are not booted again", async () => {
  const app = new Application({ basePath: "/project" });
  const other = new Application({ basePath: "/other" });
  let boots = 0;
  class Counting extends Service {
    public override async boot(): Promise<void> {
      boots++;
    }
  }
  const unbooted = new Counting(app);
  await unbooted.boot();
  expect(() => app.instance(Counting, unbooted)).toThrow(/must already be booted/);
  expect(app.bound(Counting)).toBe(false);
  app.singleton(Counting);
  const initialized = await app.make(Counting);
  other.instance(Counting, initialized);
  expect(await other.make(Counting)).toBe(initialized);
  const token = new ValueToken<Counting>("booted factory");
  other.singleton(token, () => initialized);
  expect(await other.make(token)).toBe(initialized);
  expect(boots).toBe(2);
});

test("transient and singleton Service lifetimes coexist through explicit typed keys", async () => {
  const app = new Application({ basePath: "/project" });
  let boots = 0;
  class SharedLifetime extends Service {
    public singleton: SharedLifetime | undefined;
    public override async boot(): Promise<void> {
      boots++;
      if (boots > 1) this.singleton = await this.app.make(SharedLifetime);
    }
  }
  const fresh = new ValueToken<SharedLifetime>("fresh");
  app.singleton(SharedLifetime);
  app.bind(fresh, (owner) => new SharedLifetime(owner));
  const singleton = await app.make(SharedLifetime);
  const [first, second] = await Promise.all([app.make(fresh), app.make(fresh)]);
  expect(first).not.toBe(second);
  expect(first).not.toBe(singleton);
  expect(first.singleton).toBe(singleton);
  expect(second.singleton).toBe(singleton);
  expect(first.isBooted).toBe(true);
  expect(second.isBooted).toBe(true);
  expect(boots).toBe(3);
});

test("ordinary asynchronous factory cycles fail across concurrently started singletons", async () => {
  const app = new Application({ basePath: "/project" });
  const first = new ValueToken<string>("first");
  const second = new ValueToken<string>("second");
  app.singleton(first, async (owner) => owner.make(second));
  app.singleton(second, async (owner) => owner.make(first));
  const results = await Promise.allSettled([app.make(first), app.make(second)]);
  for (const result of results) {
    expect(result.status).toBe("rejected");
    if (result.status === "rejected")
      expect(result.reason.message).toMatch(/Circular service dependency/);
  }
});

test("direct service boot does not mark application-managed initialization complete", async () => {
  const app = new Application({ basePath: "/workspaces/project" });
  app.singleton(Service);
  const service = new Service(app);
  expect(service.isBooted).toBe(false);
  await service.boot();
  expect(service.isBooted).toBe(false);
  expect((await app.make(Service)).isBooted).toBe(true);
  expect(service.isBooted).toBe(false);
});

test("singleton retrieval shares delayed boot and exposes only the initialized service", async () => {
  const app = new Application({ basePath: "/workspaces/project" });
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
    public readonly derivedValue = "initialized by the derived constructor";
    public completedValue: string | undefined;

    public override async boot(): Promise<void> {
      bootCount += 1;
      expect(this.isBooted).toBe(false);
      signalBootStarted();
      await bootGate;
      this.completedValue = this.derivedValue;
    }
  }

  app.singleton(DelayedService);

  const firstRequest = app.make(DelayedService);
  const secondRequest = app.make(DelayedService);
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
  const otherApp = new Application({ basePath: "/workspaces/other" });
  expect(Reflect.set(first, "app", otherApp)).toBe(false);
  expect(Reflect.set(first, "isBooted", false)).toBe(false);
  expect(first.app).toBe(app);
  expect(first.isBooted).toBe(true);
  expect(bootCount).toBe(1);
});

test("singleton dependency cycles reject with the service chain", async () => {
  const app = new Application({ basePath: "/workspaces/project" });

  class FirstService extends Service {
    public override async boot(): Promise<void> {
      await this.app.make(SecondService);
    }
  }
  class SecondService extends Service {
    public override async boot(): Promise<void> {
      await this.app.make(FirstService);
    }
  }

  app.singleton(FirstService);
  app.singleton(SecondService);

  await expect(app.make(FirstService)).rejects.toThrow(
    /Circular service dependency: FirstService -> SecondService -> FirstService/,
  );
});

test("fresh-instance dependency cycles reject with the service chain", async () => {
  const app = new Application({ basePath: "/workspaces/project" });

  class FirstFreshService extends Service {
    public override async boot(): Promise<void> {
      await this.app.make(SecondFreshService);
    }
  }
  class SecondFreshService extends Service {
    public override async boot(): Promise<void> {
      await this.app.make(FirstFreshService);
    }
  }

  app.bind(FirstFreshService);
  app.bind(SecondFreshService);

  await expect(app.make(FirstFreshService)).rejects.toThrow(
    /Circular service dependency: FirstFreshService -> SecondFreshService -> FirstFreshService/,
  );
});

test("concurrent services share a non-cyclic singleton dependency", async () => {
  const app = new Application({ basePath: "/workspaces/project" });
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
    public override async boot(): Promise<void> {
      sharedBootCount += 1;
      signalSharedBootStarted();
      await sharedBootGate;
    }
  }
  class FirstBranch extends Service {
    public shared: SharedService | undefined;

    public override async boot(): Promise<void> {
      this.shared = await this.app.make(SharedService);
    }
  }
  class SecondBranch extends Service {
    public shared: SharedService | undefined;

    public override async boot(): Promise<void> {
      this.shared = await this.app.make(SharedService);
    }
  }
  class RootService extends Service {
    public first: FirstBranch | undefined;
    public second: SecondBranch | undefined;

    public override async boot(): Promise<void> {
      [this.first, this.second] = await Promise.all([
        this.app.make(FirstBranch),
        this.app.make(SecondBranch),
      ]);
    }
  }

  app.singleton(SharedService);
  app.singleton(FirstBranch);
  app.singleton(SecondBranch);
  app.singleton(RootService);

  const rootRequest = app.make(RootService);
  await sharedBootStarted;
  releaseSharedBoot();
  const root = await rootRequest;

  expect(root.first?.shared).toBeTruthy();
  expect(root.first?.shared).toBe(root.second?.shared);
  expect(sharedBootCount).toBe(1);
});

test("concurrent singleton branches reject a cycle formed through shared initialization", async () => {
  const app = new Application({ basePath: "/workspaces/project" });

  class SharedService extends Service {
    public override async boot(): Promise<void> {
      await this.app.make(SecondBranch);
    }
  }
  class FirstBranch extends Service {
    public override async boot(): Promise<void> {
      await this.app.make(SharedService);
    }
  }
  class SecondBranch extends Service {
    public override async boot(): Promise<void> {
      await this.app.make(SharedService);
    }
  }
  class RootService extends Service {
    public override async boot(): Promise<void> {
      await Promise.all([this.app.make(FirstBranch), this.app.make(SecondBranch)]);
    }
  }

  app.singleton(SharedService);
  app.singleton(FirstBranch);
  app.singleton(SecondBranch);
  app.singleton(RootService);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error("Service resolution timed out")), 1_000);
  });
  try {
    await expect(Promise.race([app.make(RootService), timedOut])).rejects.toThrow(
      /Circular service dependency: SharedService -> SecondBranch -> SharedService/,
    );
  } finally {
    if (timeout) clearTimeout(timeout);
  }
});

test("failed singleton boot propagates and a later request creates a fresh usable instance", async () => {
  const app = new Application({ basePath: "/workspaces/project" });
  const bootFailure = new Error("boot did not complete");
  let bootCount = 0;
  const attempts: RetryService[] = [];

  class RetryService extends Service {
    public constructor(owner: Application) {
      super(owner);
      attempts.push(this);
    }

    public override async boot(): Promise<void> {
      bootCount += 1;
      if (bootCount === 1) throw bootFailure;
    }
  }

  app.singleton(RetryService);

  await expect(app.make(RetryService)).rejects.toBe(bootFailure);
  expect(attempts[0]?.isBooted).toBe(false);

  const retry = await app.make(RetryService);
  expect(retry).not.toBe(attempts[0]);
  expect(retry.isBooted).toBe(true);
  expect(await app.make(RetryService)).toBe(retry);
  expect(bootCount).toBe(2);
});

test("the base service boots asynchronously and singleton state is application-local", async () => {
  const firstApp = new Application({ basePath: "/workspaces/first" });
  firstApp.singleton(Service);
  const secondApp = new Application({ basePath: "/workspaces/second" });
  secondApp.singleton(Service);

  const firstRequest = firstApp.make(Service);
  const secondRequest = secondApp.make(Service);
  expect(firstRequest).toBeInstanceOf(Promise);
  expect(secondRequest).toBeInstanceOf(Promise);

  const [first, second] = await Promise.all([firstRequest, secondRequest]);
  expect(first).not.toBe(second);
  expect(first.app).toBe(firstApp);
  expect(second.app).toBe(secondApp);
  expect(first.isBooted).toBe(true);
  expect(second.isBooted).toBe(true);
  expect(await firstApp.make(Service)).toBe(first);
  expect(await secondApp.make(Service)).toBe(second);
});
