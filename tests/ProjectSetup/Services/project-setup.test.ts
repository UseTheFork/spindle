import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { expect, onTestFinished, test } from "vitest";

import { setupProjectCatalog } from "@/Assets/SetupProject/Catalog";
import { Application } from "@/Foundation/Application";
import { SetupProjectCommand } from "@/ProjectSetup/Commands/SetupProjectCommand";
import { ProjectSetupServiceProvider } from "@/ProjectSetup/ProjectSetupServiceProvider";
import { ProjectSetupService } from "@/ProjectSetup/Services/ProjectSetupService";

async function fixture() {
  const workspace = mkdtempSync(join(process.cwd(), "project-setup-service-"));
  onTestFinished(() => rmSync(workspace, { recursive: true, force: true }));
  const app = new Application({ basePath: workspace });
  app.register(ProjectSetupServiceProvider);
  return { app, workspace, service: await app.make(ProjectSetupService) };
}

test("the provider declares its command and resolves an application-owned singleton", async () => {
  const { app, service, workspace } = await fixture();
  expect(ProjectSetupServiceProvider.commands()).toEqual([SetupProjectCommand]);
  expect(service.app).toBe(app);
  expect(service.isBooted).toBe(true);
  expect(await app.make(ProjectSetupService)).toBe(service);
  const command = await app.make(SetupProjectCommand);
  const result = await command.run({ workspacePath: workspace });
  expect(result.workspace).toBe(workspace);
  expect(result.created).toEqual([
    "docs",
    "docs/adr",
    ".scratch",
    "docs/agents",
    ...setupProjectCatalog.map(([, destination]) => destination),
  ]);
  expect(result.preserved).toEqual([]);
  for (const [source, destination] of setupProjectCatalog) {
    expect(readFileSync(join(workspace, destination))).toEqual(
      readFileSync(join(process.cwd(), "src/Assets/SetupProject", source)),
    );
  }
});

test("direct setup validates an explicit absolute existing directory before writes", async () => {
  const { workspace, service } = await fixture();
  expect(() => service.setup({ workspacePath: "." })).toThrow(
    "Workspace must be an absolute project directory.",
  );
  expect(() => service.setup({ workspacePath: join(workspace, "missing") })).toThrow();
  const file = join(workspace, "file");
  writeFileSync(file, "preserved");
  expect(() => service.setup({ workspacePath: file })).toThrow("Workspace must be a directory.");
  expect(readdirSync(workspace)).toEqual(["file"]);
  expect(readFileSync(file, "utf8")).toBe("preserved");
});

test("direct setup resolves a workspace symlink and targets it instead of the application base", async () => {
  const { workspace, service } = await fixture();
  const target = join(workspace, "explicit target");
  mkdirSync(target);
  const link = join(workspace, "workspace-link");
  symlinkSync(target, link);
  const result = service.setup({ workspacePath: link });
  expect(result.workspace).toBe(target);
  expect(result.created).toEqual([
    "docs",
    "docs/adr",
    ".scratch",
    "docs/agents",
    ...setupProjectCatalog.map(([, destination]) => destination),
  ]);
  expect(readdirSync(workspace).sort()).toEqual(["explicit target", "workspace-link"]);
  for (const [source, destination] of setupProjectCatalog) {
    expect(readFileSync(join(target, destination))).toEqual(
      readFileSync(join(process.cwd(), "src/Assets/SetupProject", source)),
    );
  }
});

test("direct setup preserves arbitrary existing bytes and reports missing-only writes", async () => {
  const { workspace, service } = await fixture();
  mkdirSync(join(workspace, "docs/agents"), { recursive: true });
  const bytes = Buffer.from([0x00, 0xff, 0x0d, 0x0a]);
  writeFileSync(join(workspace, "docs/agents/domain.md"), bytes);
  const first = service.setup({ workspacePath: workspace });
  expect(first.created).toEqual([
    "docs/adr",
    ".scratch",
    "docs/agents/issue-tracker.md",
    "docs/agents/triage-labels.md",
    "docs/agents/tooling.md",
  ]);
  expect(first.preserved).toEqual(["docs", "docs/agents", "docs/agents/domain.md"]);
  const before = setupProjectCatalog.map(([, path]) => readFileSync(join(workspace, path)));
  expect(service.setup({ workspacePath: workspace })).toEqual({
    workspace,
    created: [],
    preserved: [
      "docs",
      "docs/adr",
      ".scratch",
      "docs/agents",
      ...setupProjectCatalog.map(([, destination]) => destination),
    ],
  });
  expect(setupProjectCatalog.map(([, path]) => readFileSync(join(workspace, path)))).toEqual(
    before,
  );
  expect(readFileSync(join(workspace, "docs/agents/domain.md"))).toEqual(bytes);
});

test("direct setup rejects directory links and dangling destination links without following them", async () => {
  const { workspace, service } = await fixture();
  const outside = join(workspace, "outside");
  mkdirSync(outside);
  symlinkSync(outside, join(workspace, "docs"));
  expect(() => service.setup({ workspacePath: workspace })).toThrow(
    "docs must be a real directory, not a file or symlink.",
  );
  expect(readdirSync(outside)).toEqual([]);
  rmSync(join(workspace, "docs"));
  mkdirSync(join(workspace, "docs/agents"), { recursive: true });
  symlinkSync(join(outside, "missing"), join(workspace, "docs/agents/domain.md"));
  expect(() => service.setup({ workspacePath: workspace })).toThrow(
    "docs/agents/domain.md must be a regular file, not a directory or symlink.",
  );
  expect(readdirSync(outside)).toEqual([]);
});

test("direct setup retains earlier writes when a later default is a conflicting directory", async () => {
  const { workspace, service } = await fixture();
  mkdirSync(join(workspace, "docs/agents/triage-labels.md"), { recursive: true });
  expect(() => service.setup({ workspacePath: workspace })).toThrow(
    "docs/agents/triage-labels.md must be a regular file, not a directory or symlink.",
  );
  expect(readdirSync(join(workspace, "docs")).sort()).toEqual(["adr", "agents"]);
  expect(readdirSync(join(workspace, "docs/agents")).sort()).toEqual([
    "domain.md",
    "issue-tracker.md",
    "triage-labels.md",
  ]);
  for (const [source, destination] of setupProjectCatalog.slice(0, 2)) {
    expect(readFileSync(join(workspace, destination))).toEqual(
      readFileSync(join(process.cwd(), "src/Assets/SetupProject", source)),
    );
  }
});
