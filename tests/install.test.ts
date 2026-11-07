import assert from "node:assert/strict";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { App } from "../src/app.ts";
import { blueprintHandlers } from "../src/blueprints/registry.ts";
import { InstallationService } from "../src/installation/installation-service.ts";
import { BlueprintReconciliationService } from "../src/reconciliation/blueprint-reconciliation-service.ts";
import { preparePlannedBlueprintFiles } from "../src/utilities/blueprint-files.ts";
import { resolveBlueprintSourceRoot } from "../src/utilities/blueprint-source-root.ts";
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
    const app = new App({
      workspaceRoot: workspace,
      blueprintSourceRoot: resolveBlueprintSourceRoot(workspace),
    });

    assert.ok(isAbsolute(app.blueprintSourceRoot));
    assert.equal(app.blueprintSourceRoot, expectedSourceRoot);
    process.chdir(laterCwd);
    assert.equal(app.blueprintSourceRoot, expectedSourceRoot);
    const service = await app.get(BlueprintReconciliationService);
    await service.reconcile(blueprintHandlers, { mode: "init", context: config, config });
    assert.match(
      await readFile(
        join(workspace, ".github", "skills", "int-test-driven-development", "SKILL.md"),
        "utf8",
      ),
      /version: 1\.2\.0/,
    );
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
    const installation = await new App({
      workspaceRoot: target,
      blueprintSourceRoot: source,
    }).get(InstallationService);
    await installation.installPreparedFiles(prepared, target);

    assert.equal(await readFile(join(target, "SKILL.md"), "utf8"), "Hello Spindle!");
    assert.equal(await readFile(join(target, "templates/a.md"), "utf8"), "a python,typescript\n");
    assert.equal(
      await readFile(join(target, "templates/sub/x.md"), "utf8"),
      "x {{VSCODE_FOO}} python+typescript\n",
    );
    for (const [path, content] of preservedFiles) {
      assert.deepEqual(await readFile(join(target, path)), content, path);
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

    const firstApp = new App({
      workspaceRoot: firstWorkspace,
      blueprintSourceRoot: firstSourceRoot,
    });
    const secondApp = new App({
      workspaceRoot: secondWorkspace,
      blueprintSourceRoot: sourceRoot,
    });
    const [firstService, secondService] = await Promise.all([
      firstApp.get(BlueprintReconciliationService),
      secondApp.get(BlueprintReconciliationService),
    ]);

    assert.notEqual(firstService, secondService);
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

    assert.deepEqual(
      JSON.parse(await readFile(join(firstWorkspace, ".github", "spindle.json"), "utf8")),
      firstConfig,
    );
    assert.deepEqual(
      JSON.parse(await readFile(join(secondWorkspace, ".github", "spindle.json"), "utf8")),
      secondConfig,
    );

    const sourceText = await readFile(skillSource, "utf8");
    assert.ok(sourceText.includes("version: 1.2.0"));
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
    assert.match(firstInstalledSkill, /version: 2\.0\.0/);
    assert.match(firstInstalledSkill, /Application one update marker\./);
    assert.match(secondInstalledSkill, /version: 1\.2\.0/);
    assert.doesNotMatch(secondInstalledSkill, /Application one update marker\./);
  } finally {
    await rm(firstWorkspace, { recursive: true, force: true });
    await rm(secondWorkspace, { recursive: true, force: true });
    await rm(sourceParent, { recursive: true, force: true });
  }
});
