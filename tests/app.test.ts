import assert from "node:assert/strict";
import { test } from "vitest";

import { App, Service } from "../src/app.ts";

test("applications retain their own immutable explicit roots", () => {
  const first = new App({
    workspaceRoot: "/workspaces/first",
    blueprintSourceRoot: "/blueprints/first",
  });
  const second = new App({
    workspaceRoot: "/workspaces/second",
    blueprintSourceRoot: "/blueprints/second",
  });

  assert.equal(first.workspaceRoot, "/workspaces/first");
  assert.equal(first.blueprintSourceRoot, "/blueprints/first");
  assert.equal(second.workspaceRoot, "/workspaces/second");
  assert.equal(second.blueprintSourceRoot, "/blueprints/second");
  assert.notEqual(first, second);

  assert.equal(Reflect.set(first, "workspaceRoot", "/workspaces/changed"), false);
  assert.equal(Reflect.set(first, "blueprintSourceRoot", "/blueprints/changed"), false);
  assert.equal(first.workspaceRoot, "/workspaces/first");
  assert.equal(first.blueprintSourceRoot, "/blueprints/first");
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
      assert.equal(this.isBooted, false);
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
  assert.equal(firstRequestSettled, false);
  releaseBoot();

  const [first, second] = await Promise.all([firstRequest, secondRequest]);
  assert.equal(first, second);
  assert.equal(first.app, app);
  assert.equal(first instanceof App, false);
  assert.equal(first.completedValue, "initialized by the derived constructor");
  assert.equal(first.isBooted, true);
  const otherApp = new App({
    workspaceRoot: "/workspaces/other",
    blueprintSourceRoot: "/blueprints/other",
  });
  assert.equal(Reflect.set(first, "app", otherApp), false);
  assert.equal(Reflect.set(first, "isBooted", false), false);
  assert.equal(first.app, app);
  assert.equal(first.isBooted, true);
  assert.equal(bootCount, 1);
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
  assert.ok(firstCreation instanceof Promise);
  assert.ok(secondCreation instanceof Promise);

  const [first, second] = await Promise.all([firstCreation, secondCreation]);
  const singleton = await app.get(FreshService);

  assert.notEqual(first, second);
  assert.notEqual(first, singleton);
  assert.notEqual(second, singleton);
  assert.equal(first.isBooted, true);
  assert.equal(second.isBooted, true);
  assert.equal(singleton.isBooted, true);
  assert.equal(await app.get(FreshService), singleton);
  assert.equal(bootCount, 3);
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
        assert.equal(this.singleton.isBooted, true);
      }
    }
  }

  const singleton = await app.get(SharedLifetimeService);
  assert.equal(singleton.isBooted, true);

  const fresh = await app.create(SharedLifetimeService);
  assert.notEqual(fresh, singleton);
  assert.equal(fresh.singleton, singleton);
  assert.equal(fresh.isBooted, true);
  assert.equal(await app.get(SharedLifetimeService), singleton);
  assert.equal(bootCount, 2);
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

  await assert.rejects(
    app.get(FirstService),
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

  await assert.rejects(
    app.create(FirstFreshService),
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

  assert.ok(root.first?.shared);
  assert.equal(root.first.shared, root.second?.shared);
  assert.equal(sharedBootCount, 1);
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
    await assert.rejects(
      Promise.race([app.get(RootService), timedOut]),
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

  await assert.rejects(app.get(RetryService), (error) => error === bootFailure);
  assert.equal(attempts[0]?.isBooted, false);

  const retry = await app.get(RetryService);
  assert.notEqual(retry, attempts[0]);
  assert.equal(retry.isBooted, true);
  assert.equal(await app.get(RetryService), retry);
  assert.equal(bootCount, 2);
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
  assert.ok(firstRequest instanceof Promise);
  assert.ok(secondRequest instanceof Promise);

  const [first, second] = await Promise.all([firstRequest, secondRequest]);
  assert.notEqual(first, second);
  assert.equal(first.app, firstApp);
  assert.equal(second.app, secondApp);
  assert.equal(first.isBooted, true);
  assert.equal(second.isBooted, true);
  assert.equal(await firstApp.get(Service), first);
  assert.equal(await secondApp.get(Service), second);
});
