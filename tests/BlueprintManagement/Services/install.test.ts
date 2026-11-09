import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

import { test, expect } from "vitest";

import { blueprintHandlers } from "@/BlueprintManagement/Handlers/BlueprintHandlers";
import { BlueprintReconciliationService } from "@/BlueprintManagement/Services/BlueprintReconciliationService";
import { InstallationService } from "@/BlueprintManagement/Services/InstallationService";
import { preparePlannedBlueprintFiles } from "@/BlueprintManagement/Support/BlueprintFiles";
import { ResolveBlueprintSourceRoot } from "@/Foundation/Bootstrap/ResolveBlueprintSourceRoot";

import { applicationFixture } from "../../helpers/ApplicationFixture.ts";
import { makeTempDir } from "../../helpers/TemporaryDirectories.ts";

test("source Blueprint roots resolve from the module location, independent of App roots", async () => {
  const workspace = await makeTempDir("spindle-install-relative-root-");
  const expectedSourceRoot = ResolveBlueprintSourceRoot.resolveBlueprintSourceRoot();
  const config = { stacks: ["typescript"], variables: {} };

  {
    const app = applicationFixture(workspace, expectedSourceRoot);

    expect(isAbsolute(app.blueprintSourceRoot)).toBeTruthy();
    expect(app.blueprintSourceRoot).toBe(expectedSourceRoot);
    const service = await app.make(BlueprintReconciliationService);
    await service.reconcile(blueprintHandlers, { mode: "init", context: config, config });
    expect(JSON.parse(await readFile(join(workspace, ".github", "spindle.json"), "utf8"))).toEqual(
      config,
    );
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
  {
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
  }
});

test("reconciliation services isolate App roots and reuse no prior operation data", async () => {
  const firstWorkspace = await makeTempDir("spindle-install-app-first-");
  const secondWorkspace = await makeTempDir("spindle-install-app-second-");
  const sourceParent = await makeTempDir("spindle-install-app-sources-");
  const sourceRoot = fileURLToPath(new URL("../../../src/Assets/Blueprints/", import.meta.url));
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

  {
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
  }
});
