import { lstat, readdir } from "node:fs/promises";
import { isAbsolute, join, relative, sep, win32 } from "node:path";

import { Stacks } from "@/Support/Stacks";

export type CatalogKind = "agents" | "instructions" | "skills";
export type CatalogStatus = "active" | "removed";

export interface CatalogSourceEntry {
  path: string;
  status: CatalogStatus;
  stacks: readonly (typeof Stacks.supported)[number][];
}

export interface BlueprintCatalogDefinition {
  agents: Record<string, CatalogSourceEntry & { canReview?: boolean }>;
  instructions: Record<string, CatalogSourceEntry>;
  skills: Record<string, CatalogSourceEntry & { path: `${string}/` }>;
}

export const blueprintCatalog: BlueprintCatalogDefinition = {
  agents: {
    general: { path: "general.agent.md", status: "active", stacks: [] },
    "sdd-code-reviewer": {
      path: "sdd-code-reviewer.agent.md",
      status: "active",
      stacks: [],
      canReview: true,
    },
    "sdd-code-slop-reviewer": {
      path: "sdd-code-slop-reviewer.agent.md",
      status: "active",
      stacks: [],
    },
    "sdd-implementer": { path: "sdd-implementer.agent.md", status: "active", stacks: [] },
    "sdd-orchestrator": { path: "sdd-orchestrator.agent.md", status: "active", stacks: [] },
    "sdd-re-review": { path: "sdd-re-review.agent.md", status: "active", stacks: [] },
    "sdd-reviewer": {
      path: "sdd-reviewer.agent.md",
      status: "active",
      stacks: [],
      canReview: true,
    },
    "sdd-task-reviewer": { path: "sdd-task-reviewer.agent.md", status: "active", stacks: [] },
    "shared-explore": { path: "shared-explore.agent.md", status: "active", stacks: [] },
    "shared-r": { path: "shared-r.agent.md", status: "active", stacks: [] },
    "shared-rw": { path: "shared-rw.agent.md", status: "active", stacks: [] },
    "shared-rwx": { path: "shared-rwx.agent.md", status: "active", stacks: [] },
    "shared-codebase-analyzer": {
      path: "shared-codebase-analyzer.agent.md",
      status: "active",
      stacks: [],
    },
    "shared-codebase-locator": {
      path: "shared-codebase-locator.agent.md",
      status: "active",
      stacks: [],
    },
    "shared-web-search-researcher": {
      path: "shared-web-search-researcher.agent.md",
      status: "active",
      stacks: [],
    },
    "shared-codebase-pattern-finder": {
      path: "shared-codebase-pattern-finder.agent.md",
      status: "active",
      stacks: [],
    },
  },
  instructions: {},
  skills: {
    "author-agent": { path: "author-agent/", status: "active", stacks: [] },
    "author-design": { path: "author-design/", status: "active", stacks: [] },
    "author-instruction": { path: "author-instruction/", status: "active", stacks: [] },
    "author-skill": { path: "author-skill/", status: "active", stacks: [] },
    grill: { path: "grill/", status: "active", stacks: [] },
    "grill-design": { path: "grill-design/", status: "active", stacks: [] },
    "grill-with-docs": { path: "grill-with-docs/", status: "active", stacks: [] },
    implement: { path: "implement/", status: "active", stacks: [] },
    "implement-spec": { path: "implement-spec/", status: "active", stacks: [] },
    "improve-codebase-architecture": {
      path: "improve-codebase-architecture/",
      status: "active",
      stacks: [],
    },
    "int-codebase-design": { path: "int-codebase-design/", status: "active", stacks: [] },
    "int-code-review": { path: "int-code-review/", status: "active", stacks: [] },
    "int-code-slop-review": { path: "int-code-slop-review/", status: "active", stacks: [] },
    "int-domain-modeling": { path: "int-domain-modeling/", status: "active", stacks: [] },
    "int-grilling": { path: "int-grilling/", status: "removed", stacks: [] },
    "int-prototype": { path: "int-prototype/", status: "active", stacks: [] },
    "int-retrospective": { path: "int-retrospective/", status: "active", stacks: [] },
    "int-subagent-driven-dev": { path: "int-subagent-driven-dev/", status: "active", stacks: [] },
    "int-test-driven-development": {
      path: "int-test-driven-development/",
      status: "active",
      stacks: [],
    },
    "int-testing-agent-guidance": {
      path: "int-testing-agent-guidance/",
      status: "active",
      stacks: [],
    },
    "int-verification-before-completion": {
      path: "int-verification-before-completion/",
      status: "active",
      stacks: [],
    },
    "int-writing-agents": { path: "int-writing-agents/", status: "active", stacks: [] },
    "int-writing-for-agents": { path: "int-writing-for-agents/", status: "active", stacks: [] },
    "int-writing-instruction": { path: "int-writing-instruction/", status: "active", stacks: [] },
    "int-writing-skills": { path: "int-writing-skills/", status: "active", stacks: [] },
    retrospective: { path: "retrospective/", status: "active", stacks: [] },
    "setup-project": { path: "setup-project/", status: "active", stacks: [] },
    "to-spec": { path: "to-spec/", status: "active", stacks: [] },
    "to-tickets": { path: "to-tickets/", status: "active", stacks: [] },
    triage: { path: "triage/", status: "active", stacks: [] },
    wayfinder: { path: "wayfinder/", status: "active", stacks: [] },
  },
};

export interface CatalogEntry {
  key: string;
  path: string;
  directory: boolean;
  status: CatalogStatus;
  stacks: string[];
  canReview?: boolean;
}

export interface CatalogSelection {
  entry: CatalogEntry;
  name: string;
  files: { sourcePath: string; outputPath: string }[];
}

export interface CatalogDeletion {
  entry: CatalogEntry;
  path: string;
  reason: "removed" | "stack-inapplicable";
}

export interface CatalogDirectorySelection {
  entry: CatalogEntry;
  path: string;
  sourceFiles: string[];
}

export interface CatalogExpansionPlan {
  selections: CatalogSelection[];
  deletions: CatalogDeletion[];
  directories: CatalogDirectorySelection[];
}

export type BlueprintCatalog = Record<CatalogKind, CatalogEntry[]>;

const catalogKinds: CatalogKind[] = ["agents", "instructions", "skills"];
const allowedEntryFields = new Set(["path", "status", "stacks", "canReview"]);
const requiredEntryFields = ["path", "status", "stacks"] as const;
const globCharacters = /[*?[\]{}]/;

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

export function validateBlueprintCatalog(data: unknown): BlueprintCatalog {
  if (!isRecord(data)) throw new Error("Blueprint Catalog must be an object.");

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
        if (field === "canReview" && kind !== "agents") {
          throw new Error(
            `Field 'canReview' is only valid for Blueprint Catalog agents, not '${kind}'.`,
          );
        }
        if (!allowedEntryFields.has(field)) {
          throw new Error(`Unknown field '${field}' in Blueprint Catalog entry '${kind}.${key}'.`);
        }
      }
      for (const field of requiredEntryFields) {
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
      if (
        kind === "agents" &&
        Object.hasOwn(rawEntry, "canReview") &&
        typeof rawEntry.canReview !== "boolean"
      ) {
        throw new Error(
          `Blueprint Catalog '${kind}.${key}.canReview' must be a boolean when supplied.`,
        );
      }
      for (const stack of rawEntry.stacks) {
        if (!Stacks.supported.includes(stack as (typeof Stacks.supported)[number])) {
          throw new Error(
            `Invalid Stack '${stack}' in Blueprint Catalog '${kind}.${key}'. Supported Stacks: ${Stacks.supported.join(", ")}.`,
          );
        }
      }
      if (kind === "skills" && !directory) {
        throw new Error(`Blueprint Catalog Skill path '${kind}.${key}' must select a directory.`);
      }
      entries.push({
        key,
        path,
        directory,
        status: rawEntry.status,
        stacks: rawEntry.stacks,
        ...(kind === "agents" && Object.hasOwn(rawEntry, "canReview")
          ? { canReview: rawEntry.canReview as boolean }
          : {}),
      });
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

export async function planBlueprintCatalog(
  catalog: BlueprintCatalog,
  kind: CatalogKind,
  sourceRoot: string,
  selectedStacks: string[],
): Promise<CatalogExpansionPlan> {
  const selections: CatalogSelection[] = [];
  const deletions: CatalogDeletion[] = [];
  const directories: CatalogDirectorySelection[] = [];
  for (const entry of catalog[kind]) {
    if (entry.status === "removed") {
      deletions.push({ entry, path: entry.path, reason: "removed" });
      continue;
    }
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
    if (entry.stacks.length > 0 && !entry.stacks.some((stack) => selectedStacks.includes(stack))) {
      deletions.push({ entry, path: entry.path, reason: "stack-inapplicable" });
      continue;
    }

    const files: { sourcePath: string; outputPath: string }[] = [];
    if (entry.directory) {
      directories.push({
        entry,
        path: entry.path,
        sourceFiles: directoryFiles!.map((file) => relative(sourcePath, file).split(sep).join("/")),
      });
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
        name: entry.path,
        files,
      });
    }
  }
  return { selections, deletions, directories };
}
