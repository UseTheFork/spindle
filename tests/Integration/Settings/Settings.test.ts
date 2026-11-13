import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, test, vi } from "vitest";

import { SettingsService } from "@/Settings/Services/SettingsService";

import { runCli, runCliInteractive } from "../../Helpers/Cli.ts";
import { serviceFixture } from "../../Helpers/SubagentDrivenDevelopment/helpers";
import { makeTempDir } from "../../Helpers/TemporaryDirectories.ts";

vi.setConfig({ testTimeout: 30_000 });

test("settings reads use the boot-bound snapshot", async () => {
  const { app, repo } = await serviceFixture();
  const service = new SettingsService(app);
  await writeFile(
    join(repo, ".github", "spindle.json"),
    JSON.stringify({
      stacks: ["python"],
      spindle_package_manager: "pnpm",
      commit: { allow_body: true },
    }),
  );

  await expect(service.get("commit.allow_body")).resolves.toBe(false);
});

test("init persists defaults and settings changes regenerate commit guidance", async () => {
  const project = await makeTempDir("spindle-settings-");
  const run = (args: string[]) => runCli(project, args, process.env.PATH ?? "");
  const init = run(["init", "--stack", "typescript", "--spindle-package-manager", "pnpm"]);
  expect(init.status, init.stderr).toBe(0);
  const configPath = join(project, ".github/spindle.json");
  const skillPath = join(project, ".github/skills/int-commit-format/SKILL.md");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const { version } = JSON.parse(
    await readFile(new URL("../../../package.json", import.meta.url), "utf8"),
  );
  expect(config.$schema).toBe(
    `https://unpkg.com/@use-the-fork/spindle@${version}/build/spindle.schema.json`,
  );
  expect(config.commit).toEqual({
    allow_body: false,
    title_max_length: 72,
    scopes_enabled: false,
    allowed_scopes: [],
    allow_breaking_changes: false,
  });
  expect(await readFile(skillPath, "utf8")).toContain("Use the title only");
  delete config.commit;
  delete config.tooling;
  config.extra = { preserved: true };
  await writeFile(configPath, JSON.stringify(config));
  const legacy = run(["--json", "settings", "get", "commit.allow_body"]);
  expect(JSON.parse(legacy.stdout)).toEqual({ ok: true, data: false });
  for (const [key, value] of [
    ["commit.allowed_scopes", '["api","user-auth"]'],
    ["commit.scopes_enabled", "true"],
    ["commit.allow_body", "true"],
    ["commit.allow_breaking_changes", "true"],
    ["commit.title_max_length", "40"],
  ]) {
    const result = run(["settings", "set", key!, value!]);
    expect(result.status, result.stderr).toBe(0);
  }
  const skill = await readFile(skillPath, "utf8");
  expect(skill).toContain("at most 40 characters");
  expect(skill).toContain("Allowed scopes: api, user-auth");
  expect(skill).toContain("A body is optional");
  expect(skill).toContain("Mark every breaking change with !");
  expect(skill).toContain("feat(api): add login");
  const saved = JSON.parse(await readFile(configPath, "utf8"));
  expect(saved.extra).toEqual({ preserved: true });
  expect(saved.tooling).toEqual([]);
  const result = run(["--json", "settings", "get", "commit.scopes_enabled"]);
  expect(JSON.parse(result.stdout)).toEqual({ ok: true, data: true });

  const before = await readFile(configPath, "utf8");
  const invalid = run(["settings", "set", "commit.allowed_scopes", "[]"]);
  expect(invalid.status).not.toBe(0);
  const tooShort = run(["settings", "set", "commit.title_max_length", "22"]);
  expect(tooShort.status).not.toBe(0);
  expect(await readFile(configPath, "utf8")).toBe(before);
  expect(await readFile(skillPath, "utf8")).toBe(skill);
  const minimum = run(["settings", "set", "commit.title_max_length", "23"]);
  expect(minimum.status, minimum.stderr).toBe(0);
  const examples = (await readFile(skillPath, "utf8"))
    .split("\n")
    .filter((line) => line.startsWith("- "));
  expect(examples).toHaveLength(2);
  expect(examples.every((line) => line.slice(2).length <= 23)).toBe(true);
});

test("invalid existing settings report fields and cannot be overwritten", async () => {
  const project = await makeTempDir("spindle-settings-invalid-");
  const run = (args: string[]) => runCli(project, args, process.env.PATH ?? "");
  const init = run(["init", "--stack", "python", "--spindle-package-manager", "pnpm"]);
  expect(init.status, init.stderr).toBe(0);
  const path = join(project, ".github/spindle.json");
  const config = JSON.parse(await readFile(path, "utf8"));
  config.commit.title_max_length = 1;
  const invalid = JSON.stringify(config);
  await writeFile(path, invalid);

  const result = run(["settings", "set", "commit.title_max_length", "72"]);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("commit.title_max_length");
  expect(await readFile(path, "utf8")).toBe(invalid);
});

test("init preserves unrecognized settings in an existing uninitialized configuration", async () => {
  const project = await makeTempDir("spindle-settings-legacy-");
  const configPath = join(project, ".github/spindle.json");
  await mkdir(join(project, ".github"), { recursive: true });
  await writeFile(configPath, JSON.stringify({ stacks: [], variables: { owner: "kept" } }));
  const result = runCli(
    project,
    ["init", "--stack", "python", "--spindle-package-manager", "pnpm"],
    process.env.PATH ?? "",
  );
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(await readFile(configPath, "utf8")).variables).toEqual({ owner: "kept" });
});

test("settings and update overwrite catalog collisions while preserving unrelated assets", async () => {
  const project = await makeTempDir("spindle-settings-update-");
  const run = (args: string[]) => runCli(project, args, process.env.PATH ?? "");
  const init = run(["init", "--stack", "python", "--spindle-package-manager", "pnpm"]);
  expect(init.status, init.stderr).toBe(0);
  const skill = join(project, ".github/skills/int-commit-format/SKILL.md");
  const extra = join(project, ".github/skills/int-commit-format/extra.txt");
  const custom = join(project, ".github/skills/custom/SKILL.md");
  await writeFile(skill, "---\nmetadata: [broken\n---\n");
  await writeFile(extra, "local extra");
  await mkdir(join(project, ".github/skills/custom"), { recursive: true });
  await writeFile(custom, "custom skill");
  const result = run(["update"]);
  expect(result.status, result.stderr).toBe(0);
  expect(await readFile(skill, "utf8")).toContain("Commit format");
  await expect(readFile(extra)).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readFile(custom, "utf8")).toBe("custom skill");
  const enableStack = run(["settings", "set", "stacks", '["php-laravel"]']);
  expect(enableStack.status, enableStack.stderr).toBe(0);
  const phpSkill = join(project, ".github/skills/ref-php-laravel-framework/SKILL.md");
  expect(await readFile(phpSkill, "utf8")).toContain("laravel");
  const removeStack = run(["settings", "set", "stacks", '["python"]']);
  expect(removeStack.status, removeStack.stderr).toBe(0);
  await expect(readFile(phpSkill)).rejects.toMatchObject({ code: "ENOENT" });
});

test(
  "interactive init can enable commit settings",
  { skip: process.platform !== "linux" },
  async () => {
    const project = await makeTempDir("spindle-settings-init-");
    const result = await runCliInteractive(
      project,
      ["init", "--stack", "python", "--spindle-package-manager", "pnpm"],
      process.env.PATH ?? "",
      [
        { trigger: "Allow commit message bodies?", input: "y\r" },
        { trigger: "Maximum commit title length", input: "\r" },
        { trigger: "Require commit scopes?", input: "y\r" },
        { trigger: "Allowed scopes", input: "api, ui\r" },
        { trigger: "Allow breaking-change notation?", input: "y\r" },
      ],
    );
    expect(result.status, result.stdout + result.stderr).toBe(0);
    const config = JSON.parse(await readFile(join(project, ".github/spindle.json"), "utf8"));
    expect(config.commit).toEqual({
      allow_body: true,
      title_max_length: 72,
      scopes_enabled: true,
      allowed_scopes: ["api", "ui"],
      allow_breaking_changes: true,
    });
  },
);

test(
  "interactive settings walks through known settings",
  { skip: process.platform !== "linux" },
  async () => {
    const project = await makeTempDir("spindle-settings-interactive-");
    const init = runCli(
      project,
      ["init", "--stack", "python", "--spindle-package-manager", "pnpm"],
      process.env.PATH ?? "",
    );
    expect(init.status, init.stderr).toBe(0);
    const result = await runCliInteractive(project, ["settings"], process.env.PATH ?? "", [
      { trigger: "Which stacks does this project use?", input: "\r" },
      { trigger: "Spindle package-manager command", input: "\r" },
      { trigger: "Manage tooling entries", input: "\x1b[B\r" },
      { trigger: "Tooling key", input: "check\r" },
      { trigger: "Tooling section", input: "Testing\r" },
      { trigger: "Tooling command", input: "pnpm test\r" },
      { trigger: "Tooling description", input: "\r" },
      { trigger: "Continue (1 entries)", input: "\r" },
      { trigger: "Allow commit message bodies?", input: "\r" },
      { trigger: "Maximum commit title length", input: "\r" },
      { trigger: "Require commit scopes?", input: "\r" },
      { trigger: "Allow breaking-change notation?", input: "\r" },
    ]);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain("Settings saved");
    const config = JSON.parse(await readFile(join(project, ".github/spindle.json"), "utf8"));
    expect(config.tooling).toEqual([{ key: "check", section: "Testing", command: "pnpm test" }]);
  },
);
