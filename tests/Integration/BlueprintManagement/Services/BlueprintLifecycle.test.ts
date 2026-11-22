import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { BlueprintManagementServiceProvider } from "@spindle/BlueprintManagement/BlueprintManagementServiceProvider";
import { InitCommand } from "@spindle/BlueprintManagement/Commands/InitCommand";
import { BlueprintLifecycleService } from "@spindle/BlueprintManagement/Services/BlueprintLifecycleService";
import type { BlueprintOutcome } from "@spindle/BlueprintManagement/Types/Reconciliation";
import { Application } from "@spindle/Foundation/Application";
import type { ProjectLifecycleContext } from "@spindle/Foundation/ProjectLifecycleContext";
import { ServiceProvider } from "@spindle/Foundation/ServiceProvider";
import { ProjectService } from "@spindle/Project/Services/ProjectService";
import {
  ProjectSettingsService,
  type ProjectSettingsData,
} from "@spindle/Settings/Services/ProjectSettingsService";
import { SettingsService } from "@spindle/Settings/Services/SettingsService";
import { ToolingService } from "@spindle/Tooling/Services/ToolingService";
import { applicationFixture } from "@test/Helpers/ApplicationFixture";
import { makeTempDir, repoRoot } from "@test/Helpers/TemporaryDirectories";
import { expect, test, vi } from "vitest";

async function fixture() {
  const workspace = await makeTempDir("spindle-lifecycle-");
  await mkdir(join(workspace, ".spindle"));
  const settings = ProjectSettingsService.require(
    ProjectSettingsService.parse(
      JSON.stringify({ stacks: ["python"], spindle_package_manager: "npm" }),
    ),
  ).settings;
  await writeFile(join(workspace, ".spindle/config.json"), JSON.stringify(settings));
  const app = new Application({ basePath: workspace });
  app.instance("path.workspace", workspace);
  app.instance("settings.project", { status: "valid", data: settings });
  app.register(BlueprintManagementServiceProvider);
  return { app, workspace, settings };
}

test.each(["init", "update"] as const)(
  "%s awaits hooks in registration order with target settings and fresh prepared state",
  async (mode) => {
    const { app, workspace, settings } = await fixture();
    const events: string[] = [];
    const contexts: ProjectLifecycleContext[] = [];
    let operation = 0;
    class PreparedWork {
      public constructor(public readonly operation: number) {}
    }
    class First extends ServiceProvider {
      public register(): void {}
      public async boot(): Promise<void> {}
      public override async beforeInit(context: ProjectLifecycleContext): Promise<void> {
        expect(ProjectSettingsService.requireCurrent(this.app).settings).toEqual(context.settings);
        expect(context.bound(PreparedWork)).toBe(false);
        contexts.push(context);
        context.instance(PreparedWork, new PreparedWork(++operation));
        events.push("before:first:start");
        await Promise.resolve();
        events.push("before:first:end");
      }
      public override async afterInit(context: ProjectLifecycleContext): Promise<void> {
        expect(context).toBe(contexts.at(-1));
        expect((await context.make(PreparedWork)).operation).toBe(operation);
        expect(ProjectSettingsService.requireCurrent(this.app).settings).toEqual(context.settings);
        expect(JSON.parse(await readFile(join(workspace, ".spindle/config.json"), "utf8"))).toEqual(
          context.settings,
        );
        events.push("after:first");
      }
      public override async beforeUpdate(context: ProjectLifecycleContext): Promise<void> {
        await this.beforeInit(context);
      }
      public override async afterUpdate(context: ProjectLifecycleContext): Promise<void> {
        await this.afterInit(context);
      }
    }
    class Second extends ServiceProvider {
      public register(): void {}
      public async boot(): Promise<void> {}
      public override async beforeInit(_context: ProjectLifecycleContext): Promise<void> {
        events.push("before:second");
      }
      public override async afterInit(_context: ProjectLifecycleContext): Promise<void> {
        events.push("after:second");
      }
      public override async beforeUpdate(context: ProjectLifecycleContext): Promise<void> {
        await this.beforeInit(context);
      }
      public override async afterUpdate(context: ProjectLifecycleContext): Promise<void> {
        await this.afterInit(context);
      }
    }
    app.register(First);
    app.register(First);
    app.register(Second);
    await app.boot();
    const lifecycle = await app.make(BlueprintLifecycleService);
    const expectedOutcomes: BlueprintOutcome[] = [
      { kind: "Skill", name: "demo", status: "installed" },
    ];
    for (const packageManager of ["pnpm", "npm run"]) {
      const target = { ...settings, spindle_package_manager: packageManager };
      expect(
        await lifecycle.run(mode, target, async () => {
          events.push("reconcile");
          expect(ProjectSettingsService.requireCurrent(app).settings).toEqual(target);
          await writeFile(join(workspace, ".spindle/config.json"), JSON.stringify(target));
          return expectedOutcomes;
        }),
      ).toBe(expectedOutcomes);
      expect(ProjectSettingsService.requireCurrent(app).settings).toEqual(target);
    }
    expect(contexts[0]).not.toBe(contexts[1]);
    expect(events).toEqual(
      Array.from({ length: 2 }, () => [
        "before:first:start",
        "before:first:end",
        "before:second",
        "reconcile",
        "after:first",
        "after:second",
      ]).flat(),
    );
  },
);

test.each(["before", "reconcile", "after"] as const)(
  "a %s failure stops subsequent work and permits a fresh retry",
  async (failurePhase) => {
    const { app, workspace, settings } = await fixture();
    const events: string[] = [];
    const contexts: ProjectLifecycleContext[] = [];
    let fail = true;
    class First extends ServiceProvider {
      public register(): void {}
      public async boot(): Promise<void> {}
      public override async beforeUpdate(context: ProjectLifecycleContext): Promise<void> {
        contexts.push(context);
        events.push("before:first");
        if (fail && failurePhase === "before") throw new Error("before failed");
      }
      public override async afterUpdate(context: ProjectLifecycleContext): Promise<void> {
        events.push("after:first");
        context.recordChanges({ created: ["docs/first.md"], updated: [] });
      }
    }
    class Second extends ServiceProvider {
      public register(): void {}
      public async boot(): Promise<void> {}
      public override async beforeUpdate(_context: ProjectLifecycleContext): Promise<void> {
        events.push("before:second");
      }
      public override async afterUpdate(_context: ProjectLifecycleContext): Promise<void> {
        events.push("after:second");
        if (fail && failurePhase === "after") throw new Error("after failed");
      }
    }
    class Third extends ServiceProvider {
      public register(): void {}
      public async boot(): Promise<void> {}
      public override async afterUpdate(_context: ProjectLifecycleContext): Promise<void> {
        events.push("after:third");
      }
    }
    app.register(First);
    app.register(Second);
    app.register(Third);
    await app.boot();
    const lifecycle = await app.make(BlueprintLifecycleService);
    const target = { ...settings, spindle_package_manager: "pnpm" };
    const reconcile = async (): Promise<BlueprintOutcome[]> => {
      events.push("reconcile");
      if (fail && failurePhase === "reconcile") throw new Error("reconcile failed");
      await writeFile(join(workspace, ".spindle/config.json"), JSON.stringify(target));
      return [{ kind: "Skill", name: "demo", status: "updated" }];
    };
    await expect(lifecycle.run("update", target, reconcile)).rejects.toThrow(
      failurePhase === "after"
        ? /after failed.*Completed Blueprint changes: updated Skill 'demo'.*Completed lifecycle changes: docs\/first.md.*rollback was not attempted/
        : `${failurePhase} failed`,
    );
    const expected = ["before:first"];
    if (failurePhase !== "before") expected.push("before:second", "reconcile");
    if (failurePhase === "after") expected.push("after:first", "after:second");
    expect(events).toEqual(expected);
    const persisted = failurePhase === "after" ? target : settings;
    expect(ProjectSettingsService.requireCurrent(app).settings).toEqual(persisted);
    expect(JSON.parse(await readFile(join(workspace, ".spindle/config.json"), "utf8"))).toEqual(
      persisted,
    );
    fail = false;
    await lifecycle.run("update", target, reconcile);
    expect(contexts[0]).not.toBe(contexts[1]);
    expect(contexts[1]!.completedChanges).toEqual(["docs/first.md"]);
    expect(events.at(-1)).toBe("after:third");
  },
);

test("settings drift after reconciliation prevents after-hooks from seeing inconsistent settings", async () => {
  const { app, workspace, settings } = await fixture();
  await app.boot();
  const lifecycle = await app.make(BlueprintLifecycleService);
  const hooks = vi.spyOn(app, "runProjectHooks");
  const target = { ...settings, spindle_package_manager: "pnpm" };
  await expect(
    lifecycle.run("update", target, async () => {
      await writeFile(join(workspace, ".spindle/config.json"), JSON.stringify(settings));
      return [{ kind: "Skill", name: "demo", status: "updated" }];
    }),
  ).rejects.toThrow(
    /Project Settings changed during reconciliation.*Completed Blueprint changes: updated Skill 'demo'/,
  );
  expect(hooks).toHaveBeenCalledTimes(1);
  expect(hooks.mock.calls[0]![0]).toBe("beforeUpdate");
  expect(ProjectSettingsService.requireCurrent(app).settings).toEqual(settings);
});

test("overlapping operations fail without disturbing the active target settings", async () => {
  const { app, workspace, settings } = await fixture();
  await app.boot();
  const lifecycle = await app.make(BlueprintLifecycleService);
  const target = { ...settings, spindle_package_manager: "pnpm" };
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const first = lifecycle.run("update", target, async () => {
    entered();
    await gate;
    await writeFile(join(workspace, ".spindle/config.json"), JSON.stringify(target));
    return [];
  });
  await started;
  try {
    const reconcile = vi.fn(async () => []);
    await expect(lifecycle.run("update", settings, reconcile)).rejects.toThrow(
      "A project lifecycle operation is already running.",
    );
    expect(reconcile).not.toHaveBeenCalled();
    expect(ProjectSettingsService.requireCurrent(app).settings).toEqual(target);
  } finally {
    release();
    await first;
  }
});

test("configured init rejects before invoking lifecycle hooks", async () => {
  const { app, workspace } = await fixture();
  await app.boot();
  const hooks = vi.spyOn(app, "runProjectHooks");
  const original = await readFile(join(workspace, ".spindle/config.json"), "utf8");
  await expect(
    (await app.make(InitCommand)).run(["typescript"], "pnpm", false, undefined),
  ).rejects.toThrow("already has configured Blueprint stacks");
  expect(hooks).not.toHaveBeenCalled();
  expect(await readFile(join(workspace, ".spindle/config.json"), "utf8")).toBe(original);
});

test("settings-driven updates invoke domain hooks and preserve guidance preflight", async () => {
  const { workspace, settings } = await fixture();
  const app = applicationFixture(workspace, join(repoRoot, "assets/Blueprints"), {
    status: "valid",
    data: settings,
  });
  await app.boot();
  const project = await app.make(ProjectService);
  const tooling = await app.make(ToolingService);
  const prepare = vi.spyOn(project, "prepare");
  const apply = vi.spyOn(project, "apply");
  const initialize = vi.spyOn(tooling, "initialize");
  const service = new SettingsService(app);
  const target: ProjectSettingsData = { ...settings, spindle_package_manager: "pnpm" };
  const result = await service.save(target);
  expect(prepare).toHaveBeenCalledExactlyOnceWith(expect.objectContaining(target), "update");
  expect(apply).toHaveBeenCalledTimes(1);
  expect(initialize).toHaveBeenCalledExactlyOnceWith(expect.objectContaining(target));
  expect(apply.mock.invocationCallOrder[0]).toBeLessThan(initialize.mock.invocationCallOrder[0]!);
  expect(result.spindle_package_manager).toBe("pnpm");
  expect(await readFile(join(workspace, "docs/agents/tooling.md"), "utf8")).toContain(
    "# Project Tooling",
  );

  const original = await readFile(join(workspace, ".spindle/config.json"), "utf8");
  prepare.mockRejectedValueOnce(new Error("guidance preflight failed"));
  await expect(service.save({ ...target, spindle_package_manager: "npm run" })).rejects.toThrow(
    "guidance preflight failed",
  );
  expect(apply).toHaveBeenCalledTimes(1);
  expect(initialize).toHaveBeenCalledTimes(1);
  expect(await readFile(join(workspace, ".spindle/config.json"), "utf8")).toBe(original);
  expect(ProjectSettingsService.requireCurrent(app).settings).toEqual(result);
});
