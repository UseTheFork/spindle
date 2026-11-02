import { lstat, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";

import { blueprintsRoot } from "../install.js";
import { renderText, type RenderContext } from "../render.js";
import type { BlueprintHandler } from "./types.js";

const moduleNamePattern = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const entryFile = "JUSTMODULE.just";

async function exists(path: string) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
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

async function reconcileJustfile(projectDirectory: string, moduleNames: string[]) {
  const justfilePath = join(projectDirectory, "justfile");
  const modulesDirectory = join(projectDirectory, ".github/scripts/just-modules");
  const expected = new Map(
    moduleNames.map((name) => [name, `.github/scripts/just-modules/${name}.just`]),
  );
  let original: string | undefined;
  if (await exists(justfilePath)) {
    const stat = await lstat(justfilePath);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error(`Refusing to replace '${justfilePath}': expected a regular file.`);
    }
    original = await readFile(justfilePath, "utf8");
  }

  const newline = original?.match(/\r\n|\n|\r/)?.[0] ?? "\n";
  const hadFinalNewline = original !== undefined && /(?:\r\n|\n|\r)$/.test(original);
  const lines = original === undefined ? [] : original.split(/\r\n|\n|\r/);
  if (hadFinalNewline) lines.pop();

  const remaining: string[] = [];
  for (const line of lines) {
    const declaration = /^\s*mod(\?)?\s+([A-Za-z_][A-Za-z0-9_-]*)\s+'([^']+)'\s*$/.exec(line);
    if (declaration === null) {
      remaining.push(line);
      continue;
    }
    const [, optional, name, importPath] = declaration;
    const expectedPath = expected.get(name);
    const managedPath = isManagedImportPath(importPath, projectDirectory);
    if (
      expectedPath !== undefined &&
      resolve(projectDirectory, importPath) !== resolve(projectDirectory, expectedPath)
    ) {
      throw new Error(
        `Just Module import conflict for '${name}': expected '${expectedPath}', found '${importPath}'.`,
      );
    }
    if (managedPath && optional === undefined) {
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
  return { path: justfilePath, content: output };
}

async function prepareModules(context: RenderContext) {
  const sourceDirectory = join(blueprintsRoot(), "just");
  const names = (await readdir(sourceDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const prepared: { name: string; content: string }[] = [];
  for (const name of names) {
    if (!moduleNamePattern.test(name)) {
      throw new Error(
        `Invalid Just Module name '${name}': expected a valid Just module identifier.`,
      );
    }
    const source = join(sourceDirectory, name);
    const sharedEntry = join(source, entryFile);
    if (!(await exists(sharedEntry)) || !(await lstat(sharedEntry)).isFile()) {
      throw new Error(`Just Module '${name}' must contain a regular shared '${entryFile}' entry.`);
    }
    const contributions = [await readRenderedModule(sharedEntry, context)];
    for (const stack of context.stacks) {
      const overlay = join(source, "stacks", stack, entryFile);
      if (!(await exists(overlay))) continue;
      if (!(await lstat(overlay)).isFile()) {
        throw new Error(`Just Module Stack entry '${overlay}' must be a regular file.`);
      }
      contributions.push(await readRenderedModule(overlay, context));
    }
    const hasFinalNewline = /(?:\r\n|\n|\r)$/.test(contributions.at(-1)!);
    const content = contributions
      .map((contribution) => contribution.replace(/(?:\r\n|\n|\r)+$/, ""))
      .join("\n\n");
    prepared.push({ name, content: `${content}${hasFinalNewline ? "\n" : ""}` });
  }
  return prepared;
}

async function installModules(githubDirectory: string, context: RenderContext) {
  const projectDirectory = dirname(githubDirectory);
  const modulesDirectory = join(githubDirectory, "scripts", "just-modules");
  const prepared = await prepareModules(context);
  const imports = await reconcileJustfile(
    projectDirectory,
    prepared.map((module) => module.name),
  );

  if (await exists(modulesDirectory)) {
    const stat = await lstat(modulesDirectory);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error(`Refusing to use '${modulesDirectory}': expected a directory.`);
    }
  } else {
    await mkdir(modulesDirectory, { recursive: true });
  }
  const shipped = new Set(prepared.map((module) => `${module.name}.just`));
  for (const module of prepared) {
    const target = join(modulesDirectory, `${module.name}.just`);
    if (await exists(target)) {
      const stat = await lstat(target);
      if (stat.isSymbolicLink() || !stat.isFile()) {
        throw new Error(`Refusing to replace '${target}': expected a regular file.`);
      }
    }
  }
  for (const module of prepared) {
    await writeFile(join(modulesDirectory, `${module.name}.just`), module.content);
  }
  for (const entry of await readdir(modulesDirectory, { withFileTypes: true })) {
    if (entry.isFile() && extname(entry.name) === ".just" && !shipped.has(entry.name)) {
      await rm(join(modulesDirectory, entry.name));
    }
  }
  await writeFile(imports.path, imports.content);
  return prepared.map((module) => module.name);
}

export const justModuleHandler: BlueprintHandler = {
  kind: "Just Module",
  sourceDirectory: () => join(blueprintsRoot(), "just"),
  destinationDirectory: (githubDirectory) => join(githubDirectory, "scripts", "just-modules"),
  initialize: installModules,
};
