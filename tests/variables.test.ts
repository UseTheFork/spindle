import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { makeJustStubDir, makeTempDir, pathWith, runCli } from "./helpers.ts";

let justDirectory: string;

before(async () => {
  justDirectory = await makeJustStubDir();
});

after(async () => {
  await rm(justDirectory, { recursive: true, force: true });
});

interface Definition {
  name: string;
  description: string;
  default?: string;
}

// Runs init against fixture stubs with the given variable manifest and a skill that prints every variable.
async function withManifest(
  definitions: Definition[],
  args: string[],
  check: (result: ReturnType<typeof runCli>, project: string) => Promise<void>,
) {
  const stubs = await makeTempDir("spindle-stubs-");
  const project = await makeTempDir();
  try {
    await mkdir(join(stubs, "skills", "demo"), { recursive: true });
    await writeFile(
      join(stubs, "skills", "demo", "SKILL.md"),
      definitions.map((d) => `${d.name}={{ variables.${d.name} }}`).join("\n") + "\n",
    );
    await writeFile(join(stubs, "variables.json"), JSON.stringify(definitions));
    const result = runCli(project, ["init", ...args], pathWith(justDirectory), {
      SPINDLE_STUBS_DIR: stubs,
    });
    await check(result, project);
  } finally {
    await rm(stubs, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
}

const config = async (project: string) =>
  JSON.parse(await readFile(join(project, ".github/spindle.json"), "utf8"));

const definitions: Definition[] = [
  { name: "lint_command", description: "Lint command", default: "just lint" },
  { name: "owner", description: "Team owner" },
];

test("flags supply variables and defaults apply when allowed", async () => {
  await withManifest(
    definitions,
    ["--stack", "python", "--var", "owner=core=team"],
    async (result, project) => {
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(await config(project), {
        stacks: ["python"],
        variables: { lint_command: "just lint", owner: "core=team" },
      });
      assert.equal(
        await readFile(join(project, ".github/skills/demo/SKILL.md"), "utf8"),
        "lint_command=just lint\nowner=core=team\n",
      );
    },
  );
});

test("a --var flag overrides the default and --var is repeatable", async () => {
  await withManifest(
    definitions,
    ["--stack", "python", "--var", "lint_command=make lint", "--var", "owner=me"],
    async (result, project) => {
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual((await config(project)).variables, {
        lint_command: "make lint",
        owner: "me",
      });
    },
  );
});

test("a variable without default or flag is an error naming it, even with a TTY-less stdin", async () => {
  await withManifest(definitions, ["--stack", "python"], async (result, project) => {
    assert.equal(result.status, 1);
    assert.match(result.stderr, /owner/);
    assert.match(result.stderr, /--var/);
    await assert.rejects(readFile(join(project, ".github/spindle.json")));
  });
});

test("--no-interactive makes missing required input an error", async () => {
  await withManifest(definitions, ["--no-interactive"], async (result, project) => {
    assert.equal(result.status, 1);
    assert.match(result.stderr, /at least one --stack/i);
    await assert.rejects(readFile(join(project, ".github/spindle.json")));
  });
});

test("unknown variable names are rejected", async () => {
  await withManifest(
    definitions,
    ["--stack", "python", "--var", "owner=a", "--var", "nope=x"],
    async (result, project) => {
      assert.equal(result.status, 1);
      assert.match(result.stderr, /unknown variable.*nope/i);
      await assert.rejects(readFile(join(project, ".github/spindle.json")));
    },
  );
});

test("malformed --var values are rejected", async () => {
  await withManifest(definitions, ["--stack", "python", "--var", "owner"], async (result) => {
    assert.equal(result.status, 1);
    assert.match(result.stderr, /--var.*<name>=<value>/i);
  });
});

test("an empty manifest yields an empty variables object", async () => {
  await withManifest([], ["--stack", "typescript"], async (result, project) => {
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(await config(project), { stacks: ["typescript"], variables: {} });
  });
});

test("help documents every flag and exits 0", async () => {
  const project = await makeTempDir();
  try {
    for (const args of [["--help"], ["init", "--help"]]) {
      const result = runCli(project, args, pathWith(justDirectory));
      assert.equal(result.status, 0, result.stderr);
      for (const flag of ["--stack", "--var", "--no-interactive", "--help"]) {
        assert.match(result.stdout, new RegExp(flag));
      }
      assert.match(result.stdout, /php-laravel/);
    }
    await assert.rejects(readFile(join(project, ".github/spindle.json")));
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});
