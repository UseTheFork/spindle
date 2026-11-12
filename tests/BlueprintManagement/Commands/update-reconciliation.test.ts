import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { expect, test } from "vitest";

import { writeCatalogFixture } from "../../helpers/CatalogFixtures.ts";
import { runCliWithCatalog } from "../../helpers/Cli.ts";
import { makeTempDir } from "../../helpers/TemporaryDirectories.ts";

const managed = (version: string, text: string) =>
  `---\nmetadata:\n  spindle:\n    version: ${version}\n---\n${text}\n`;

async function put(path: string, text: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
}

test("update reconciles managed items without touching unmanaged items", async () => {
  const project = await makeTempDir("spindle-auto-update-project-");
  const blueprints = await makeTempDir("spindle-auto-update-assets-");
  const github = join(project, ".github");
  writeCatalogFixture(blueprints, {
    agents: { group: { path: "group/", stacks: [] } },
    instructions: { instruction: { path: "guide.instructions.md", stacks: [] } },
    skills: {
      current: { path: "current/", stacks: [] },
      repair: { path: "repair/", stacks: [] },
      collision: { path: "collision/", stacks: [] },
      otherStack: { path: "other-stack/", stacks: ["typescript"] },
      fresh: { path: "fresh/", stacks: [] },
    },
  });
  await put(
    join(github, "spindle.json"),
    JSON.stringify({ stacks: ["python"], spindle_package_manager: "pnpm" }),
  );
  await put(join(blueprints, "agents/group/new.agent.md"), managed("2.0.0", "new agent"));
  await put(
    join(blueprints, "instructions/guide.instructions.md"),
    managed("1.0.0", "new instruction"),
  );
  for (const name of ["current", "repair", "collision", "other-stack", "fresh"]) {
    await put(join(blueprints, `skills/${name}/SKILL.md`), managed("2.0.0", `shipped ${name}`));
  }
  await put(join(github, "agents/group/new.agent.md"), managed("1.0.0", "old agent"));
  await put(
    join(github, "agents/group/obsolete.agent.md"),
    "---\nmetadata:\n  spindle: null\n---\nold\n",
  );
  await put(join(github, "agents/group/custom.agent.md"), "custom agent\n");
  await put(join(github, "instructions/obsolete.instructions.md"), managed("9.0.0", "obsolete"));
  await put(join(github, "skills/current/SKILL.md"), managed("3.0.0", "newer local"));
  await put(join(github, "skills/current/extra.txt"), "extra");
  await put(
    join(github, "skills/repair/SKILL.md"),
    "---\nmetadata:\n  spindle: {}\n---\ninvalid\n",
  );
  await put(join(github, "skills/collision/SKILL.md"), "custom skill\n");
  await put(join(github, "skills/collision/extra.txt"), "keep");
  await put(join(github, "skills/other-stack/SKILL.md"), managed("1.0.0", "wrong stack"));
  await put(join(github, "skills/obsolete/SKILL.md"), managed("999.0.0", "obsolete"));
  await put(join(github, "skills/obsolete/local.txt"), "remove");
  const result = runCliWithCatalog(project, ["update"], process.env.PATH ?? "", {
    SPINDLE_TEST_BLUEPRINTS_DIR: blueprints,
  });
  expect(result.status, result.stderr).toBe(0);
  expect(await readFile(join(github, "agents/group/new.agent.md"), "utf8")).toContain("new agent");
  expect(await readFile(join(github, "agents/group/custom.agent.md"), "utf8")).toBe(
    "custom agent\n",
  );
  await expect(readFile(join(github, "agents/group/obsolete.agent.md"))).rejects.toMatchObject({
    code: "ENOENT",
  });
  await expect(
    readFile(join(github, "instructions/obsolete.instructions.md")),
  ).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readFile(join(github, "instructions/guide.instructions.md"), "utf8")).toContain(
    "new instruction",
  );
  expect(await readFile(join(github, "skills/current/SKILL.md"), "utf8")).toContain("newer local");
  await expect(readFile(join(github, "skills/current/extra.txt"))).rejects.toMatchObject({
    code: "ENOENT",
  });
  expect(await readFile(join(github, "skills/repair/SKILL.md"), "utf8")).toContain(
    "shipped repair",
  );
  expect(await readFile(join(github, "skills/collision/extra.txt"), "utf8")).toBe("keep");
  expect(result.stderr).toContain("not managed by Spindle");
  await expect(readFile(join(github, "skills/other-stack/SKILL.md"))).rejects.toMatchObject({
    code: "ENOENT",
  });
  await expect(readFile(join(github, "skills/obsolete/local.txt"))).rejects.toMatchObject({
    code: "ENOENT",
  });
  expect(await readFile(join(github, "skills/fresh/SKILL.md"), "utf8")).toContain("shipped fresh");
});

test("malformed metadata stops all changes including obsolete removals", async () => {
  const project = await makeTempDir("spindle-update-malformed-project-");
  const blueprints = await makeTempDir("spindle-update-malformed-assets-");
  const github = join(project, ".github");
  writeCatalogFixture(blueprints, {
    agents: {},
    instructions: {},
    skills: { fresh: { path: "fresh/", stacks: [] } },
  });
  await put(join(blueprints, "skills/fresh/SKILL.md"), managed("1.0.0", "new"));
  await put(
    join(github, "spindle.json"),
    JSON.stringify({ stacks: ["python"], spindle_package_manager: "pnpm" }),
  );
  await put(join(github, "agents/obsolete.agent.md"), managed("1.0.0", "keep until valid"));
  await put(join(github, "instructions/broken.instructions.md"), "---\nmetadata: [broken\n---\n");
  const result = runCliWithCatalog(project, ["update"], process.env.PATH ?? "", {
    SPINDLE_TEST_BLUEPRINTS_DIR: blueprints,
  });

  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("Cannot read Blueprint metadata");
  expect(await readFile(join(github, "agents/obsolete.agent.md"), "utf8")).toContain(
    "keep until valid",
  );
  await expect(readFile(join(github, "skills/fresh/SKILL.md"))).rejects.toMatchObject({
    code: "ENOENT",
  });
});

test("updating an empty catalog remains successful after obsolete items are removed", async () => {
  const project = await makeTempDir("spindle-empty-update-project-");
  const blueprints = await makeTempDir("spindle-empty-update-assets-");
  const github = join(project, ".github");
  writeCatalogFixture(blueprints, { agents: {}, instructions: {}, skills: {} });
  await put(
    join(github, "spindle.json"),
    JSON.stringify({ stacks: ["python"], spindle_package_manager: "pnpm" }),
  );
  await put(join(github, "agents/old.agent.md"), managed("1.0.0", "old"));
  const env = { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints };
  const first = runCliWithCatalog(project, ["update"], process.env.PATH ?? "", env);
  expect(first.status, first.stderr).toBe(0);
  await expect(readFile(join(github, "agents/old.agent.md"))).rejects.toMatchObject({
    code: "ENOENT",
  });
  const second = runCliWithCatalog(project, ["update"], process.env.PATH ?? "", env);
  expect(second.status, second.stderr).toBe(0);
});

test("update reconciles catalog and obsolete skills in nested directories", async () => {
  const project = await makeTempDir("spindle-nested-update-project-");
  const blueprints = await makeTempDir("spindle-nested-update-assets-");
  const github = join(project, ".github");
  writeCatalogFixture(blueprints, {
    agents: {},
    instructions: {},
    skills: { nested: { path: "group/current/", stacks: [] } },
  });
  await put(
    join(github, "spindle.json"),
    JSON.stringify({ stacks: ["python"], spindle_package_manager: "pnpm" }),
  );
  await put(join(blueprints, "skills/group/current/SKILL.md"), managed("2.0.0", "new"));
  await put(join(github, "skills/group/current/SKILL.md"), managed("1.0.0", "old"));
  await put(join(github, "skills/group/obsolete/SKILL.md"), managed("1.0.0", "obsolete"));
  const result = runCliWithCatalog(project, ["update"], process.env.PATH ?? "", {
    SPINDLE_TEST_BLUEPRINTS_DIR: blueprints,
  });
  expect(result.status, result.stderr).toBe(0);
  expect(await readFile(join(github, "skills/group/current/SKILL.md"), "utf8")).toContain("new");
  await expect(readFile(join(github, "skills/group/obsolete/SKILL.md"))).rejects.toMatchObject({
    code: "ENOENT",
  });
});
