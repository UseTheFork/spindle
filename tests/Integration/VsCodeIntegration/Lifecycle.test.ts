import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { BlueprintManagementServiceProvider } from "@spindle/BlueprintManagement/BlueprintManagementServiceProvider";
import { BlueprintLifecycleService } from "@spindle/BlueprintManagement/Services/BlueprintLifecycleService";
import { Application } from "@spindle/Foundation/Application";
import type { ProjectLifecycleContext } from "@spindle/Foundation/ProjectLifecycleContext";
import { ServiceProvider } from "@spindle/Foundation/ServiceProvider";
import { projectSettingsSchema } from "@spindle/Settings/Models/ProjectSettings";
import { VsCodeWorkspaceSettings } from "@spindle/VsCodeIntegration/Settings/VsCodeWorkspaceSettings";
import { VsCodeIntegrationServiceProvider } from "@spindle/VsCodeIntegration/VsCodeIntegrationServiceProvider";
import { runCli } from "@test/Helpers/Cli";
import { makeTempDir } from "@test/Helpers/TemporaryDirectories";
import { expect, test, vi } from "vitest";

vi.setConfig({ testTimeout: 30_000 });

const settingsPath = ".vscode/settings.json";
const guidancePath = ".github/copilot/commit-message-style.md";

test("init with existing opt-in applies integration and update restores managed values", async () => {
  const workspace = await makeTempDir("vscode-init-");
  await mkdir(join(workspace, ".spindle"));
  await mkdir(join(workspace, ".vscode"));
  await writeFile(
    join(workspace, ".spindle/config.json"),
    JSON.stringify({
      stacks: [],
      vscode: { enabled: true },
      commit: { title_max_length: 40 },
    }),
  );
  await writeFile(
    join(workspace, settingsPath),
    '{\n  // Keep\n  "editor.tabSize": 4,\n  "chat.editor.workingSet.enabled": true,\n}\n',
  );
  const run = (args: string[]) => runCli(workspace, args, process.env.PATH ?? "");
  const init = run(["init", "--stack", "typescript", "--spindle-package-manager", "pnpm"]);
  expect(init.status, init.stderr).toBe(0);
  const settings = await readFile(join(workspace, settingsPath), "utf8");
  expect(settings).toContain("// Keep");
  expect(VsCodeWorkspaceSettings.parse(settings, settingsPath)).toMatchObject({
    "editor.tabSize": 4,
    "chat.editor.workingSet.enabled": false,
  });
  expect(await readFile(join(workspace, guidancePath), "utf8")).toContain("at most 40 characters");
  await writeFile(
    join(workspace, settingsPath),
    '{"chat.editor.workingSet.enabled": true, "custom": 9}',
  );
  await writeFile(join(workspace, guidancePath), "custom guidance");
  const update = run(["update"]);
  expect(update.status, update.stderr).toBe(0);
  expect(
    VsCodeWorkspaceSettings.parse(
      await readFile(join(workspace, settingsPath), "utf8"),
      settingsPath,
    ),
  ).toMatchObject({ "chat.editor.workingSet.enabled": false, custom: 9 });
  expect(await readFile(join(workspace, guidancePath), "utf8")).toContain("at most 40 characters");
});

test("settings enable integration, later changes regenerate guidance, and disabling leaves files alone", async () => {
  const workspace = await makeTempDir("vscode-settings-");
  const run = (args: string[]) => runCli(workspace, args, process.env.PATH ?? "");
  const init = run(["init", "--stack", "typescript", "--spindle-package-manager", "pnpm"]);
  expect(init.status, init.stderr).toBe(0);
  expect(await readdir(workspace)).not.toContain(".vscode");
  expect(await readdir(join(workspace, ".github"))).not.toContain("copilot");
  const listed = run(["--json", "settings", "list"]);
  expect(JSON.parse(listed.stdout).data).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ key: "vscode.enabled", type: "boolean", default: false }),
    ]),
  );
  const enable = run(["settings", "set", "vscode.enabled", "true"]);
  expect(enable.status, enable.stderr).toBe(0);
  const change = run(["settings", "set", "commit.title_max_length", "40"]);
  expect(change.status, change.stderr).toBe(0);
  expect(await readFile(join(workspace, guidancePath), "utf8")).toContain("at most 40 characters");
  const disable = run(["settings", "set", "vscode.enabled", "false"]);
  expect(disable.status, disable.stderr).toBe(0);
  await writeFile(join(workspace, settingsPath), "not JSON");
  await writeFile(join(workspace, guidancePath), "my guidance");
  const update = run(["update"]);
  expect(update.status, update.stderr).toBe(0);
  expect(await readFile(join(workspace, settingsPath), "utf8")).toBe("not JSON");
  expect(await readFile(join(workspace, guidancePath), "utf8")).toBe("my guidance");
});

test("invalid workspace settings reject enabling before config or other project writes", async () => {
  const workspace = await makeTempDir("vscode-invalid-");
  const run = (args: string[]) => runCli(workspace, args, process.env.PATH ?? "");
  const init = run(["init", "--stack", "typescript", "--spindle-package-manager", "pnpm"]);
  expect(init.status, init.stderr).toBe(0);
  await mkdir(join(workspace, ".vscode"));
  await writeFile(join(workspace, settingsPath), "{ broken");
  const config = await readFile(join(workspace, ".spindle/config.json"), "utf8");
  const instructions = await readFile(join(workspace, ".github/copilot-instructions.md"), "utf8");
  const before = await readdir(workspace, { recursive: true });
  const enable = run(["settings", "set", "vscode.enabled", "true"]);
  expect(enable.status).not.toBe(0);
  expect(enable.stderr).toContain(settingsPath);
  expect(await readFile(join(workspace, ".spindle/config.json"), "utf8")).toBe(config);
  expect(await readFile(join(workspace, ".github/copilot-instructions.md"), "utf8")).toBe(
    instructions,
  );
  expect(await readdir(workspace, { recursive: true })).toEqual(before);
  expect(await readFile(join(workspace, settingsPath), "utf8")).toBe("{ broken");
});

test("invalid workspace settings abort enabled init before reconciliation writes", async () => {
  const workspace = await makeTempDir("vscode-init-invalid-");
  await mkdir(join(workspace, ".spindle"));
  await mkdir(join(workspace, ".vscode"));
  const config = JSON.stringify({ stacks: [], vscode: { enabled: true } });
  await writeFile(join(workspace, ".spindle/config.json"), config);
  await writeFile(join(workspace, settingsPath), "[]");
  const init = runCli(
    workspace,
    ["init", "--stack", "typescript", "--spindle-package-manager", "pnpm"],
    process.env.PATH ?? "",
  );
  expect(init.status).not.toBe(0);
  expect(init.stderr).toContain(settingsPath);
  expect(await readFile(join(workspace, ".spindle/config.json"), "utf8")).toBe(config);
  expect(await readdir(workspace)).not.toContain(".github");
  expect(await readdir(workspace)).not.toContain("docs");
});

test("invalid workspace settings abort enabled update before reconciliation writes", async () => {
  const workspace = await makeTempDir("vscode-update-invalid-");
  const run = (args: string[]) => runCli(workspace, args, process.env.PATH ?? "");
  const init = run(["init", "--stack", "typescript", "--spindle-package-manager", "pnpm"]);
  expect(init.status, init.stderr).toBe(0);
  const enable = run(["settings", "set", "vscode.enabled", "true"]);
  expect(enable.status, enable.stderr).toBe(0);
  await writeFile(join(workspace, settingsPath), "[]");
  const config = await readFile(join(workspace, ".spindle/config.json"), "utf8");
  const guidance = await readFile(join(workspace, guidancePath), "utf8");
  const instructions = await readFile(join(workspace, ".github/copilot-instructions.md"), "utf8");
  const before = await readdir(workspace, { recursive: true });
  const update = run(["update"]);
  expect(update.status).not.toBe(0);
  expect(update.stderr).toContain(settingsPath);
  expect(await readFile(join(workspace, ".spindle/config.json"), "utf8")).toBe(config);
  expect(await readFile(join(workspace, guidancePath), "utf8")).toBe(guidance);
  expect(await readFile(join(workspace, ".github/copilot-instructions.md"), "utf8")).toBe(
    instructions,
  );
  expect(await readdir(workspace, { recursive: true })).toEqual(before);
});

test.each(["init", "update"] as const)(
  "%s hooks prepare before reconciliation and record applied lifecycle changes",
  async (mode) => {
    const workspace = await makeTempDir("vscode-hook-");
    await mkdir(join(workspace, ".spindle"));
    const settings = projectSettingsSchema.parse({
      stacks: ["typescript"],
      spindle_package_manager: "pnpm",
      vscode: { enabled: true },
    });
    await writeFile(join(workspace, ".spindle/config.json"), JSON.stringify(settings));
    const app = new Application({ basePath: workspace });
    app.instance("path.workspace", workspace);
    app.instance("settings.project", { status: "valid", data: settings });
    app.register(BlueprintManagementServiceProvider);
    app.register(VsCodeIntegrationServiceProvider);
    const seen: string[] = [];
    class Observe extends ServiceProvider {
      public register(): void {}
      public async boot(): Promise<void> {}
      public override async afterInit(context: ProjectLifecycleContext): Promise<void> {
        seen.push(...context.completedChanges);
      }
      public override async afterUpdate(context: ProjectLifecycleContext): Promise<void> {
        await this.afterInit(context);
      }
    }
    app.register(Observe);
    await app.boot();
    await (
      await app.make(BlueprintLifecycleService)
    ).run(mode, settings, async () => {
      expect(await readdir(workspace)).not.toContain(".vscode");
      expect(await readdir(workspace)).not.toContain(".github");
      return [];
    });
    expect(seen).toContain(settingsPath);
    expect(seen).toContain(guidancePath);
  },
);

test("after-hook detects concurrent edits and reports completed reconciliation without overwriting", async () => {
  const workspace = await makeTempDir("vscode-after-failure-");
  await mkdir(join(workspace, ".spindle"));
  const settings = projectSettingsSchema.parse({
    stacks: ["typescript"],
    spindle_package_manager: "pnpm",
    vscode: { enabled: true },
  });
  await writeFile(join(workspace, ".spindle/config.json"), JSON.stringify(settings));
  const app = new Application({ basePath: workspace });
  app.instance("path.workspace", workspace);
  app.instance("settings.project", { status: "valid", data: settings });
  app.register(BlueprintManagementServiceProvider);
  class ConcurrentEdit extends ServiceProvider {
    public register(): void {}
    public async boot(): Promise<void> {}
    public override async afterUpdate(_context: ProjectLifecycleContext): Promise<void> {
      await mkdir(join(workspace, ".vscode"));
      await writeFile(join(workspace, settingsPath), "external edit");
    }
  }
  app.register(ConcurrentEdit);
  app.register(VsCodeIntegrationServiceProvider);
  await app.boot();
  await expect(
    (await app.make(BlueprintLifecycleService)).run("update", settings, async () => [
      { kind: "Skill", name: "example", status: "updated" },
    ]),
  ).rejects.toThrow(
    /settings.json.*changed while preparing.*Completed Blueprint changes: updated Skill 'example'.*rollback was not attempted/,
  );
  expect(await readFile(join(workspace, settingsPath), "utf8")).toBe("external edit");
  expect(await readdir(workspace)).not.toContain(".github");
});
