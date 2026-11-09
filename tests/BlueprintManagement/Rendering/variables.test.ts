import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, test } from "vitest";

import {
  makeTempDir,
  runCliWithFixtureCatalog as runCli,
  runCliInteractiveWithFixtureCatalog as runCliInteractive,
} from "../../helpers.ts";

interface Definition {
  name: string;
  description: string;
  default?: string;
}

type CliResult = Pick<ReturnType<typeof runCli>, "status" | "stdout" | "stderr">;

// Runs init against a fixture Skill that prints the specified shared Variables.
async function withManifest(
  definitions: Definition[],
  args: string[],
  check: (result: CliResult, project: string) => Promise<void>,
  runner: (
    project: string,
    cliArgs: string[],
    searchPath: string,
    env: Record<string, string>,
  ) => Promise<CliResult> = async (project, cliArgs, searchPath, env) =>
    runCli(project, cliArgs, searchPath, env),
) {
  const stubs = await makeTempDir("spindle-stubs-");
  const project = await makeTempDir();
  try {
    await mkdir(join(stubs, "skills", "demo"), { recursive: true });
    await writeFile(
      join(stubs, "skills", "demo", "SKILL.md"),
      `---\nmetadata:\n  spindle:\n    version: 1.0.0\n---\n${definitions.map((d) => `${d.name}={{ variables.${d.name} }}`).join("\n")}\n`,
    );
    const result = await runner(project, ["init", ...args], process.env.PATH ?? "", {
      SPINDLE_TEST_BLUEPRINTS_DIR: stubs,
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
      expect(result.status, result.stderr).toBe(0);
      expect(await config(project)).toEqual({
        stacks: ["python"],
        variables: { lint_command: "just lint", owner: "core=team" },
      });
      expect(await readFile(join(project, ".github/skills/demo/SKILL.md"), "utf8")).toBe(
        "---\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nlint_command=just lint\nowner=core=team\n",
      );
    },
  );
});

test("a --var flag overrides the default and --var is repeatable", async () => {
  await withManifest(
    definitions,
    ["--stack", "python", "--var", "lint_command=make lint", "--var", "owner=me"],
    async (result, project) => {
      expect(result.status, result.stderr).toBe(0);
      expect((await config(project)).variables).toEqual({
        lint_command: "make lint",
        owner: "me",
      });
    },
  );
});

test("non-interactive init uses product Variable defaults without unrelated flags", async () => {
  await withManifest(definitions, ["--stack", "python"], async (result, project) => {
    expect(result.status, result.stderr).toBe(0);
    expect((await config(project)).variables).toEqual({
      lint_command: "just lint",
      owner: "nobody",
    });
    expect(await readFile(join(project, ".github/skills/demo/SKILL.md"), "utf8")).toBe(
      "---\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nlint_command=just lint\nowner=nobody\n",
    );
  });
});

test(
  "interactive init prompts for shared product Variables and accepts their defaults",
  { skip: process.platform !== "linux" },
  async () => {
    await withManifest(
      definitions,
      ["--stack", "python"],
      async (result, project) => {
        expect(result.status, result.stdout).toBe(0);
        expect(result.stdout).toMatch(/lint_command: Lint command/);
        expect(result.stdout).toMatch(/owner: Team owner/);
        expect((await config(project)).variables).toEqual({
          lint_command: "just lint",
          owner: "nobody",
        });
        expect(await readFile(join(project, ".github/skills/demo/SKILL.md"), "utf8")).toBe(
          "---\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nlint_command=just lint\nowner=nobody\n",
        );
      },
      (project, args, searchPath, env) =>
        runCliInteractive(
          project,
          args,
          searchPath,
          [
            { trigger: "lint_command: Lint command", input: "\r" },
            { trigger: "owner: Team owner", input: "\r" },
          ],
          env,
        ),
    );
  },
);

test("--no-interactive makes missing required input an error", async () => {
  await withManifest(definitions, ["--no-interactive"], async (result, project) => {
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/at least one --stack/i);
    await expect(readFile(join(project, ".github/spindle.json"))).rejects.toThrow();
  });
});

test("unknown variable names are rejected", async () => {
  await withManifest(
    definitions,
    ["--stack", "python", "--var", "owner=a", "--var", "nope=x"],
    async (result, project) => {
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/unknown variable.*nope/i);
      await expect(readFile(join(project, ".github/spindle.json"))).rejects.toThrow();
    },
  );
});

test("malformed --var values are rejected", async () => {
  await withManifest(definitions, ["--stack", "python", "--var", "owner"], async (result) => {
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/--var.*<name>=<value>/i);
  });
});

test("typed Variable definitions apply independently of Blueprint fixtures", async () => {
  await withManifest([], ["--stack", "typescript"], async (result, project) => {
    expect(result.status, result.stderr).toBe(0);
    expect(await config(project)).toEqual({
      stacks: ["typescript"],
      variables: { lint_command: "just lint", owner: "nobody" },
    });
  });
});

test("root help discovers commands and init help documents init options", async () => {
  const project = await makeTempDir();
  try {
    const rootHelp = runCli(project, ["--help"], process.env.PATH ?? "");
    expect(rootHelp.status, rootHelp.stderr).toBe(0);
    for (const command of ["init", "update", "sdd", "setup-project"]) {
      expect(rootHelp.stdout).toMatch(new RegExp(`^\\s*${command}\\b`, "m"));
    }

    const initHelp = runCli(project, ["init", "--help"], process.env.PATH ?? "");
    expect(initHelp.status, initHelp.stderr).toBe(0);
    for (const flag of ["--stack", "--var", "--no-interactive", "--help"]) {
      expect(initHelp.stdout).toMatch(new RegExp(flag));
    }
    expect(initHelp.stdout).toMatch(/php-laravel/);
    await expect(readFile(join(project, ".github/spindle.json"))).rejects.toThrow();
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});
