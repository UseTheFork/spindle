import assert from "node:assert/strict";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before, test } from "node:test";

import {
  makeJustStubDir,
  makeTempDir,
  pathWith,
  runCliWithFixtureCatalog as runCli,
} from "./helpers.ts";

let justDirectory: string;
let stubsDirectory: string;

before(async () => {
  justDirectory = await makeJustStubDir();
  stubsDirectory = await makeTempDir("spindle-existing-stubs-");
  for (const name of ["alpha", "beta"]) {
    await mkdir(join(stubsDirectory, "skills", name, "nested"), { recursive: true });
    await writeFile(
      join(stubsDirectory, "skills", name, "SKILL.md"),
      `---\nmeta:\n  spindle:\n    version: 1.0.0\n---\nfresh ${name}\n`,
    );
    await writeFile(
      join(stubsDirectory, "skills", name, "nested", "n.md"),
      `fresh nested ${name}\n`,
    );
  }
});

after(async () => {
  await rm(justDirectory, { recursive: true, force: true });
  await rm(stubsDirectory, { recursive: true, force: true });
});

async function withProject(
  setup: (project: string) => Promise<void>,
  args: string[],
  check: (project: string, result: ReturnType<typeof runCli>) => Promise<void>,
) {
  const project = await makeTempDir();
  try {
    await setup(project);
    const result = runCli(project, ["init", ...args], pathWith(justDirectory), {
      SPINDLE_BLUEPRINTS_DIR: stubsDirectory,
    });
    await check(project, result);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
}

async function seed(project: string, files: Record<string, string>) {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(project, path, ".."), { recursive: true });
    await writeFile(join(project, path), content);
  }
}

const existingAlpha = {
  ".github/skills/alpha/SKILL.md": "mine\n",
  ".github/skills/alpha/stale.md": "stale\n",
  ".github/skills/alpha/nested/old.md": "old\n",
};

test("existing config: init fails, points to update and changes nothing", async () => {
  const files = { ".github/spindle.json": '{"stacks":["python"],"variables":{}}\n' };
  await withProject(
    (project) => seed(project, files),
    ["--stack", "python", "--on-conflict", "overwrite"],
    async (project, result) => {
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /spindle update/);
      assert.equal(result.stdout, "");
      assert.deepEqual(await readdir(join(project, ".github")), ["spindle.json"]);
      assert.equal(
        await readFile(join(project, ".github/spindle.json"), "utf8"),
        files[".github/spindle.json"],
      );
    },
  );
});

test("existing config is checked before stack validation", async () => {
  await withProject(
    (project) => seed(project, { ".github/spindle.json": "{}\n" }),
    ["--stack", "ruby"],
    async (_project, result) => {
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /spindle update/);
    },
  );
});

test("--on-conflict overwrite re-renders and removes stale files", async () => {
  await withProject(
    (project) => seed(project, existingAlpha),
    ["--stack", "python", "--on-conflict", "overwrite"],
    async (project, result) => {
      assert.equal(result.status, 0, result.stderr);
      const alpha = join(project, ".github/skills/alpha");
      assert.equal(
        await readFile(join(alpha, "SKILL.md"), "utf8"),
        "---\nmeta:\n  spindle:\n    version: 1.0.0\n---\nfresh alpha\n",
      );
      assert.equal(await readFile(join(alpha, "nested/n.md"), "utf8"), "fresh nested alpha\n");
      assert.deepEqual((await readdir(alpha)).sort(), ["SKILL.md", "nested"]);
      assert.deepEqual(await readdir(join(alpha, "nested")), ["n.md"]);
      assert.equal(
        await readFile(join(project, ".github/skills/beta/SKILL.md"), "utf8"),
        "---\nmeta:\n  spindle:\n    version: 1.0.0\n---\nfresh beta\n",
      );
      assert.ok(await readFile(join(project, ".github/spindle.json"), "utf8"));
      assert.match(result.stdout, /Installed 2 skill\(s\)/);
    },
  );
});

test("--on-conflict skip leaves existing skills untouched and installs new ones", async () => {
  await withProject(
    (project) => seed(project, existingAlpha),
    ["--stack", "python", "--on-conflict", "skip"],
    async (project, result) => {
      assert.equal(result.status, 0, result.stderr);
      const alpha = join(project, ".github/skills/alpha");
      assert.equal(await readFile(join(alpha, "SKILL.md"), "utf8"), "mine\n");
      await assert.rejects(readFile(join(alpha, "stale.md")));
      await assert.rejects(readFile(join(alpha, "nested/old.md")));
      assert.deepEqual((await readdir(alpha)).sort(), ["SKILL.md", "nested"]);
      assert.deepEqual(await readdir(join(alpha, "nested")), []);
      assert.equal(
        await readFile(join(project, ".github/skills/beta/SKILL.md"), "utf8"),
        "---\nmeta:\n  spindle:\n    version: 1.0.0\n---\nfresh beta\n",
      );
      assert.deepEqual(JSON.parse(await readFile(join(project, ".github/spindle.json"), "utf8")), {
        stacks: ["python"],
        variables: {
          lint_command: "just lint",
          owner: "nobody",
        },
      });
      assert.match(result.stdout, /Installed 1 skill\(s\)/);
      assert.match(result.stdout, /Skipped 1/);
    },
  );
});

test("non-interactive conflict without a policy fails naming the flag and writes nothing", async () => {
  await withProject(
    (project) => seed(project, existingAlpha),
    ["--stack", "python", "--no-interactive"],
    async (project, result) => {
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /--on-conflict/);
      assert.equal(
        await readFile(join(project, ".github/skills/alpha/SKILL.md"), "utf8"),
        "mine\n",
      );
      assert.deepEqual(await readdir(join(project, ".github/skills")), ["alpha"]);
      await assert.rejects(readFile(join(project, ".github/spindle.json")));
    },
  );
});

test("invalid --on-conflict value is rejected", async () => {
  await withProject(
    async () => {},
    ["--stack", "python", "--on-conflict", "merge"],
    async (project, result) => {
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /--on-conflict.*overwrite.*skip/);
      await assert.rejects(readFile(join(project, ".github/spindle.json")));
    },
  );
});

test("--help documents --on-conflict", async () => {
  await withProject(
    async () => {},
    ["--help"],
    async (_project, result) => {
      assert.match(result.stdout, /--on-conflict <overwrite\|skip>/);
    },
  );
});
