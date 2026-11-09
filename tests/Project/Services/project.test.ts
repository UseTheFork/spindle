import { mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import { templateCatalog } from "@/Assets/Templates/Catalog";
import { Application } from "@/Foundation/Application";
import { ProjectServiceProvider } from "@/Project/ProjectServiceProvider";
import { ProjectService } from "@/Project/Services/ProjectService";

import { makeTempDirSync, repoRoot } from "../../helpers/TemporaryDirectories.ts";

async function fixture() {
  const workspace = makeTempDirSync("project-service-");
  const app = new Application({ basePath: workspace });
  app.instance("path.workspace", workspace);
  app.register(ProjectServiceProvider);
  return { app, workspace, service: await app.make(ProjectService) };
}

test("Project provider declares project and tooling commands and binds its service", async () => {
  const { app, service } = await fixture();
  expect(ProjectServiceProvider.commands().map((command) => command.name)).toEqual([
    "ProjectInitCommand",
    "ToolingListCommand",
    "ToolingAddCommand",
    "ToolingUpdateCommand",
    "ToolingRemoveCommand",
  ]);
  expect(service.app).toBe(app);
  expect(await app.make(ProjectService)).toBe(service);
});

test("project initialization creates the baseline, seeds Spindle commands, and renders the guide", async () => {
  const { workspace, service } = await fixture();
  const result = await service.initialize();

  expect(result).toEqual({
    workspace,
    created: [
      "docs",
      "docs/adr",
      ".scratch",
      "docs/agents",
      ".github",
      "docs/agents/domain.md",
      "docs/agents/ticket-tracker.md",
      ".github/spindle.json",
      "docs/agents/tooling.md",
    ],
    preserved: [],
    updated: [],
  });
  for (const { source, destination } of templateCatalog.project) {
    expect(readFileSync(join(workspace, destination))).toEqual(
      readFileSync(join(repoRoot, "src/Assets/Templates", source)),
    );
  }
  const config = JSON.parse(readFileSync(join(workspace, ".github/spindle.json"), "utf8"));
  expect(readFileSync(join(workspace, "docs/agents/ticket-tracker.md"))).toEqual(
    readFileSync(join(repoRoot, "src/Assets/Templates/project/ticket-tracker.md")),
  );
  expect(config).toMatchObject({ stacks: [], variables: {} });
  expect(config.tooling.map(({ key }: { key: string }) => key)).toEqual([
    "spindle-init",
    "spindle-update",
    "spindle-project-init",
  ]);
  const guide = readFileSync(join(workspace, "docs/agents/tooling.md"), "utf8");
  expect(guide).toContain("# Project Tooling\n\n## Spindle");
  expect(guide).toContain("- `spindle project init`:");
});

test("initialization seeds a registry in legacy Config and preserves existing entries on rerun", async () => {
  const { workspace, service } = await fixture();
  mkdirSync(join(workspace, ".github"));
  writeFileSync(
    join(workspace, ".github/spindle.json"),
    JSON.stringify({ stacks: ["typescript"], variables: { owner: "team" }, custom: true }),
  );
  const first = await service.initialize();
  expect(first.updated).toEqual([".github/spindle.json"]);
  const original = JSON.parse(readFileSync(join(workspace, ".github/spindle.json"), "utf8"));
  expect(original).toMatchObject({
    stacks: ["typescript"],
    variables: { owner: "team" },
    custom: true,
  });
  expect(original.tooling).toHaveLength(3);

  await service.addTooling({
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
  expect(repeated.preserved).toContain("docs/agents/domain.md");
  expect(repeated.preserved).toContain("docs/agents/ticket-tracker.md");
  expect(repeated.updated).toEqual([".github/spindle.json", "docs/agents/tooling.md"]);
  expect(readFileSync(join(workspace, "docs/agents/domain.md"))).toEqual(customDomain);
  expect(readFileSync(join(workspace, "docs/agents/ticket-tracker.md"))).toEqual(
    customTicketTracker,
  );
  expect(
    JSON.parse(readFileSync(join(workspace, ".github/spindle.json"), "utf8")).tooling,
  ).toHaveLength(4);
  expect(readFileSync(join(workspace, "docs/agents/tooling.md"), "utf8")).toContain("pnpm test");
});

test("tooling mutations list, group and regenerate the registry projection", async () => {
  const { workspace, service } = await fixture();
  await service.initialize();
  const first = await service.addTooling({
    key: "test-unit",
    section: "Testing",
    command: "pnpm test unit",
    description: "Run unit tests.",
  });
  await service.addTooling({
    key: "lint-check",
    section: "Linting",
    command: "pnpm lint",
  });
  await service.addTooling({
    key: "test-watch",
    section: "Testing",
    command: "pnpm test",
  });
  expect(first.key).toBe("test-unit");
  expect((await service.listTooling()).map(({ key }) => key)).toEqual([
    "spindle-init",
    "spindle-update",
    "spindle-project-init",
    "test-unit",
    "lint-check",
    "test-watch",
  ]);
  let guide = readFileSync(join(workspace, "docs/agents/tooling.md"), "utf8");
  expect(guide.indexOf("## Testing")).toBeLessThan(guide.indexOf("## Linting"));
  expect(guide.indexOf("pnpm test unit")).toBeLessThan(guide.indexOf("- `pnpm test`"));
  expect(guide.match(/## Testing/g)).toHaveLength(1);

  await service.updateTooling({ key: "test-unit", command: "pnpm vitest run" });
  expect(readFileSync(join(workspace, "docs/agents/tooling.md"), "utf8")).toContain(
    "pnpm vitest run",
  );
  await service.updateTooling({ key: "test-unit", clearDescription: true });
  const entry = (await service.listTooling()).find(({ key }) => key === "test-unit");
  expect(entry).not.toHaveProperty("description");

  await service.removeTooling("test-unit");
  await service.removeTooling("test-watch");
  guide = readFileSync(join(workspace, "docs/agents/tooling.md"), "utf8");
  expect(guide).not.toContain("## Testing");
  expect(guide).toContain("## Linting");
});

test("tooling operations reject missing initialization, duplicate keys, invalid updates, and invalid keys", async () => {
  const { service } = await fixture();
  await expect(service.listTooling()).rejects.toThrow("Run `spindle project init` first.");
  await service.initialize();
  await expect(
    service.addTooling({ key: "test-unit", section: "Testing", command: "pnpm test" }),
  ).resolves.toMatchObject({ key: "test-unit" });
  await expect(
    service.addTooling({ key: "test-unit", section: "Testing", command: "pnpm test" }),
  ).rejects.toThrow("already exists");
  await expect(service.updateTooling({ key: "test-unit" })).rejects.toThrow(
    "Provide at least one tooling field",
  );
  await expect(
    service.updateTooling({ key: "test-unit", description: "", clearDescription: true }),
  ).rejects.toThrow("either --description or --clear-description");
  await expect(service.removeTooling("missing")).rejects.toThrow("No tooling command");
  await expect(
    service.addTooling({ key: "Bad Key", section: "Testing", command: "pnpm test" }),
  ).rejects.toThrow("lowercase letters");
});

test("project initialization rejects invalid Config and symlinked generated files", async () => {
  const invalid = await fixture();
  mkdirSync(join(invalid.workspace, ".github"));
  writeFileSync(join(invalid.workspace, ".github/spindle.json"), "{");
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
