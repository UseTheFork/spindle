import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { expect, test } from "vitest";

import { writeCatalogFixture } from "../../../Helpers/CatalogFixtures.ts";
import { runCliWithCatalog } from "../../../Helpers/Cli.ts";
import { makeTempDir, repoRoot } from "../../../Helpers/TemporaryDirectories.ts";

async function put(path: string, value: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value);
}

async function assets() {
  const blueprints = await makeTempDir("guidance-blueprints-");
  const templates = await makeTempDir("guidance-templates-");
  await cp(join(repoRoot, "src/Assets/Templates"), templates, { recursive: true });
  writeCatalogFixture(blueprints, {
    agents: {},
    instructions: {},
    skills: { demo: { path: "demo/", stacks: [] } },
  });
  await put(
    join(blueprints, "skills/demo/SKILL.md"),
    "---\nmetadata:\n  spindle:\n    version: 2.0.0\n---\nshipped\n",
  );
  return {
    blueprints,
    templates,
    env: { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints, SPINDLE_TEST_TEMPLATES_DIR: templates },
  };
}

test("update renders and replaces project guidance and initializes missing tooling", async () => {
  const project = await makeTempDir("guidance-update-");
  const { templates, env } = await assets();
  await put(
    join(templates, "project/copilot-instructions.md"),
    "Use {{ computed.spindle_package_manager }}.\n",
  );
  await put(
    join(templates, "project/domain.md"),
    "Domain {{ computed.spindle_package_manager }}.\n",
  );
  const github = join(project, ".github");
  await put(
    join(github, "spindle.json"),
    JSON.stringify({ stacks: ["python"], spindle_package_manager: "pnpm", custom: true }),
  );
  await put(
    join(github, "copilot-instructions.md"),
    "before\n<!-- spindle:start -->\nold\n<!-- spindle:end -->\nafter\n",
  );
  await put(join(project, "docs/agents/domain.md"), "old domain");
  await put(join(project, "docs/agents/ticket-tracker.md"), "old tickets");
  const ratifiedConstitution = "# Ratified constitution\n";
  await put(join(project, "docs/agents/constitution.md"), ratifiedConstitution);
  const result = runCliWithCatalog(project, ["update"], process.env.PATH ?? "", env);
  expect(result.status, result.stderr).toBe(0);
  expect(await readFile(join(github, "copilot-instructions.md"), "utf8")).toBe(
    "before\n<!-- spindle:start -->\nUse pnpm.\n<!-- spindle:end -->\nafter\n",
  );
  expect(await readFile(join(project, "docs/agents/domain.md"), "utf8")).toBe("Domain pnpm.\n");
  expect(await readFile(join(project, "docs/agents/ticket-tracker.md"), "utf8")).toContain(
    "pnpm spindle sdd",
  );
  expect(await readFile(join(project, "docs/agents/constitution.md"), "utf8")).toBe(
    ratifiedConstitution,
  );
  const config = JSON.parse(await readFile(join(github, "spindle.json"), "utf8"));
  expect(config).toMatchObject({
    stacks: ["python"],
    spindle_package_manager: "pnpm",
    custom: true,
    tooling: [],
    commit: { title_max_length: 72 },
    $schema: expect.stringMatching(
      /^https:\/\/unpkg\.com\/@use-the-fork\/spindle@[^/]+\/build\/spindle\.schema\.json$/,
    ),
  });
  const guide = await readFile(join(project, "docs/agents/tooling.md"), "utf8");
  expect(guide).toContain("## Spindle\n\n- `spindle init`");
  expect(guide).toContain("`spindle update`");
  await expect(readFile(join(project, ".scratch"))).rejects.toMatchObject({ code: "ENOENT" });
  await expect(readFile(join(project, "docs/adr"))).rejects.toMatchObject({ code: "ENOENT" });
  const bytes = await readFile(join(github, "spindle.json"), "utf8");
  const repeat = runCliWithCatalog(project, ["update"], process.env.PATH ?? "", env);
  expect(repeat.status, repeat.stderr).toBe(0);
  expect(await readFile(join(github, "spindle.json"), "utf8")).toBe(bytes);
});

test("init renders project Markdown using its selected package manager", async () => {
  const project = await makeTempDir("guidance-init-");
  const { templates, env } = await assets();
  await put(
    join(templates, "project/domain.md"),
    "Domain {{ computed.spindle_package_manager }}.\n",
  );
  await put(
    join(templates, "project/copilot-instructions.md"),
    "Run {{ computed.spindle_package_manager }}.\n",
  );
  const result = runCliWithCatalog(
    project,
    ["init", "--stack", "python", "--spindle-package-manager", "npm run"],
    process.env.PATH ?? "",
    env,
  );
  expect(result.status, result.stderr).toBe(0);
  expect(await readFile(join(project, "docs/agents/domain.md"), "utf8")).toBe("Domain npm run.\n");
  expect(await readFile(join(project, ".github/copilot-instructions.md"), "utf8")).toContain(
    "Run npm run.",
  );
  expect(await readFile(join(project, "docs/agents/ticket-tracker.md"), "utf8")).toContain(
    "npm run spindle sdd",
  );
});

test("update preserves a valid registry and rejects reserved registry keys before changes", async () => {
  const project = await makeTempDir("guidance-registry-");
  const { env } = await assets();
  const path = join(project, ".github/spindle.json");
  const custom = [{ key: "test", section: "Testing", command: "pnpm test" }];
  const raw = JSON.stringify(
    { stacks: ["python"], spindle_package_manager: "pnpm", tooling: custom },
    null,
    4,
  );
  await put(path, raw);
  const result = runCliWithCatalog(project, ["update"], process.env.PATH ?? "", env);
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({
    ...JSON.parse(raw),
    commit: { title_max_length: 72 },
    $schema: expect.stringMatching(
      /^https:\/\/unpkg\.com\/@use-the-fork\/spindle@[^/]+\/build\/spindle\.schema\.json$/,
    ),
  });
  const guide = await readFile(join(project, "docs/agents/tooling.md"), "utf8");
  expect(guide).toContain("## Testing\n\n- `pnpm test`");

  const invalid = JSON.stringify({
    stacks: ["python"],
    spindle_package_manager: "pnpm",
    tooling: [{ key: "spindle-init", section: "Spindle", command: "custom" }],
  });
  await put(path, invalid);
  await put(join(project, "docs/agents/domain.md"), "unchanged");
  const rejected = runCliWithCatalog(project, ["update"], process.env.PATH ?? "", env);
  expect(rejected.status).not.toBe(0);
  expect(await readFile(path, "utf8")).toBe(invalid);
  expect(await readFile(join(project, "docs/agents/domain.md"), "utf8")).toBe("unchanged");
});

test.each(["init", "update"] as const)(
  "%s preflights guidance rendering before Blueprint changes",
  async (mode) => {
    const project = await makeTempDir("guidance-preflight-");
    const { templates, env } = await assets();
    await put(join(templates, "project/domain.md"), "{{ computed.not_registered }}");
    const github = join(project, ".github");
    const old = "---\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nlocal\n";
    if (mode === "update") {
      await put(
        join(github, "spindle.json"),
        JSON.stringify({ stacks: ["python"], spindle_package_manager: "pnpm" }),
      );
      await put(join(github, "skills/demo/SKILL.md"), old);
      await put(join(github, "skills/obsolete/SKILL.md"), old);
    }
    const result = runCliWithCatalog(
      project,
      mode === "init" ? ["init", "--stack", "python"] : ["update"],
      process.env.PATH ?? "",
      env,
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/computed.not_registered/);
    if (mode === "init") {
      await expect(readFile(join(github, "spindle.json"))).rejects.toMatchObject({
        code: "ENOENT",
      });
      await expect(readFile(join(github, "skills/demo/SKILL.md"))).rejects.toMatchObject({
        code: "ENOENT",
      });
    } else {
      expect(await readFile(join(github, "skills/demo/SKILL.md"), "utf8")).toBe(old);
      expect(await readFile(join(github, "skills/obsolete/SKILL.md"), "utf8")).toBe(old);
      expect(JSON.parse(await readFile(join(github, "spindle.json"), "utf8"))).not.toHaveProperty(
        "tooling",
      );
    }
    await expect(readFile(join(project, "docs/agents/domain.md"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  },
);
