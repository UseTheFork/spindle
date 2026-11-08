import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

import { afterEach, expect, onTestFinished, test, vi } from "vitest";

import { dispatch } from "@/cli";
import { InitCommand } from "@/commands/init/init-command";
import { SddCommand } from "@/commands/sdd/sdd-command";
import { Application } from "@/foundation/Application";
import { Bootstrapper, type BootstrapperConstructor } from "@/foundation/bootstrap/Bootstrapper";
import { DiscoverGitRoot } from "@/foundation/bootstrap/DiscoverGitRoot";
import { LoadConsoleArgs } from "@/foundation/bootstrap/LoadConsoleArgs";
import { RegisterProviders } from "@/foundation/bootstrap/RegisterProviders";
import { ResolveBlueprintSourceRoot } from "@/foundation/bootstrap/ResolveBlueprintSourceRoot";
import type { ConsoleInvocation } from "@/foundation/ConsoleInvocation";
import { Kernel } from "@/foundation/Kernel";
import { ProductionServiceProvider } from "@/services/ProductionServiceProvider";
import { ServiceProvider } from "@/services/ServiceProvider";
import { Repository } from "@/utilities/Repository";

afterEach(() => {
  RegisterProviders.merge([]);
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function workspace() {
  const root = mkdtempSync(join(process.cwd(), ".bootstrap-test-"));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  execFileSync("git", ["init", "-q"], { cwd: root });
  const nested = join(root, "packages", "nested");
  mkdirSync(nested, { recursive: true });
  return { root, nested };
}

const invocation: ConsoleInvocation = {
  raw: ["sdd", "create", "--title", "Feature", "--author", "maintainer"],
  script: "/bin/spindle",
  commandPath: ["sdd", "create"],
  options: { title: "Feature", author: "maintainer" },
  positionals: [],
};

function consoleArgs(application: Application): Repository {
  const args = application.value("console.args");
  if (!(args instanceof Repository)) throw new Error("Missing console arguments.");
  return args;
}

test("default kernel bootstrap order is explicit and ordinary Kernel make does not bootstrap", async () => {
  class Inspectable extends Kernel {
    public list(): readonly BootstrapperConstructor[] {
      return this.bootstrappers();
    }
  }
  const app = Application.configure("/project").create();
  expect(new Inspectable(app).list()).toEqual([
    LoadConsoleArgs,
    DiscoverGitRoot,
    ResolveBlueprintSourceRoot,
    RegisterProviders,
  ]);
  await app.make(Kernel);
  expect(app.hasBeenBootstrapped).toBe(false);
  expect(app.bound("console.invocation")).toBe(false);
  expect(app.bound("path.workspace")).toBe(false);
});

test("kernel supplies invocation first, resolves distinct roots, then registers and boots providers", async () => {
  const { root, nested } = workspace();
  vi.stubEnv("SPINDLE_BLUEPRINTS_DIR", "blueprint-assets");
  const events: string[] = [];
  class Provider extends ServiceProvider {
    public constructor(app: Application) {
      super(app);
      expect(app.basePath).toBe(nested);
      expect(app.workspaceRoot).toBe(root);
      expect(app.blueprintSourceRoot).toBe(join(root, "blueprint-assets"));
      expect(app.value("console.invocation")).toBe(invocation);
      expect(consoleArgs(app).array("raw")).toBe(invocation.raw);
      events.push("construct");
    }
    public register(): void {
      events.push("register");
    }
    public async boot(): Promise<void> {
      events.push("boot");
    }
  }
  const app = Application.configure(nested, [Provider]).create();
  const kernel = await app.make(Kernel);
  await Promise.all([kernel.boot(invocation), new Kernel(app).boot(invocation)]);
  await kernel.boot({ ...invocation, raw: ["ignored"] });
  expect(events).toEqual(["construct", "register", "boot"]);
  expect(app.basePath).toBe(nested);
  expect(app.hasBeenBootstrapped).toBe(true);
  expect(app.value("console.invocation")).toBe(invocation);
});

test("LoadConsoleArgs retains parsed option arrays, false values, positionals, raw tokens and script", () => {
  const app = new Application({ basePath: "/project" });
  const parsed: ConsoleInvocation = {
    raw: ["sdd", "review", "require", "--", "raw"],
    script: "/installed/spindle",
    commandPath: ["sdd", "review"],
    options: { interactive: false, var: ["owner=one", "owner=two"], includeNew: true },
    positionals: ["require", "raw"],
  };
  app.instance("console.invocation", parsed);
  new LoadConsoleArgs().bootstrap(app);
  const args = consoleArgs(app);
  expect(args.string("script")).toBe(parsed.script);
  expect(args.array("raw")).toBe(parsed.raw);
  expect(args.array("commandPath")).toBe(parsed.commandPath);
  expect(args.array("positionals")).toBe(parsed.positionals);
  expect(args.array("options.var")).toEqual(["owner=one", "owner=two"]);
  expect(args.boolean("options.interactive")).toBe(false);
  expect(args.boolean("options.includeNew")).toBe(true);
  expect(app.config.has("args")).toBe(false);
});

test.each([
  undefined,
  null,
  {},
  { raw: ["init"], script: "spindle", commandPath: [], options: [], positionals: [] },
  { raw: ["init", 1], script: "spindle", commandPath: [], options: {}, positionals: [] },
])("LoadConsoleArgs rejects malformed invocation values: %j", (value) => {
  const app = new Application({ basePath: "/project" });
  app.instance("console.invocation", value);
  expect(() => new LoadConsoleArgs().bootstrap(app)).toThrow(/Console invocation/);
  expect(app.bound("console.args")).toBe(false);
});

test("failed Git bootstrap caches failure before constructing any providers", async () => {
  const { nested } = workspace();
  vi.stubEnv("PATH", "");
  vi.stubEnv("Path", "");
  let constructions = 0;
  class Provider extends ServiceProvider {
    public constructor(app: Application) {
      super(app);
      constructions++;
    }
    public register(): void {}
    public async boot(): Promise<void> {}
  }
  const app = Application.configure(nested, [Provider]).create();
  const kernel = await app.make(Kernel);
  await expect(kernel.boot(invocation)).rejects.toThrow(/Git working-tree root/);
  await expect(new Kernel(app).boot(invocation)).rejects.toThrow(/Git working-tree root/);
  expect(constructions).toBe(0);
  expect(app.bound("console.args")).toBe(true);
  expect(app.bound("path.workspace")).toBe(false);
  expect(app.bound("path.blueprints")).toBe(false);
  expect(app.hasBeenBootstrapped).toBe(false);
});

test("overridden bootstrap lists are not normalized and may contain repeated hooks", async () => {
  let runs = 0;
  class Counting extends Bootstrapper {
    public bootstrap(app: Application): void {
      expect(app.value("console.invocation")).toBe(invocation);
      runs++;
    }
  }
  class Custom extends Kernel {
    protected override bootstrappers(): readonly BootstrapperConstructor[] {
      return [Counting, Counting];
    }
  }
  const app = new Application({ basePath: "/project" });
  await new Custom(app).boot(invocation);
  expect(runs).toBe(2);
  expect(app.bound("path.workspace")).toBe(false);
  expect(app.hasBeenBootstrapped).toBe(true);
});

test("packaged source defaults resolve from the helper location, independent of basePath", async () => {
  const { root, nested } = workspace();
  vi.stubEnv("SPINDLE_BLUEPRINTS_DIR", "");
  const app = Application.configure(nested).create();
  await (await app.make(Kernel)).boot(invocation);
  expect(app.workspaceRoot).toBe(root);
  expect(app.blueprintSourceRoot).toBe(resolve("src/blueprints") + "/");
});

test("Commander alone supplies validated repeated options to the executable composition", async () => {
  const { nested } = workspace();
  const raw = [
    "init",
    "--stack",
    "python",
    "--stack",
    "typescript",
    "--var",
    "owner=first",
    "--var",
    "owner=second",
    "--no-interactive",
    "--on-conflict",
    "overwrite",
  ];
  let application: Application | undefined;
  const run = vi.spyOn(InitCommand.prototype, "run").mockResolvedValue(undefined);
  await dispatch(
    raw,
    () => {
      application = Application.configure(nested, [ProductionServiceProvider]).create();
      return application;
    },
    "/installed/spindle",
  );
  if (!application) throw new Error("Missing dispatched application.");
  expect(application.value("console.invocation")).toEqual({
    raw,
    script: "/installed/spindle",
    commandPath: ["init"],
    positionals: [],
    options: {
      stack: ["python", "typescript"],
      var: ["owner=first", "owner=second"],
      interactive: false,
      onConflict: "overwrite",
    },
  });
  expect(consoleArgs(application).array("options.var")).toEqual(["owner=first", "owner=second"]);
  expect(run).toHaveBeenCalledWith(
    ["python", "typescript"],
    ["owner=first", "owner=second"],
    false,
    "overwrite",
  );
});

test("Commander preserves a real positional action and nested command path without reparsing", async () => {
  const { nested } = workspace();
  const operationFailure = new Error("operation reached");
  vi.spyOn(SddCommand.prototype, "reviewRequire").mockImplementation(() => {
    throw operationFailure;
  });
  let application: Application | undefined;
  const raw = [
    "sdd",
    "review",
    "require",
    "--spec",
    "/spec.md",
    "--issue",
    "I-0001",
    "--agent",
    "reviewer",
    "--details",
    "Required",
    "--author",
    "maintainer",
  ];
  await expect(
    dispatch(raw, () => {
      application = Application.configure(nested, [ProductionServiceProvider]).create();
      return application;
    }),
  ).rejects.toBe(operationFailure);
  if (!application) throw new Error("Missing dispatched application.");
  expect(application.value("console.invocation")).toMatchObject({
    positionals: ["require"],
    commandPath: ["sdd", "review"],
    raw,
  });
});

test("semantic invalid input fails before Application construction or Git bootstrap", async () => {
  let constructions = 0;
  await expect(
    dispatch(["init", "--stack", "unsupported", "--no-interactive"], () => {
      constructions++;
      return Application.configure("/missing").create();
    }),
  ).rejects.toThrow(/stack/i);
  expect(constructions).toBe(0);
});
