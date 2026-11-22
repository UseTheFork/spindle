import {
  chmodSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { Application } from "@spindle/Foundation/Application";
import { LoadProjectSettings } from "@spindle/Foundation/Bootstrap/LoadProjectSettings";
import { projectSettingsSchema } from "@spindle/Settings/Models/ProjectSettings";
import { ProjectSettingsService } from "@spindle/Settings/Services/ProjectSettingsService";
import { VsCodeIntegrationService } from "@spindle/VsCodeIntegration/Services/VsCodeIntegrationService";
import { VsCodeWorkspaceSettings } from "@spindle/VsCodeIntegration/Settings/VsCodeWorkspaceSettings";
import { VsCodeIntegrationServiceProvider } from "@spindle/VsCodeIntegration/VsCodeIntegrationServiceProvider";
import { makeTempDirSync, repoRoot } from "@test/Helpers/TemporaryDirectories";
import { expect, test, vi } from "vitest";

const settingsPath = ".vscode/settings.json";
const guidancePath = ".github/copilot/commit-message-style.md";
const managedSettings = VsCodeWorkspaceSettings.parse(
  readFileSync(join(repoRoot, "assets/VsCodeIntegration/settings.json"), "utf8"),
  "settings asset",
);

async function fixture() {
  const workspace = makeTempDirSync("vscode-preparation-");
  mkdirSync(join(workspace, ".spindle"));
  const config = JSON.stringify({ stacks: ["typescript"] });
  writeFileSync(join(workspace, ".spindle/config.json"), config);
  const app = new Application({ basePath: workspace });
  app.instance("path.workspace", workspace);
  app.register(VsCodeIntegrationServiceProvider);
  await new LoadProjectSettings().bootstrap(app);
  await app.boot();
  return {
    app,
    workspace,
    config,
    service: await app.make(VsCodeIntegrationService),
    settings: projectSettingsSchema.parse({ stacks: ["typescript"], vscode: { enabled: true } }),
  };
}

test("the integration provider owns a singleton and preparation requires a booted app", async () => {
  const { app, service, settings } = await fixture();
  expect(service.app).toBe(app);
  expect(await app.make(VsCodeIntegrationService)).toBe(service);
  expect(VsCodeIntegrationServiceProvider.commands()).toEqual([]);
  await expect(
    new VsCodeIntegrationService(new Application({ basePath: "/workspace" })).prepare(settings),
  ).rejects.toThrow("Application services can only run after the application has booted.");
});

test("preparation creates both outputs in memory without creating files or persisting opt-in", async () => {
  const { app, workspace, config, service, settings } = await fixture();
  const before = readdirSync(workspace, { recursive: true });
  const state = ProjectSettingsService.current(app);
  const binding = app.value("settings.project");
  const prepared = await service.prepare(settings);
  expect(prepared.workspace).toBe(workspace);
  expect(prepared.files.map((file) => file.destination)).toEqual([settingsPath, guidancePath]);
  expect(prepared.files.every((file) => file.original === undefined)).toBe(true);
  expect(VsCodeWorkspaceSettings.parse(prepared.files[0]!.content, settingsPath)).toEqual({
    "chat.subagents.allowInvocationsFromSubagents": true,
    "chat.editor.workingSet.enabled": false,
    "chat.tools.terminal.ignoreDefaultAutoApproveRules": true,
    "github.copilot.chat.commitMessageGeneration.instructions": [{ file: guidancePath }],
  });
  expect(prepared.files[1]!.content).toContain("Use Conventional Commits");
  expect(prepared.files[1]!.content).toContain("at most 72 characters");
  expect(prepared.files[1]!.content).not.toContain("{{");
  expect(readdirSync(workspace, { recursive: true })).toEqual(before);
  expect(readFileSync(join(workspace, ".spindle/config.json"), "utf8")).toBe(config);
  expect(ProjectSettingsService.current(app)).toEqual(state);
  expect(app.value("settings.project")).toBe(binding);
});

test("preparation works before Project Settings exists and restores the absent state", async () => {
  const workspace = makeTempDirSync("vscode-before-init-");
  const app = new Application({ basePath: workspace });
  app.instance("path.workspace", workspace);
  app.register(VsCodeIntegrationServiceProvider);
  await new LoadProjectSettings().bootstrap(app);
  await app.boot();
  const service = await app.make(VsCodeIntegrationService);
  const prepared = await service.prepare(
    projectSettingsSchema.parse({ stacks: ["typescript"], vscode: { enabled: true } }),
  );
  expect(prepared.files).toHaveLength(2);
  expect(readdirSync(workspace)).toEqual([]);
  expect(ProjectSettingsService.current(app)).toEqual({ status: "absent" });
});

test("existing content is snapshotted and planned replacements use supplied commit settings", async () => {
  const { app, workspace, service, settings } = await fixture();
  mkdirSync(join(workspace, ".vscode"));
  mkdirSync(join(workspace, ".github/copilot"), { recursive: true });
  const original = [
    "{",
    "    // Preserve this project preference",
    '    "editor.fontSize" : 18,',
    '    "chat.subagents.allowInvocationsFromSubagents": false,',
    '    "github.copilot.chat.commitMessageGeneration.instructions": [{ "text": "Custom" }],',
    "}",
    "",
  ].join("\n");
  writeFileSync(join(workspace, settingsPath), original);
  writeFileSync(join(workspace, guidancePath), "Custom guidance\n");
  settings.commit = {
    allow_body: true,
    allow_breaking_changes: true,
    title_max_length: 40,
    scopes_enabled: true,
    allowed_scopes: ["api"],
  };
  const prepared = await service.prepare(settings);
  expect(prepared.files[0]!.original).toBe(original);
  expect(prepared.files[0]!.content).toContain("    // Preserve this project preference\n");
  expect(prepared.files[0]!.content).toContain('    "editor.fontSize" : 18,');
  expect(VsCodeWorkspaceSettings.parse(prepared.files[0]!.content, settingsPath)).toEqual({
    "editor.fontSize": 18,
    ...managedSettings,
  });
  expect(prepared.files[1]!.original).toBe("Custom guidance\n");
  expect(prepared.files[1]!.content).not.toContain("Custom guidance");
  expect(prepared.files[1]!.content).toContain("at most 40 characters");
  expect(prepared.files[1]!.content).toContain("Allowed scopes: api");
  expect(prepared.files[1]!.content).toContain("A body is optional");
  expect(prepared.files[1]!.content).toContain("Mark every breaking change with !");
  expect(ProjectSettingsService.requireCurrent(app).settings.commit.title_max_length).toBe(72);
  expect(readFileSync(join(workspace, settingsPath), "utf8")).toBe(original);
  expect(readFileSync(join(workspace, guidancePath), "utf8")).toBe("Custom guidance\n");
});

test("disabled integration does not inspect or change existing invalid settings or guidance", async () => {
  const { workspace, service } = await fixture();
  mkdirSync(join(workspace, ".vscode"));
  writeFileSync(join(workspace, settingsPath), "Invalid JSONC");
  mkdirSync(join(workspace, ".github/copilot"), { recursive: true });
  writeFileSync(join(workspace, guidancePath), "Keep me\n");
  const prepared = await service.prepare(projectSettingsSchema.parse({ stacks: [] }));
  expect(prepared).toEqual({ workspace, files: [] });
  expect(readFileSync(join(workspace, settingsPath), "utf8")).toBe("Invalid JSONC");
  expect(readFileSync(join(workspace, guidancePath), "utf8")).toBe("Keep me\n");
});

test.each(["{", "", "[]", "null", "true", "42", '"text"'])(
  "invalid existing settings abort preparation without writes or opt-in persistence: %j",
  async (original) => {
    const { app, workspace, config, service, settings } = await fixture();
    mkdirSync(join(workspace, ".vscode"));
    writeFileSync(join(workspace, settingsPath), original);
    mkdirSync(join(workspace, ".github/copilot"), { recursive: true });
    writeFileSync(join(workspace, guidancePath), "Original guidance\n");
    const before = readdirSync(workspace, { recursive: true });
    await expect(service.prepare(settings)).rejects.toThrow(settingsPath);
    expect(readdirSync(workspace, { recursive: true })).toEqual(before);
    expect(readFileSync(join(workspace, settingsPath), "utf8")).toBe(original);
    expect(readFileSync(join(workspace, guidancePath), "utf8")).toBe("Original guidance\n");
    expect(readFileSync(join(workspace, ".spindle/config.json"), "utf8")).toBe(config);
    expect(ProjectSettingsService.requireCurrent(app).settings.vscode.enabled).toBe(false);
  },
);

test("already installed content produces identical outputs on repeated preparation", async () => {
  const { workspace, service, settings } = await fixture();
  const first = await service.prepare(settings);
  mkdirSync(join(workspace, ".vscode"));
  mkdirSync(join(workspace, ".github/copilot"), { recursive: true });
  for (const file of first.files) writeFileSync(join(workspace, file.destination), file.content);
  const second = await service.prepare(settings);
  for (const file of second.files) expect(file.content).toBe(file.original);
});

test("settings assets remain literal and template errors identify the file and restore state", async () => {
  const { app, workspace, service, settings } = await fixture();
  const assets = makeTempDirSync("vscode-assets-");
  const settingsAsset = join(assets, "settings.json");
  const guidanceAsset = join(assets, "commit-message-style.md");
  writeFileSync(settingsAsset, '{"literal": "{{ computed.missing }}"}');
  writeFileSync(guidanceAsset, "{{ computed.commit_guidance }}");
  vi.spyOn(app, "assetsPath").mockImplementation((path) =>
    path === "VsCodeIntegration/settings.json" ? settingsAsset : guidanceAsset,
  );
  const prepared = await service.prepare(settings);
  expect(VsCodeWorkspaceSettings.parse(prepared.files[0]!.content, settingsPath)).toEqual({
    literal: "{{ computed.missing }}",
  });
  writeFileSync(guidanceAsset, "{{ computed.missing }}");
  const state = ProjectSettingsService.current(app);
  const before = readdirSync(workspace, { recursive: true });
  await expect(service.prepare(settings)).rejects.toThrow(guidancePath);
  await expect(service.prepare(settings)).rejects.toThrow("computed.missing");
  expect(ProjectSettingsService.current(app)).toEqual(state);
  expect(readdirSync(workspace, { recursive: true })).toEqual(before);
});

test.each([".vscode", ".github", ".github/copilot"])(
  "preparation rejects symlinked destination directories: %s",
  async (path) => {
    const { workspace, service, settings } = await fixture();
    const outside = makeTempDirSync("vscode-outside-");
    if (path === ".github/copilot") mkdirSync(join(workspace, ".github"));
    symlinkSync(outside, join(workspace, path));
    await expect(service.prepare(settings)).rejects.toThrow("must be a real directory");
    expect(readdirSync(outside)).toEqual([]);
  },
);

test.each([settingsPath, guidancePath])(
  "preparation rejects a non-file destination: %s",
  async (path) => {
    const { workspace, service, settings } = await fixture();
    mkdirSync(join(workspace, path), { recursive: true });
    await expect(service.prepare(settings)).rejects.toThrow(`'${path}' must be a regular file.`);
  },
);

test("apply creates files, preserves permissions when updating, and skips unchanged content", async () => {
  const { workspace, service, settings } = await fixture();
  const first = await service.apply(await service.prepare(settings));
  expect(first.created).toEqual([
    ".vscode",
    settingsPath,
    ".github",
    ".github/copilot",
    guidancePath,
  ]);
  expect(first.updated).toEqual([]);
  expect(first.preserved).toEqual([]);
  const second = await service.apply(await service.prepare(settings));
  expect(second).toEqual({ created: [], updated: [], preserved: [settingsPath, guidancePath] });
  chmodSync(join(workspace, guidancePath), 0o640);
  settings.commit.title_max_length = 40;
  const third = await service.apply(await service.prepare(settings));
  expect(third.updated).toEqual([guidancePath]);
  expect(third.preserved).toEqual([settingsPath]);
  expect(statSync(join(workspace, guidancePath)).mode & 0o777).toBe(0o640);
  expect(readFileSync(join(workspace, guidancePath), "utf8")).toContain("at most 40 characters");
});

test.each([settingsPath, guidancePath])(
  "apply refuses a changed %s before touching either prepared file",
  async (path) => {
    const { workspace, service, settings } = await fixture();
    const initial = await service.prepare(settings);
    await service.apply(initial);
    const prepared = await service.prepare(settings);
    writeFileSync(join(workspace, path), "external edit\n");
    const other = path === settingsPath ? guidancePath : settingsPath;
    const otherBefore = readFileSync(join(workspace, other), "utf8");
    await expect(service.apply(prepared)).rejects.toThrow(
      `'${path}' changed while preparing VS Code integration`,
    );
    expect(readFileSync(join(workspace, path), "utf8")).toBe("external edit\n");
    expect(readFileSync(join(workspace, other), "utf8")).toBe(otherBefore);
  },
);

test("apply rejects a destination directory replaced by a symlink after preparation", async () => {
  const { workspace, service, settings } = await fixture();
  const prepared = await service.prepare(settings);
  const outside = makeTempDirSync("vscode-apply-outside-");
  symlinkSync(outside, join(workspace, ".vscode"));
  await expect(service.apply(prepared)).rejects.toThrow("must be a real directory");
  expect(readdirSync(outside)).toEqual([]);
});

test.each([settingsPath, guidancePath])(
  "preparation rejects symlinked destination files without touching their targets: %s",
  async (path) => {
    const { workspace, service, settings } = await fixture();
    const outside = makeTempDirSync("vscode-outside-file-");
    const target = join(outside, "original.txt");
    writeFileSync(target, "{}\n");
    mkdirSync(join(workspace, ".vscode"));
    mkdirSync(join(workspace, ".github/copilot"), { recursive: true });
    symlinkSync(target, join(workspace, path));
    await expect(service.prepare(settings)).rejects.toThrow(`'${path}' must be a regular file.`);
    expect(readFileSync(target, "utf8")).toBe("{}\n");
  },
);
