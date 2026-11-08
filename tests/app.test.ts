import { expect, test } from "vitest";

import { App, Service } from "@/app";

test("applications retain their own immutable explicit roots", () => {
  const first = new App({
    workspaceRoot: "/workspaces/first",
    blueprintSourceRoot: "/blueprints/first",
  });
  const second = new App({
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

test("singleton retrieval shares delayed boot and exposes only the initialized service", async () => {
  const app = new App({
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
  expect(first).not.toBeInstanceOf(App);
  expect(first.completedValue).toBe("initialized by the derived constructor");
  expect(first.isBooted).toBe(true);
  const otherApp = new App({
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
  const app = new App({
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
  const app = new App({
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
  const app = new App({
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
  const app = new App({
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
  const app = new App({
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
  const app = new App({
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
  const app = new App({
    workspaceRoot: "/workspaces/project",
    blueprintSourceRoot: "/blueprints/source",
  });
  const bootFailure = new Error("boot did not complete");
  let bootCount = 0;
  const attempts: RetryService[] = [];

  class RetryService extends Service {
    constructor(owner: App) {
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
  const firstApp = new App({
    workspaceRoot: "/workspaces/first",
    blueprintSourceRoot: "/blueprints/first",
  });
  const secondApp = new App({
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
