import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { beforeEach, expect, test } from "vitest";

import { runCliWithFixtureCatalog as runCli } from "../../helpers/Cli.ts";
import { makeTempDir } from "../../helpers/TemporaryDirectories.ts";

let stubsDirectory: string;

beforeEach(async () => {
  stubsDirectory = await makeTempDir("spindle-existing-stubs-");
  for (const name of ["alpha", "beta"]) {
    await mkdir(join(stubsDirectory, "skills", name, "nested"), { recursive: true });
    await writeFile(
      join(stubsDirectory, "skills", name, "SKILL.md"),
      `---\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nfresh ${name}\n`,
    );
    await writeFile(
      join(stubsDirectory, "skills", name, "nested", "n.md"),
      `fresh nested ${name}\n`,
    );
  }
});

async function withProject(
  setup: (project: string) => Promise<void>,
  args: string[],
  check: (project: string, result: ReturnType<typeof runCli>) => Promise<void>,
) {
  const project = await makeTempDir();
  await setup(project);
  const result = runCli(project, ["init", ...args], process.env.PATH ?? "", {
    SPINDLE_TEST_BLUEPRINTS_DIR: stubsDirectory,
  });
  await check(project, result);
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

test("existing config: init initializes project guidance and points to update", async () => {
  const files = {
    ".github/spindle.json":
      '{"stacks":["python"],"spindle_package_manager":"pnpm","variables":{}}\n',
  };
  await withProject(
    (project) => seed(project, files),
    ["--stack", "python", "--on-conflict", "overwrite"],
    async (project, result) => {
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/spindle update/);
      expect(result.stdout).toContain("Initialized project guidance and tooling documentation.");
      expect(await readFile(join(project, "docs/agents/domain.md"), "utf8")).not.toBe("");
      const config = JSON.parse(await readFile(join(project, ".github/spindle.json"), "utf8"));
      expect(config.stacks).toEqual(["python"]);
      expect(config.variables).toEqual({});
      expect(config.spindle_package_manager).toBe("pnpm");
      expect(config.tooling).toEqual([]);
    },
  );
});

test("invalid stack is rejected before the existing-config workflow check", async () => {
  const config = "{}\n";
  await withProject(
    (project) => seed(project, { ".github/spindle.json": config }),
    ["--stack", "ruby"],
    async (project, result) => {
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/Invalid stack 'ruby'/);
      expect(result.stdout).toBe("");
      expect(await readdir(join(project, ".github"))).toEqual(["spindle.json"]);
      expect(await readFile(join(project, ".github/spindle.json"), "utf8")).toBe(config);
    },
  );
});

test("--on-conflict overwrite re-renders and removes stale files", async () => {
  await withProject(
    (project) => seed(project, existingAlpha),
    ["--stack", "python", "--on-conflict", "overwrite"],
    async (project, result) => {
      expect(result.status, result.stderr).toBe(0);
      const alpha = join(project, ".github/skills/alpha");
      expect(await readFile(join(alpha, "SKILL.md"), "utf8")).toBe(
        "---\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nfresh alpha\n",
      );
      expect(await readFile(join(alpha, "nested/n.md"), "utf8")).toBe("fresh nested alpha\n");
      expect((await readdir(alpha)).sort()).toEqual(["SKILL.md", "nested"]);
      expect(await readdir(join(alpha, "nested"))).toEqual(["n.md"]);
      expect(await readFile(join(project, ".github/skills/beta/SKILL.md"), "utf8")).toBe(
        "---\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nfresh beta\n",
      );
      expect(await readFile(join(project, ".github/spindle.json"), "utf8")).toBeTruthy();
      expect(result.stdout).toMatch(/Installed 2 skill\(s\)/);
    },
  );
});

test("--on-conflict skip leaves existing skills untouched and installs new ones", async () => {
  await withProject(
    (project) => seed(project, existingAlpha),
    ["--stack", "python", "--on-conflict", "skip"],
    async (project, result) => {
      expect(result.status, result.stderr).toBe(0);
      const alpha = join(project, ".github/skills/alpha");
      expect(await readFile(join(alpha, "SKILL.md"), "utf8")).toBe("mine\n");
      await expect(readFile(join(alpha, "stale.md"))).rejects.toThrow();
      await expect(readFile(join(alpha, "nested/old.md"))).rejects.toThrow();
      expect((await readdir(alpha)).sort()).toEqual(["SKILL.md", "nested"]);
      expect(await readdir(join(alpha, "nested"))).toEqual([]);
      expect(await readFile(join(project, ".github/skills/beta/SKILL.md"), "utf8")).toBe(
        "---\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nfresh beta\n",
      );
      expect(
        JSON.parse(await readFile(join(project, ".github/spindle.json"), "utf8")),
      ).toMatchObject({
        stacks: ["python"],
        spindle_package_manager: "pnpm",
      });
      expect(result.stdout).toMatch(/Installed 1 skill\(s\)/);
      expect(result.stdout).toMatch(/Skipped 1/);
    },
  );
});

test("non-interactive conflict without a policy fails naming the flag and writes nothing", async () => {
  await withProject(
    (project) => seed(project, existingAlpha),
    ["--stack", "python", "--no-interactive"],
    async (project, result) => {
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/--on-conflict/);
      expect(await readFile(join(project, ".github/skills/alpha/SKILL.md"), "utf8")).toBe("mine\n");
      expect(await readdir(join(project, ".github/skills"))).toEqual(["alpha"]);
      await expect(readFile(join(project, ".github/spindle.json"))).rejects.toThrow();
    },
  );
});

test("invalid --on-conflict value is rejected", async () => {
  await withProject(
    async () => {},
    ["--stack", "python", "--on-conflict", "merge"],
    async (project, result) => {
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/--on-conflict.*overwrite.*skip/);
      await expect(readFile(join(project, ".github/spindle.json"))).rejects.toThrow();
    },
  );
});

test("--help documents --on-conflict", async () => {
  await withProject(
    async () => {},
    ["--help"],
    async (_project, result) => {
      expect(result.stdout).toMatch(/--on-conflict <overwrite\|skip>/);
    },
  );
});
