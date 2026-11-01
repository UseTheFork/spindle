import { existsSync, type Stats } from "node:fs";
import {
  access,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, extname, join, normalize, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { renderText, type RenderContext } from "./render.js";

export const supportedStacks = ["php-laravel", "python", "typescript"] as const;

export type ConflictPolicy = "overwrite" | "skip";

// Only known text formats are rendered; all other files are copied unchanged.
const textExtensions = new Set([
  ".md",
  ".txt",
  ".json",
  ".yml",
  ".yaml",
  ".toml",
  ".sh",
  ".ts",
  ".js",
  ".py",
  ".php",
  ".html",
  ".css",
  ".xml",
  ".j2",
  ".njk",
  "",
]);

// Tests may provide a Blueprint collection root.
export function blueprintsRoot() {
  if (process.env.SPINDLE_BLUEPRINTS_DIR) return process.env.SPINDLE_BLUEPRINTS_DIR;
  const adjacent = fileURLToPath(new URL("./blueprints/", import.meta.url));
  if (existsSync(join(adjacent, "skills"))) return adjacent;
  return fileURLToPath(new URL("../src/blueprints/", import.meta.url));
}

export async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function assertSafeInstallPaths(
  githubDirectory: string,
  blueprintNames: string[],
  destinationDirectory = join(githubDirectory, "skills"),
  targetPath = (name: string) => join(destinationDirectory, name),
) {
  const paths = [
    githubDirectory,
    destinationDirectory,
    join(githubDirectory, "spindle.json"),
    ...blueprintNames.map(targetPath),
  ];

  for (const path of paths) {
    try {
      if ((await lstat(path)).isSymbolicLink()) {
        throw new Error(
          "Refusing to write through symbolic link '" +
            path +
            "'. Spindle writes only inside .github.",
        );
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

export async function listBlueprints(sourceDirectory: string) {
  try {
    const entries = await readdir(sourceDirectory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function assertSingleFileDestination(path: string, mustExist = false) {
  let stat: Stats;
  try {
    stat = await lstat(path);
  } catch (error) {
    if (!mustExist && (error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  if (stat.isSymbolicLink()) {
    throw new Error(`Refusing to replace symbolic link '${path}'.`);
  }
  if (!stat.isFile()) {
    throw new Error(`Refusing to overwrite '${path}': expected a regular file.`);
  }
}

export interface PlannedBlueprintFile {
  sourcePath: string;
  outputPath: string;
}

export interface PreparedBlueprintFile extends PlannedBlueprintFile {
  renderedText: string | null;
}

export async function preparePlannedBlueprintFiles(
  files: PlannedBlueprintFile[],
  context: RenderContext,
  validateRenderedFile?: (relativePath: string, renderedText: string) => void,
  requireText = false,
) {
  const prepared: PreparedBlueprintFile[] = [];
  for (const file of files) {
    const content = await readFile(file.sourcePath);
    let text: string | null = null;
    if (textExtensions.has(extname(file.sourcePath).toLowerCase()) && !content.includes(0)) {
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(content);
      } catch {
        // Invalid UTF-8 is not renderable text; preserve the original bytes below.
      }
    }

    if (text === null && requireText) {
      throw new Error(`Blueprint entry '${file.outputPath}' must be valid UTF-8 text.`);
    }
    const renderedText = text === null ? null : renderText(text, context);
    if (renderedText !== null) validateRenderedFile?.(file.outputPath, renderedText);
    prepared.push({ ...file, renderedText });
  }
  return prepared;
}

async function installFile(
  file: PreparedBlueprintFile,
  destinationPath: string,
  replace = false,
  requireText = false,
) {
  await mkdir(dirname(destinationPath), { recursive: true });
  if (replace && requireText) {
    await assertSingleFileDestination(destinationPath, true);
    const stagingDirectory = await mkdtemp(join(dirname(destinationPath), ".spindle-"));
    try {
      const stagedPath = join(stagingDirectory, basename(destinationPath));
      await writeFile(stagedPath, file.renderedText!, { flag: "wx" });
      await assertSingleFileDestination(destinationPath, true);
      await rename(stagedPath, destinationPath);
    } finally {
      await rm(stagingDirectory, { recursive: true, force: true });
    }
    return;
  }
  if (replace) await rm(destinationPath, { recursive: true, force: true });
  if (file.renderedText === null) {
    await copyFile(file.sourcePath, destinationPath);
  } else if (requireText) {
    await writeFile(destinationPath, file.renderedText, { flag: "wx" });
  } else {
    await writeFile(destinationPath, file.renderedText);
  }
}

async function collectFiles(directory: string, outputRoot: string, files: PlannedBlueprintFile[]) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const sourcePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(sourcePath, outputRoot, files);
    } else if (entry.isFile()) {
      files.push({
        sourcePath,
        outputPath: relative(outputRoot, sourcePath),
      });
    }
  }
}

export async function planBlueprintFiles(source: string, stacks: string[]) {
  const files: PlannedBlueprintFile[] = [];

  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.name === "stacks") continue;
    const sourcePath = join(source, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(sourcePath, source, files);
    } else if (entry.isFile()) {
      files.push({ sourcePath, outputPath: entry.name });
    }
  }

  for (const stack of stacks) {
    const overlay = join(source, "stacks", stack);
    try {
      if ((await lstat(overlay)).isDirectory()) {
        await collectFiles(overlay, overlay, files);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  const sourcesByOutputPath = new Map<string, string>();
  for (const file of files) {
    const outputPath = normalize(file.outputPath);
    const previousSource = sourcesByOutputPath.get(outputPath);
    if (previousSource !== undefined) {
      throw new Error(
        `Duplicate Blueprint output path '${outputPath}' from '${previousSource}' and '${file.sourcePath}'.`,
      );
    }
    sourcesByOutputPath.set(outputPath, file.sourcePath);
  }

  for (const file of files) {
    const outputPath = normalize(file.outputPath);
    const segments = outputPath.split(sep);
    for (let length = 1; length < segments.length; length += 1) {
      const ancestorPath = segments.slice(0, length).join(sep);
      const ancestorSource = sourcesByOutputPath.get(ancestorPath);
      if (ancestorSource !== undefined) {
        throw new Error(
          `File/directory prefix conflict between output paths '${ancestorPath}' ('${ancestorSource}') and '${outputPath}' ('${file.sourcePath}').`,
        );
      }
    }
  }

  return files;
}

export async function installPlannedBlueprintFiles(
  files: PreparedBlueprintFile[],
  target: string,
  entryFile?: string,
  replace = false,
) {
  for (const file of files) {
    await installFile(
      file,
      entryFile === undefined ? join(target, file.outputPath) : target,
      replace,
      entryFile !== undefined,
    );
  }
}

export function validateStacks(stacks: string[]) {
  for (const stack of stacks) {
    if (!supportedStacks.includes(stack as (typeof supportedStacks)[number])) {
      throw new Error(`Invalid stack '${stack}'. Supported stacks: ${supportedStacks.join(", ")}.`);
    }
  }
}

export function parseConflictPolicy(policy: string | undefined): ConflictPolicy | undefined {
  if (policy !== undefined && policy !== "overwrite" && policy !== "skip") {
    throw new Error(`Invalid --on-conflict '${policy}'. Use overwrite or skip.`);
  }
  return policy;
}
