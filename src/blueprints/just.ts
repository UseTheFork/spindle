import { chmod, lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";

import { blueprintsRoot } from "../install.js";
import { renderText, type RenderContext } from "../render.js";
import type { CatalogDeletion, CatalogSelection } from "./catalog.js";
import type { BlueprintHandler, PreparedBlueprintInitialization } from "./types.js";

async function exists(path: string) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function formatFilesystemError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function readRenderedModule(path: string, context: RenderContext) {
  const bytes = await readFile(path);
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`Just Module entry '${path}' must be valid UTF-8 text.`);
  }
  return renderText(source, context);
}

function isManagedImportPath(importPath: string, projectDirectory: string) {
  const modulesDirectory = resolve(projectDirectory, ".github/scripts/just-modules");
  const target = resolve(projectDirectory, importPath);
  return dirname(target) === modulesDirectory && extname(target) === ".just";
}

function requiredModuleImport(name: string) {
  return `mod ${name} '.github/scripts/just-modules/${name}.just'`;
}

async function reconcileJustfile(
  projectDirectory: string,
  moduleNames: string[],
  removedModulePaths: string[],
) {
  const justfilePath = join(projectDirectory, "justfile");
  const modulesDirectory = join(projectDirectory, ".github/scripts/just-modules");
  const removedTargets = new Set(removedModulePaths.map((path) => resolve(modulesDirectory, path)));
  const expected = new Map(
    moduleNames.map((name) => [name, `.github/scripts/just-modules/${name}.just`]),
  );
  const activeModulesByTarget = new Map(
    moduleNames.map((name) => [resolve(projectDirectory, expected.get(name)!), name]),
  );
  let original: string | undefined;
  let mode: number | undefined;
  if (await exists(justfilePath)) {
    const stat = await lstat(justfilePath);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error(`Refusing to replace '${justfilePath}': expected a regular file.`);
    }
    mode = stat.mode & 0o777;
    original = await readFile(justfilePath, "utf8");
  }

  const newline = original?.match(/\r\n|\n|\r/)?.[0] ?? "\n";
  const hadFinalNewline = original !== undefined && /(?:\r\n|\n|\r)$/.test(original);
  const lines = original === undefined ? [] : original.split(/\r\n|\n|\r/);
  if (hadFinalNewline) lines.pop();

  const remaining: string[] = [];
  const removedImportTargets = new Set<string>();
  for (const line of lines) {
    const declaration = /^\s*mod(\?)?\s+([A-Za-z_][A-Za-z0-9_-]*)\s+'([^']+)'\s*$/.exec(line);
    if (declaration === null) {
      remaining.push(line);
      continue;
    }
    const [, optional, name, importPath] = declaration;
    const expectedPath = expected.get(name);
    const managedPath = isManagedImportPath(importPath, projectDirectory);
    const activeModuleName = managedPath
      ? activeModulesByTarget.get(resolve(projectDirectory, importPath))
      : undefined;
    if (activeModuleName !== undefined) {
      if (optional !== undefined) {
        throw new Error(
          `Optional Just Module import for '${activeModuleName}' is not supported; use a required mod import.`,
        );
      }
      continue;
    }
    if (
      expectedPath !== undefined &&
      resolve(projectDirectory, importPath) !== resolve(projectDirectory, expectedPath)
    ) {
      throw new Error(
        `Just Module import conflict for '${name}': expected '${expectedPath}', found '${importPath}'.`,
      );
    }
    if (managedPath && removedTargets.has(resolve(projectDirectory, importPath))) {
      removedImportTargets.add(resolve(projectDirectory, importPath));
      continue;
    }
    if (managedPath && expectedPath !== undefined && optional === undefined) {
      continue;
    }
    if (expectedPath !== undefined && optional !== undefined) {
      throw new Error(
        `Optional Just Module import for '${name}' is not supported; use a required mod import.`,
      );
    }
    remaining.push(line);
  }

  const imports = [...moduleNames].sort().map(requiredModuleImport);
  let output: string;
  if (original === undefined) {
    output = imports.length > 0 ? `${imports.join(newline)}${newline}` : "";
  } else {
    let body = remaining.join(newline);
    if (body.length > 0 && imports.length > 0) {
      if (!body.endsWith(newline)) body += newline;
      if (!body.endsWith(newline + newline)) body += newline;
    }
    output = `${body}${imports.join(newline)}`;
    if (hadFinalNewline) output += newline;
  }

  // Check that the designated directory is not an unexpected filesystem target.
  if (await exists(modulesDirectory)) {
    const stat = await lstat(modulesDirectory);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error(`Refusing to use '${modulesDirectory}': expected a directory.`);
    }
  }
  return {
    path: justfilePath,
    content: output,
    mode,
    shouldWrite:
      (original === undefined && (imports.length > 0 || removedImportTargets.size > 0)) ||
      (original !== undefined && output !== original),
    removedImportTargets: [...removedImportTargets],
  };
}

async function prepareModules(context: RenderContext, selections: CatalogSelection[]) {
  const prepared: { name: string; content: string }[] = [];
  for (const selection of selections) {
    const name = selection.name;
    if (selection.files.length !== 1 || !selection.files[0].sourcePath.endsWith(".just")) {
      throw new Error(`Just Module '${name}' must select exactly one standalone .just file.`);
    }
    const content = await readRenderedModule(selection.files[0].sourcePath, context);
    prepared.push({ name, content });
  }
  return prepared;
}

async function prepareJustModuleChanges(
  githubDirectory: string,
  context: RenderContext,
  selections: CatalogSelection[],
  deletions: CatalogDeletion[],
): Promise<PreparedBlueprintInitialization> {
  const projectDirectory = dirname(githubDirectory);
  const modulesDirectory = join(githubDirectory, "scripts", "just-modules");
  const prepared = await prepareModules(context, selections);
  const removedModulePaths = deletions.map((deletion) => deletion.path);
  const imports = await reconcileJustfile(
    projectDirectory,
    prepared.map((module) => module.name),
    removedModulePaths,
  );

  const moduleDirectoryExists = await exists(modulesDirectory);
  if (moduleDirectoryExists) {
    const stat = await lstat(modulesDirectory);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error(`Refusing to use '${modulesDirectory}': expected a directory.`);
    }
  }

  const moduleModes = new Map<string, number>();
  if (moduleDirectoryExists) {
    for (const module of prepared) {
      const target = join(modulesDirectory, `${module.name}.just`);
      if (await exists(target)) {
        const stat = await lstat(target);
        if (stat.isSymbolicLink() || !stat.isFile()) {
          throw new Error(`Refusing to replace '${target}': expected a regular file.`);
        }
        moduleModes.set(module.name, stat.mode & 0o777);
      }
    }
  }

  let stagingDirectory: string | undefined;
  try {
    stagingDirectory = await mkdtemp(join(projectDirectory, ".spindle-just-modules-"));
    const stagedModulesDirectory = join(stagingDirectory, "modules");
    await mkdir(stagedModulesDirectory);
    for (const module of prepared) {
      const stagedPath = join(stagedModulesDirectory, `${module.name}.just`);
      await writeFile(stagedPath, module.content);
      const mode = moduleModes.get(module.name);
      if (mode !== undefined) await chmod(stagedPath, mode);
    }
    if (imports.shouldWrite) {
      const stagedJustfile = join(stagingDirectory, "justfile");
      await writeFile(stagedJustfile, imports.content);
      if (imports.mode !== undefined) await chmod(stagedJustfile, imports.mode);
    }
  } catch (error) {
    if (typeof stagingDirectory !== "undefined") {
      await rm(stagingDirectory, { recursive: true, force: true }).catch(() => undefined);
    }
    throw new Error(`Failed to stage Just Module changes: ${formatFilesystemError(error)}`, {
      cause: error,
    });
  }

  const stagedDirectory = stagingDirectory;
  if (stagedDirectory === undefined) {
    throw new Error("Failed to stage Just Module changes: staging directory was not created.");
  }
  const dispose = async () => {
    await rm(stagedDirectory, { recursive: true, force: true }).catch(() => undefined);
  };
  const apply: PreparedBlueprintInitialization["apply"] = async (recordAppliedChange) => {
    try {
      if (prepared.length > 0 && !(await exists(modulesDirectory))) {
        await mkdir(modulesDirectory, { recursive: true });
      }
      if (await exists(modulesDirectory)) {
        const directoryStat = await lstat(modulesDirectory);
        if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
          throw new Error(`Refusing to use '${modulesDirectory}': expected a directory.`);
        }
      }

      for (const module of prepared) {
        const target = join(modulesDirectory, `${module.name}.just`);
        if (await exists(target)) {
          const stat = await lstat(target);
          if (stat.isSymbolicLink() || !stat.isFile()) {
            throw new Error(`Refusing to replace '${target}': expected a regular file.`);
          }
        }
        await rename(join(stagedDirectory, "modules", `${module.name}.just`), target);
        recordAppliedChange(`installed Just Module '${module.name}.just'`);
      }

      const removed = new Set<string>();
      for (const path of removedModulePaths) {
        const target = join(modulesDirectory, path);
        if (!(await exists(target))) continue;
        const stat = await lstat(target);
        if (stat.isSymbolicLink() || !stat.isFile()) {
          throw new Error(`Refusing to remove '${target}': expected a regular file.`);
        }
        await rm(target);
        removed.add(path);
        recordAppliedChange(`removed Just Module '${path}'`);
      }
      if (imports.shouldWrite && (await exists(imports.path))) {
        const stat = await lstat(imports.path);
        if (stat.isSymbolicLink() || !stat.isFile()) {
          throw new Error(`Refusing to replace '${imports.path}': expected a regular file.`);
        }
      }
      if (imports.shouldWrite) {
        await rename(join(stagedDirectory, "justfile"), imports.path);
        recordAppliedChange("reconciled managed imports in the root justfile");
      }
      for (const target of imports.removedImportTargets) {
        const path = removedModulePaths.find(
          (candidate) => resolve(modulesDirectory, candidate) === target,
        );
        if (path !== undefined) removed.add(path);
      }
      return {
        installed: prepared.map((module) => module.name),
        removed: [...removed],
      };
    } catch (error) {
      throw new Error(
        `Failed to apply staged Just Module changes: ${formatFilesystemError(error)}`,
        { cause: error },
      );
    } finally {
      await dispose();
    }
  };
  return { apply, dispose };
}

export const justModuleHandler: BlueprintHandler = {
  kind: "Just Module",
  catalogKind: "just",
  sourceDirectory: () => join(blueprintsRoot(), "just"),
  destinationDirectory: (githubDirectory) => join(githubDirectory, "scripts", "just-modules"),
  prepareInitialize: prepareJustModuleChanges,
};
