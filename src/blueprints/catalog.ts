import { lstat, readFile, readdir } from "node:fs/promises";
import { isAbsolute, join, relative, sep, win32 } from "node:path";

import matter from "gray-matter";

import { supportedStacks } from "../install.js";

export type CatalogKind = "agents" | "just" | "instructions" | "skills";
export type CatalogStatus = "active" | "removed";

export interface CatalogEntry {
  key: string;
  path: string;
  directory: boolean;
  status: CatalogStatus;
  stacks: string[];
}

export interface CatalogSelection {
  entry: CatalogEntry;
  name: string;
  files: { sourcePath: string; outputPath: string }[];
}

export type BlueprintCatalog = Record<CatalogKind, CatalogEntry[]>;

const catalogKinds: CatalogKind[] = ["agents", "just", "instructions", "skills"];
const allowedEntryFields = new Set(["path", "status", "stacks"]);
const globCharacters = /[*?[\]{}]/;
const justModulePathPattern = /^[A-Za-z_][A-Za-z0-9_-]*\.just$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateCatalogPath(value: unknown, kind: CatalogKind, key: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Blueprint Catalog ${kind}.${key}.path must be a non-empty relative path.`);
  }
  const directory = value.endsWith("/");
  const path = directory ? value.slice(0, -1) : value;
  const segments = path.split("/");
  if (
    path.length === 0 ||
    path.includes("\\") ||
    isAbsolute(path) ||
    win32.isAbsolute(path) ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..") ||
    globCharacters.test(path)
  ) {
    throw new Error(
      `Blueprint Catalog ${kind}.${key}.path '${value}' is unsafe; use a relative path without traversal or glob syntax.`,
    );
  }
  return { path: segments.join("/"), directory };
}

function parseCatalog(source: string): unknown {
  try {
    return matter(`---\n${source}\n---\n`).data;
  } catch (error) {
    throw new Error(
      `Invalid Blueprint Catalog YAML: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

export function parseBlueprintCatalog(source: string): BlueprintCatalog {
  const data = parseCatalog(source);
  if (!isRecord(data)) throw new Error("Blueprint Catalog must be a YAML mapping.");

  for (const key of Object.keys(data)) {
    if (!catalogKinds.includes(key as CatalogKind)) {
      throw new Error(`Unknown Blueprint Catalog kind '${key}'.`);
    }
  }
  for (const kind of catalogKinds) {
    if (!Object.hasOwn(data, kind)) {
      throw new Error(`Blueprint Catalog is missing required '${kind}' mapping.`);
    }
  }

  const catalog = {} as BlueprintCatalog;
  for (const kind of catalogKinds) {
    const section = data[kind];
    if (!isRecord(section)) {
      throw new Error(`Blueprint Catalog '${kind}' must be a mapping of logical keys to entries.`);
    }
    const entries: CatalogEntry[] = [];
    for (const [key, rawEntry] of Object.entries(section)) {
      if (key.length === 0 || !isRecord(rawEntry)) {
        throw new Error(`Blueprint Catalog '${kind}.${key}' must be an entry mapping.`);
      }
      for (const field of Object.keys(rawEntry)) {
        if (!allowedEntryFields.has(field)) {
          throw new Error(`Unknown field '${field}' in Blueprint Catalog entry '${kind}.${key}'.`);
        }
      }
      for (const field of allowedEntryFields) {
        if (!Object.hasOwn(rawEntry, field)) {
          throw new Error(`Blueprint Catalog '${kind}.${key}' is missing required '${field}'.`);
        }
      }
      const { path, directory } = validateCatalogPath(rawEntry.path, kind, key);
      if (rawEntry.status !== "active" && rawEntry.status !== "removed") {
        throw new Error(
          `Invalid status in Blueprint Catalog '${kind}.${key}': expected 'active' or 'removed'.`,
        );
      }
      if (
        !Array.isArray(rawEntry.stacks) ||
        !rawEntry.stacks.every((stack) => typeof stack === "string")
      ) {
        throw new Error(`Blueprint Catalog '${kind}.${key}.stacks' must be a list of Stack names.`);
      }
      for (const stack of rawEntry.stacks) {
        if (!supportedStacks.includes(stack as (typeof supportedStacks)[number])) {
          throw new Error(
            `Invalid Stack '${stack}' in Blueprint Catalog '${kind}.${key}'. Supported Stacks: ${supportedStacks.join(", ")}.`,
          );
        }
      }
      if (kind === "skills" && !directory) {
        throw new Error(`Blueprint Catalog Skill path '${kind}.${key}' must select a directory.`);
      }
      if (kind === "just" && (directory || !justModulePathPattern.test(path))) {
        throw new Error(
          `Blueprint Catalog Just Module path '${kind}.${key}' must be a root-level .just file with a valid Just module identifier.`,
        );
      }
      entries.push({ key, path, directory, status: rawEntry.status, stacks: rawEntry.stacks });
    }
    catalog[kind] = entries;
  }

  for (const kind of catalogKinds) {
    const entries = catalog[kind];
    for (let first = 0; first < entries.length; first += 1) {
      for (let second = first + 1; second < entries.length; second += 1) {
        const left = entries[first].path;
        const right = entries[second].path;
        if (left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`)) {
          throw new Error(
            `Overlapping Blueprint Catalog paths in '${kind}': '${left}' and '${right}'.`,
          );
        }
      }
    }
  }
  return catalog;
}

async function assertNoSymlinkPath(root: string, path: string) {
  let current = root;
  for (const segment of path.split("/")) {
    current = join(current, segment);
    try {
      if ((await lstat(current)).isSymbolicLink()) {
        throw new Error(`Blueprint Catalog path '${path}' traverses symbolic link '${current}'.`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  }
}

async function collectDirectoryFiles(source: string, root: string, result: string[]) {
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const path = join(source, entry.name);
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) {
      throw new Error(`Blueprint directory '${relative(root, path)}' contains a symbolic link.`);
    }
    if (stat.isDirectory()) {
      await collectDirectoryFiles(path, root, result);
    } else if (stat.isFile()) {
      result.push(path);
    } else {
      throw new Error(
        `Blueprint path '${relative(root, path)}' is not a regular file or directory.`,
      );
    }
  }
}

export async function expandBlueprintCatalog(
  catalog: BlueprintCatalog,
  kind: CatalogKind,
  sourceRoot: string,
  selectedStacks: string[],
): Promise<CatalogSelection[]> {
  const selections: CatalogSelection[] = [];
  for (const entry of catalog[kind]) {
    if (entry.status !== "active") continue;
    await assertNoSymlinkPath(sourceRoot, entry.path);
    const sourcePath = join(sourceRoot, ...entry.path.split("/"));
    let stat;
    try {
      stat = await lstat(sourcePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(
          `Active Blueprint Catalog entry '${kind}.${entry.key}' is missing source '${entry.path}'.`,
          { cause: error },
        );
      }
      throw error;
    }
    if (entry.directory !== stat.isDirectory() || (!entry.directory && !stat.isFile())) {
      throw new Error(
        `Blueprint Catalog source '${kind}.${entry.key}' has an incompatible type for '${entry.path}'.`,
      );
    }
    let directoryFiles: string[] | undefined;
    if (entry.directory) {
      directoryFiles = [];
      await collectDirectoryFiles(sourcePath, sourceRoot, directoryFiles);
    }
    if (kind === "skills") {
      const entryFile = join(sourcePath, "SKILL.md");
      try {
        const entryStat = await lstat(entryFile);
        if (!entryStat.isFile() || entryStat.isSymbolicLink()) {
          throw new Error(`Skill Blueprint '${entry.path}' must contain a regular SKILL.md file.`);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          throw new Error(`Skill Blueprint '${entry.path}' must contain a SKILL.md file.`, {
            cause: error,
          });
        }
        throw error;
      }
    }
    if (kind === "just" && !/^[A-Za-z_][A-Za-z0-9_-]*\.just$/.test(entry.path)) {
      throw new Error(
        `Invalid Just Module filename '${entry.path}': expected a valid Just module identifier.`,
      );
    }

    if (entry.stacks.length > 0 && !entry.stacks.some((stack) => selectedStacks.includes(stack))) {
      continue;
    }

    const files: { sourcePath: string; outputPath: string }[] = [];
    if (entry.directory) {
      for (const file of directoryFiles!) {
        files.push({
          sourcePath: file,
          outputPath: relative(sourcePath, file).split(sep).join("/"),
        });
      }
    } else {
      files.push({ sourcePath, outputPath: entry.path.split("/").at(-1)! });
    }

    if (kind === "agents" || kind === "instructions") {
      for (const file of files) {
        const outputPath = entry.directory
          ? relative(sourceRoot, file.sourcePath).split(sep).join("/")
          : entry.path;
        selections.push({
          entry,
          name: outputPath,
          files: [{ ...file, outputPath }],
        });
      }
    } else {
      selections.push({
        entry,
        name: kind === "just" ? entry.path.slice(0, -".just".length) : entry.path,
        files,
      });
    }
  }
  return selections;
}

export async function readBlueprintCatalog(root: string): Promise<BlueprintCatalog> {
  let source: string;
  try {
    source = await readFile(join(root, "catalog.yaml"), "utf8");
  } catch (error) {
    throw new Error(
      `Cannot load Blueprint Catalog '${join(root, "catalog.yaml")}': ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  return parseBlueprintCatalog(source);
}
