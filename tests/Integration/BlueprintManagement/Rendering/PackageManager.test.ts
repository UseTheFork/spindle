import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, test } from "vitest";

import { writeFixtureCatalog } from "../../../Helpers/CatalogFixtures.ts";
import {
  runCliInteractiveWithFixtureCatalogRaw,
  runCliWithFixtureCatalog as runCli,
  runCliWithFixtureCatalogRaw,
} from "../../../Helpers/Cli.ts";
import { makeTempDir } from "../../../Helpers/TemporaryDirectories.ts";

async function setupBlueprints() {
  const blueprints = await makeTempDir("spindle-package-manager-blueprints-");
  await mkdir(join(blueprints, "skills", "demo"), { recursive: true });
  await writeFile(
    join(blueprints, "skills", "demo", "SKILL.md"),
    "---\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nCommand={{ computed.spindle_package_manager }}\n",
  );
  writeFixtureCatalog(blueprints);
  return blueprints;
}

test("non-interactive init requires --spindle-package-manager", async () => {
  const blueprints = await setupBlueprints();
  const project = await makeTempDir("spindle-package-manager-required-");

  execFileSync("git", ["init", "-q"], { cwd: project });
  const result = runCliWithFixtureCatalogRaw(
    project,
    ["init", "--stack", "python"],
    process.env.PATH ?? "",
    { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints },
  );

  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/--spindle-package-manager <command>/);
  await expect(readFile(join(project, ".github/spindle.json"))).rejects.toThrow();
});

test("init persists the selected command, renders its computed value, and drops legacy variables", async () => {
  const blueprints = await setupBlueprints();
  const project = await makeTempDir("spindle-package-manager-init-");
  await mkdir(join(project, ".github"), { recursive: true });
  await writeFile(
    join(project, ".github", "spindle.json"),
    '{"stacks":[],"variables":{"owner":"legacy"}}\n',
  );

  const result = runCli(
    project,
    ["init", "--stack", "python", "--spindle-package-manager", "npm run"],
    process.env.PATH ?? "",
    { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints },
  );

  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(await readFile(join(project, ".github/spindle.json"), "utf8"))).toMatchObject({
    stacks: ["python"],
    spindle_package_manager: "npm run",
  });
  expect(
    JSON.parse(await readFile(join(project, ".github/spindle.json"), "utf8")),
  ).not.toHaveProperty("variables");
  expect(await readFile(join(project, ".github/skills/demo/SKILL.md"), "utf8")).toContain(
    "Command=npm run",
  );
});

test.each(["", " \t "])("init rejects an empty package-manager command: %j", (command) => {
  const project = makeTempDir("spindle-package-manager-invalid-");
  return project.then(async (root) => {
    const result = runCli(
      root,
      ["init", "--stack", "python", "--spindle-package-manager", command],
      process.env.PATH ?? "",
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/non-empty, single-line command/);
  });
});

test(
  "interactive init accepts a custom package-manager command",
  { skip: process.platform !== "linux" },
  async () => {
    const blueprints = await setupBlueprints();
    const project = await makeTempDir("spindle-package-manager-other-");
    execFileSync("git", ["init", "-q"], { cwd: project });
    const result = await runCliInteractiveWithFixtureCatalogRaw(
      project,
      ["init", "--stack", "python"],
      process.env.PATH ?? "",
      [
        {
          trigger: "Which package-manager command should Spindle use",
          input: "\u001b[B\u001b[B\u001b[B\u001b[B\r",
        },
        {
          trigger: "Enter the package-manager command prefix",
          input: "custom run\r",
        },
      ],
      { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(
      JSON.parse(await readFile(join(project, ".github/spindle.json"), "utf8"))
        .spindle_package_manager,
    ).toBe("custom run");
  },
);
