import assert from "node:assert/strict";
import { readFile, readdir, rm } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { after, before, test } from "node:test";

import { supportedStacks } from "../src/install.ts";
import { renderText } from "../src/render.ts";
import { makeJustStubDir, makeTempDir, pathWith, runCli } from "./helpers.ts";

const shippedSkills = resolve(process.cwd(), "src/blueprints/skills");
let justDirectory: string;

before(async () => {
  justDirectory = await makeJustStubDir();
});

after(async () => {
  await rm(justDirectory, { recursive: true, force: true });
});

async function skillDirectories(directory: string) {
  return (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function filesUnder(directory: string, prefix = ""): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const relativePath = join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(path, relativePath)));
    else files.push(relativePath);
  }
  return files;
}

function hasSemverVersion(content: string) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return false;
  const version = match[1].match(/^version:\s*(\S+)\s*$/m)?.[1];
  if (!version) return false;
  return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.test(
    version,
  );
}

test("every shipped skill has a semver version in SKILL.md frontmatter", async () => {
  const skillFiles = (await filesUnder(shippedSkills))
    .filter((file) => basename(file) === "SKILL.md")
    .map((file) => join(shippedSkills, file));
  assert.ok(skillFiles.length > 0, "expected shipped Skill Blueprints");

  for (const file of skillFiles) {
    const content = await readFile(file, "utf8");
    assert.equal(
      hasSemverVersion(content),
      true,
      `${relative(shippedSkills, file)} needs a semver version`,
    );
  }
});

test("only author-blueprint remains a local skill", async () => {
  assert.deepEqual(await skillDirectories(".github/skills"), ["author-blueprint"]);
});

for (let selection = 1; selection < 1 << supportedStacks.length; selection += 1) {
  const stacks = supportedStacks.filter((_, index) => selection & (1 << index));

  test(`init installs every production Blueprint and supporting file for ${stacks.join(", ")}`, async () => {
    const expectedDirectories = await skillDirectories(shippedSkills);
    const project = await makeTempDir("spindle-production-init-");
    try {
      const result = runCli(
        project,
        ["init", ...stacks.flatMap((stack) => ["--stack", stack])],
        pathWith(justDirectory),
      );
      assert.equal(result.status, 0, result.stderr);

      const installedRoot = join(project, ".github/skills");
      assert.deepEqual(await skillDirectories(installedRoot), expectedDirectories);

      for (const skill of expectedDirectories) {
        const sourceDirectory = join(shippedSkills, skill);
        const installedDirectory = join(installedRoot, skill);
        const sourceFiles = (await filesUnder(sourceDirectory)).sort();
        const installedFiles = (await filesUnder(installedDirectory)).sort();
        assert.deepEqual(installedFiles, sourceFiles, `${skill} installed file set differs`);

        for (const file of sourceFiles) {
          const source = await readFile(join(sourceDirectory, file), "utf8");
          const installed = await readFile(join(installedDirectory, file), "utf8");
          assert.equal(
            installed,
            renderText(source, {
              stacks,
              variables: { lint_command: "just lint", owner: "nobody" },
            }),
            `${skill}/${file} differs from rendered source`,
          );
        }
      }
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });
}
