import { mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import { Application } from "@/Foundation/Application";
import { LoadProjectConfiguration } from "@/Foundation/Bootstrap/LoadProjectConfiguration";
import { ProjectServiceProvider } from "@/Project/ProjectServiceProvider";
import { ProjectService } from "@/Project/Services/ProjectService";
import { ToolingService } from "@/Tooling/Services/ToolingService";
import { ToolingServiceProvider } from "@/Tooling/ToolingServiceProvider";

import { makeTempDirSync, repoRoot } from "../../../Helpers/TemporaryDirectories.ts";

const copilotInstructionsTemplate = readFileSync(
  join(repoRoot, "assets/Templates/project/copilot-instructions.md"),
  "utf8",
);

async function fixture() {
  const workspace = makeTempDirSync("project-service-");
  mkdirSync(join(workspace, ".github"));
  writeFileSync(
    join(workspace, ".github/spindle.json"),
    JSON.stringify({ stacks: ["typescript"], spindle_package_manager: "pnpm", variables: {} }),
  );
  const app = new Application({ basePath: workspace });
  app.instance("path.workspace", workspace);
  app.register(ProjectServiceProvider);
  app.register(ToolingServiceProvider);
  await new LoadProjectConfiguration().bootstrap(app);
  await app.boot();
  return {
    app,
    workspace,
    service: await app.make(ProjectService),
    tooling: await app.make(ToolingService),
  };
}

test("Project and Tooling providers bind their owned services and commands", async () => {
  const { app, service, tooling } = await fixture();
  expect(ProjectServiceProvider.commands()).toEqual([]);
  expect(ToolingServiceProvider.commands().map((command) => command.name)).toEqual([
    "ToolingListCommand",
    "ToolingAddCommand",
    "ToolingUpdateCommand",
    "ToolingRemoveCommand",
  ]);
  expect(service.app).toBe(app);
  expect(await app.make(ProjectService)).toBe(service);
  expect(tooling.app).toBe(app);
  expect(await app.make(ToolingService)).toBe(tooling);
});

test("project operations require a booted application", async () => {
  const service = new ProjectService(new Application({ basePath: "/workspace" }));
  await expect(service.initialize()).rejects.toThrow(
    "Application services can only run after the application has booted.",
  );
});

test("tooling changes refuse configuration made invalid after bootstrap", async () => {
  const { workspace, service, tooling } = await fixture();
  await service.initialize();
  const path = join(workspace, ".github/spindle.json");
  const config = JSON.parse(readFileSync(path, "utf8"));
  config.commit.title_max_length = 1;
  const invalid = JSON.stringify(config);
  writeFileSync(path, invalid);

  await expect(
    tooling.addTooling({ key: "check", section: "Testing", command: "pnpm test" }),
  ).rejects.toThrow("commit.title_max_length");
  expect(readFileSync(path, "utf8")).toBe(invalid);
});

test("project initialization creates the baseline, seeds Spindle commands, and renders the guide", async () => {
  const { app, workspace, service } = await fixture();
  const result = await service.initialize();

  expect(result).toEqual({
    workspace,
    created: [
      "docs",
      "docs/adr",
      ".scratch",
      "docs/agents",
      ".github/copilot-instructions.md",
      "docs/agents/domain.md",
      "docs/agents/ticket-tracker.md",
      "docs/agents/constitution.md",
      "docs/agents/tooling.md",
    ],
    preserved: [".github"],
    updated: [".github/spindle.json"],
  });
  const config = JSON.parse(readFileSync(join(workspace, ".github/spindle.json"), "utf8"));
  expect(LoadProjectConfiguration.current(app)).toMatchObject({
    status: "valid",
    data: { stacks: ["typescript"], tooling: expect.any(Array) },
  });
  expect(readFileSync(join(workspace, "docs/agents/ticket-tracker.md"), "utf8")).toContain(
    "pnpm spindle sdd",
  );
  expect(readFileSync(join(workspace, "docs/agents/ticket-tracker.md"), "utf8")).not.toContain(
    "{{",
  );
  expect(readFileSync(join(workspace, ".github/copilot-instructions.md"), "utf8")).toBe(
    `<!-- spindle:start -->\n${copilotInstructionsTemplate.trimEnd()}\n<!-- spindle:end -->\n`,
  );
  expect(config).toMatchObject({ stacks: ["typescript"], variables: {} });
  expect(config.tooling).toEqual([]);
  const guide = readFileSync(join(workspace, "docs/agents/tooling.md"), "utf8");
  expect(guide).toContain("# Project Tooling\n\n## Spindle\n\n- `spindle init`");
  expect(guide).toContain("- `spindle tool <list|add|update|remove>`:");
});

test("project initialization replaces unmarked Copilot instructions", async () => {
  const { workspace, service } = await fixture();
  const customInstructions = "# Local instructions\n\nKeep this guidance.\n";
  writeFileSync(join(workspace, ".github/copilot-instructions.md"), customInstructions);

  const first = await service.initialize();
  const instructionsPath = join(workspace, ".github/copilot-instructions.md");
  expect(readFileSync(instructionsPath, "utf8")).toBe(
    `<!-- spindle:start -->\n${copilotInstructionsTemplate.trimEnd()}\n<!-- spindle:end -->\n`,
  );
  expect(first.updated).toContain(".github/copilot-instructions.md");

  const second = await service.initialize();
  expect(readFileSync(instructionsPath, "utf8")).toBe(
    `<!-- spindle:start -->\n${copilotInstructionsTemplate.trimEnd()}\n<!-- spindle:end -->\n`,
  );
  expect(second.updated).not.toContain(".github/copilot-instructions.md");
  expect(second.preserved).toContain(".github/copilot-instructions.md");
});

test("project initialization preserves a project-owned constitution after creation", async () => {
  const { workspace, service } = await fixture();
  const first = await service.initialize();
  const constitutionPath = join(workspace, "docs/agents/constitution.md");
  expect(first.created).toContain("docs/agents/constitution.md");
  expect(readFileSync(constitutionPath, "utf8")).toContain("Status:** Draft");

  const ratifiedConstitution = "# Ratified constitution\n";
  writeFileSync(constitutionPath, ratifiedConstitution);

  const second = await service.initialize();
  expect(readFileSync(constitutionPath, "utf8")).toBe(ratifiedConstitution);
  expect(second.preserved).toContain("docs/agents/constitution.md");
  expect(second.updated).not.toContain("docs/agents/constitution.md");
});

test("project initialization replaces a bounded Copilot block while preserving surrounding content", async () => {
  const { workspace, service } = await fixture();
  const existingInstructions =
    "# Existing prefix\n<!-- spindle:start -->\nold\n<!-- spindle:end -->\n# Existing suffix\n";
  writeFileSync(join(workspace, ".github/copilot-instructions.md"), existingInstructions);

  const result = await service.initialize();

  expect(readFileSync(join(workspace, ".github/copilot-instructions.md"), "utf8")).toBe(
    `# Existing prefix\n<!-- spindle:start -->\n${copilotInstructionsTemplate.trimEnd()}\n<!-- spindle:end -->\n# Existing suffix\n`,
  );
  expect(result.updated).toContain(".github/copilot-instructions.md");
});

test("initialization seeds a registry in legacy Config and preserves existing entries on rerun", async () => {
  const { app, workspace, service, tooling } = await fixture();
  writeFileSync(
    join(workspace, ".github/spindle.json"),
    JSON.stringify({
      stacks: ["typescript"],
      spindle_package_manager: "pnpm",
      variables: { owner: "team" },
      custom: true,
    }),
  );
  await LoadProjectConfiguration.refresh(app);
  const first = await service.initialize();
  expect(first.updated).toEqual([".github/spindle.json"]);
  const original = JSON.parse(readFileSync(join(workspace, ".github/spindle.json"), "utf8"));
  expect(original).toMatchObject({
    stacks: ["typescript"],
    variables: { owner: "team" },
    custom: true,
  });
  expect(original.tooling).toHaveLength(0);

  await tooling.addTooling({
    key: "test-fast",
    section: "Testing",
    command: "pnpm test -- --run",
  });
  const customDomain = Buffer.from("preserve domain docs\n");
  writeFileSync(join(workspace, "docs/agents/domain.md"), customDomain);
  const customTicketTracker = Buffer.from("preserve ticket tracker docs\n");
  writeFileSync(join(workspace, "docs/agents/ticket-tracker.md"), customTicketTracker);
  writeFileSync(join(workspace, "docs/agents/tooling.md"), "stale generated contents\n");
  const repeated = await service.initialize();
  expect(repeated.created).toEqual([]);
  expect(repeated.updated).toContain("docs/agents/domain.md");
  expect(repeated.updated).toContain("docs/agents/ticket-tracker.md");
  expect(repeated.updated).toContain("docs/agents/tooling.md");
  expect(readFileSync(join(workspace, "docs/agents/domain.md"))).not.toEqual(customDomain);
  expect(readFileSync(join(workspace, "docs/agents/ticket-tracker.md"))).not.toEqual(
    customTicketTracker,
  );
  expect(
    JSON.parse(readFileSync(join(workspace, ".github/spindle.json"), "utf8")).tooling,
  ).toHaveLength(1);
  expect(readFileSync(join(workspace, "docs/agents/tooling.md"), "utf8")).toContain("pnpm test");
});

test("tooling mutations list, group and regenerate the registry projection", async () => {
  const { app, workspace, service, tooling } = await fixture();
  await service.initialize();
  const first = await tooling.addTooling({
    key: "test-unit",
    section: "Testing",
    command: "pnpm test unit",
    description: "Run unit tests.",
  });
  expect(LoadProjectConfiguration.current(app)).toMatchObject({
    status: "valid",
    data: { tooling: expect.arrayContaining([first]) },
  });
  await tooling.addTooling({
    key: "lint-check",
    section: "Linting",
    command: "pnpm lint",
  });
  await tooling.addTooling({
    key: "test-watch",
    section: "Testing",
    command: "pnpm test",
  });
  await tooling.addTooling({
    key: "spindle-custom",
    section: "Spindle",
    command: "pnpm spindle extra",
  });
  expect(first.key).toBe("test-unit");
  expect((await tooling.listTooling()).map(({ key }) => key)).toEqual([
    "spindle-init",
    "spindle-update",
    "spindle-tool",
    "test-unit",
    "lint-check",
    "test-watch",
    "spindle-custom",
  ]);
  let guide = readFileSync(join(workspace, "docs/agents/tooling.md"), "utf8");
  expect(guide.indexOf("## Testing")).toBeLessThan(guide.indexOf("## Linting"));
  expect(guide.indexOf("pnpm test unit")).toBeLessThan(guide.indexOf("- `pnpm test`"));
  expect(guide.match(/## Testing/g)).toHaveLength(1);
  expect(guide.indexOf("spindle tool <")).toBeLessThan(guide.indexOf("pnpm spindle extra"));
  expect(guide).toContain("## Testing\n\n- ");

  await tooling.updateTooling({ key: "test-unit", command: "pnpm vitest run" });
  expect(readFileSync(join(workspace, "docs/agents/tooling.md"), "utf8")).toContain(
    "pnpm vitest run",
  );
  await tooling.updateTooling({ key: "test-unit", clearDescription: true });
  const entry = (await tooling.listTooling()).find(({ key }) => key === "test-unit");
  expect(entry).not.toHaveProperty("description");

  await tooling.removeTooling("test-unit");
  await tooling.removeTooling("test-watch");
  guide = readFileSync(join(workspace, "docs/agents/tooling.md"), "utf8");
  expect(guide).not.toContain("## Testing");
  expect(guide).toContain("## Linting");
});

test("tooling operations reject missing initialization, duplicate keys, invalid updates, and invalid keys", async () => {
  const { service, tooling } = await fixture();
  expect((await tooling.listTooling()).map((entry) => entry.key)).toEqual([
    "spindle-init",
    "spindle-update",
    "spindle-tool",
  ]);
  await expect(
    tooling.addTooling({ key: "test-unit", section: "Testing", command: "pnpm test" }),
  ).rejects.toThrow("not initialized");
  await service.initialize();
  await expect(
    tooling.addTooling({ key: "test-unit", section: "Testing", command: "pnpm test" }),
  ).resolves.toMatchObject({ key: "test-unit" });
  await expect(
    tooling.addTooling({ key: "test-unit", section: "Testing", command: "pnpm test" }),
  ).rejects.toThrow("already exists");
  await expect(tooling.updateTooling({ key: "test-unit" })).rejects.toThrow(
    "Provide at least one tooling field",
  );
  await expect(
    tooling.updateTooling({ key: "test-unit", description: "", clearDescription: true }),
  ).rejects.toThrow("either --description or --clear-description");
  await expect(tooling.removeTooling("missing")).rejects.toThrow("No tooling command");
  await expect(
    tooling.addTooling({ key: "Bad Key", section: "Testing", command: "pnpm test" }),
  ).rejects.toThrow("lowercase letters");
  await expect(
    tooling.addTooling({ key: "spindle-init", section: "Spindle", command: "other" }),
  ).rejects.toThrow("reserved");
  await expect(tooling.updateTooling({ key: "spindle-update", command: "other" })).rejects.toThrow(
    "reserved",
  );
  await expect(tooling.removeTooling("spindle-tool")).rejects.toThrow("reserved");
});

test.each([
  "local content",
  "<!-- spindle:start -->\nunfinished",
  "<!-- spindle:end -->\n<!-- spindle:start -->",
  "<!-- spindle:start -->\na\n<!-- spindle:end -->\n<!-- spindle:start -->\nb\n<!-- spindle:end -->",
])("initialization replaces unmarked or malformed Copilot guidance", async (existing) => {
  const { workspace, service } = await fixture();
  const target = join(workspace, ".github/copilot-instructions.md");
  writeFileSync(target, existing);
  await service.initialize();
  expect(readFileSync(target, "utf8")).toBe(
    `<!-- spindle:start -->\n${copilotInstructionsTemplate.trimEnd()}\n<!-- spindle:end -->\n`,
  );
});

test("project initialization rejects invalid Config and symlinked generated files", async () => {
  const invalid = await fixture();
  writeFileSync(join(invalid.workspace, ".github/spindle.json"), "{");
  await LoadProjectConfiguration.refresh(invalid.app);
  await expect(invalid.service.initialize()).rejects.toThrow("not valid JSON");
  expect(readdirSync(invalid.workspace)).toEqual([".github"]);

  const symlinked = await fixture();
  mkdirSync(join(symlinked.workspace, "docs/agents"), { recursive: true });
  const outside = join(symlinked.workspace, "outside.md");
  writeFileSync(outside, "do not overwrite");
  symlinkSync(outside, join(symlinked.workspace, "docs/agents/tooling.md"));
  await expect(symlinked.service.initialize()).rejects.toThrow(
    "docs/agents/tooling.md must be a regular file",
  );
  expect(readFileSync(outside, "utf8")).toBe("do not overwrite");
});

test("project initialization requires an installed Blueprint stack", async () => {
  const { workspace, service, app } = await fixture();
  writeFileSync(
    join(workspace, ".github/spindle.json"),
    JSON.stringify({ stacks: [], variables: {} }),
  );
  await LoadProjectConfiguration.refresh(app);

  await expect(service.initialize()).rejects.toThrow(/Install at least one Blueprint stack/);
  expect(readdirSync(workspace)).toEqual([".github"]);
});
