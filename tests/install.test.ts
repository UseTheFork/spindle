import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

import { test, expect } from "vitest";

import { blueprintHandlers } from "@/blueprints/registry";
import { InstallationService } from "@/installation/installation-service";
import { BlueprintReconciliationService } from "@/reconciliation/blueprint-reconciliation-service";
import { preparePlannedBlueprintFiles } from "@/utilities/blueprint-files";
import { resolveBlueprintSourceRoot } from "@/utilities/blueprint-source-root";

import { applicationFixture } from "./application-fixture";
import { makeTempDir } from "./helpers.ts";

test("relative Blueprint overrides stay fixed to the App workspace after cwd changes", async () => {
  const workspace = await makeTempDir("spindle-install-relative-root-");
  const laterCwd = await makeTempDir("spindle-install-later-cwd-");
  const originalCwd = process.cwd();
  const originalOverride = process.env.SPINDLE_BLUEPRINTS_DIR;
  const expectedSourceRoot = join(workspace, "assets");
  const config = { stacks: ["typescript"], variables: {} };

  try {
    await cp(fileURLToPath(new URL("../src/blueprints/", import.meta.url)), expectedSourceRoot, {
      recursive: true,
    });
    await mkdir(join(workspace, "nested"));
    process.env.SPINDLE_BLUEPRINTS_DIR = "assets";
    process.chdir(join(workspace, "nested"));
    const app = applicationFixture(workspace, resolveBlueprintSourceRoot(workspace));

    expect(isAbsolute(app.blueprintSourceRoot)).toBeTruthy();
    expect(app.blueprintSourceRoot).toBe(expectedSourceRoot);
    process.chdir(laterCwd);
    expect(app.blueprintSourceRoot).toBe(expectedSourceRoot);
    const service = await app.make(BlueprintReconciliationService);
    await service.reconcile(blueprintHandlers, { mode: "init", context: config, config });
    expect(
      await readFile(
        join(workspace, ".github", "skills", "int-test-driven-development", "SKILL.md"),
        "utf8",
      ),
    ).toMatch(/version: 1\.2\.0/);
  } finally {
    process.chdir(originalCwd);
    if (originalOverride === undefined) delete process.env.SPINDLE_BLUEPRINTS_DIR;
    else process.env.SPINDLE_BLUEPRINTS_DIR = originalOverride;
    await rm(workspace, { recursive: true, force: true });
    await rm(laterCwd, { recursive: true, force: true });
  }
});

test("installation renders recognized UTF-8 text and preserves files that must not be rendered", async () => {
  const source = await makeTempDir("spindle-install-source-");
  const target = await makeTempDir("spindle-install-target-");
  const context = { stacks: ["python", "typescript"], variables: { name: "Spindle" } };
  const preservedFiles = new Map<string, Buffer>([
    ["assets/logo.png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff])],
    ["assets/template.bin", Buffer.from("{{ variables.name }}\n")],
    ["assets/nul.txt", Buffer.from("A\0B")],
    ["assets/invalid-utf8.md", Buffer.from([0x41, 0xc3, 0x28, 0x42])],
  ]);
  try {
    await writeFile(join(source, "SKILL.md"), "Hello {{ variables.name }}!");
    await mkdir(join(source, "templates/sub"), { recursive: true });
    await writeFile(join(source, "templates/a.md"), "a {{ stacks | join(',') }}\n");
    await writeFile(
      join(source, "templates/sub/x.md"),
      "x {% raw %}{{VSCODE_FOO}}{% endraw %} {{ stacks | join('+') }}\n",
    );
    for (const [path, content] of preservedFiles) {
      const file = join(source, path);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, content);
    }

    const files = [
      "SKILL.md",
      "templates/a.md",
      "templates/sub/x.md",
      ...preservedFiles.keys(),
    ].map((outputPath) => ({ sourcePath: join(source, outputPath), outputPath }));
    const prepared = await preparePlannedBlueprintFiles(files, context);
    const installation = await applicationFixture(target, source).make(InstallationService);
    await installation.installPreparedFiles(prepared, target);

    expect(await readFile(join(target, "SKILL.md"), "utf8")).toBe("Hello Spindle!");
    expect(await readFile(join(target, "templates/a.md"), "utf8")).toBe("a python,typescript\n");
    expect(await readFile(join(target, "templates/sub/x.md"), "utf8")).toBe(
      "x {{VSCODE_FOO}} python+typescript\n",
    );
    for (const [path, content] of preservedFiles) {
      expect(await readFile(join(target, path)), path).toEqual(content);
    }
  } finally {
    await rm(source, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
  }
});

test("reconciliation services isolate App roots and reuse no prior operation data", async () => {
  const firstWorkspace = await makeTempDir("spindle-install-app-first-");
  const secondWorkspace = await makeTempDir("spindle-install-app-second-");
  const sourceParent = await makeTempDir("spindle-install-app-sources-");
  const sourceRoot = fileURLToPath(new URL("../src/blueprints/", import.meta.url));
  const firstSourceRoot = join(sourceParent, "first");
  const skillSource = join(firstSourceRoot, "skills", "int-test-driven-development", "SKILL.md");
  const skillTarget = (workspace: string) =>
    join(workspace, ".github", "skills", "int-test-driven-development", "SKILL.md");
  const firstConfig = {
    stacks: ["python"],
    variables: { lint_command: "just lint first", owner: "first" },
  };
  const secondConfig = {
    stacks: ["typescript"],
    variables: { lint_command: "just lint second", owner: "second" },
  };

  try {
    await cp(sourceRoot, firstSourceRoot, { recursive: true });

    const firstApp = applicationFixture(firstWorkspace, firstSourceRoot);
    const secondApp = applicationFixture(secondWorkspace, sourceRoot);
    const [firstService, secondService] = await Promise.all([
      firstApp.make(BlueprintReconciliationService),
      secondApp.make(BlueprintReconciliationService),
    ]);

    expect(firstService).not.toBe(secondService);
    await firstService.reconcile(blueprintHandlers, {
      mode: "init",
      context: firstConfig,
      config: firstConfig,
    });
    await secondService.reconcile(blueprintHandlers, {
      mode: "init",
      context: secondConfig,
      config: secondConfig,
    });

    expect(
      JSON.parse(await readFile(join(firstWorkspace, ".github", "spindle.json"), "utf8")),
    ).toEqual(firstConfig);
    expect(
      JSON.parse(await readFile(join(secondWorkspace, ".github", "spindle.json"), "utf8")),
    ).toEqual(secondConfig);

    const sourceText = await readFile(skillSource, "utf8");
    expect(sourceText.includes("version: 1.2.0")).toBeTruthy();
    await writeFile(
      skillSource,
      `${sourceText.replace("version: 1.2.0", "version: 2.0.0")}\nApplication one update marker.\n`,
    );
    await firstService.reconcile(blueprintHandlers, {
      mode: "update",
      config: firstConfig,
      resolveContext: async () => firstConfig,
      conflictPolicy: "overwrite",
    });

    const firstInstalledSkill = await readFile(skillTarget(firstWorkspace), "utf8");
    const secondInstalledSkill = await readFile(skillTarget(secondWorkspace), "utf8");
    expect(firstInstalledSkill).toMatch(/version: 2\.0\.0/);
    expect(firstInstalledSkill).toMatch(/Application one update marker\./);
    expect(secondInstalledSkill).toMatch(/version: 1\.2\.0/);
    expect(secondInstalledSkill).not.toMatch(/Application one update marker\./);
  } finally {
    await rm(firstWorkspace, { recursive: true, force: true });
    await rm(secondWorkspace, { recursive: true, force: true });
    await rm(sourceParent, { recursive: true, force: true });
  }
});
