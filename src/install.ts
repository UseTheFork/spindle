import { existsSync, type Stats } from "node:fs";
import {
  access,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
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
  const installRoot = resolve(githubDirectory);
  const paths = [
    githubDirectory,
    destinationDirectory,
    join(githubDirectory, "spindle.json"),
    ...blueprintNames.map(targetPath),
  ];

  for (const path of paths) {
    const absolutePath = resolve(path);
    const pathFromRoot = relative(installRoot, absolutePath);
    if (pathFromRoot === ".." || pathFromRoot.startsWith(`..${sep}`) || isAbsolute(pathFromRoot)) {
      throw new Error(`Refusing to write '${path}': target is outside .github.`);
    }
    let current = installRoot;
    for (const segment of pathFromRoot === "" ? [] : pathFromRoot.split(sep)) {
      current = join(current, segment);
      try {
        if ((await lstat(current)).isSymbolicLink()) {
          throw new Error(
            `Refusing to write through symbolic link '${current}'. Spindle writes only inside .github.`,
          );
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") break;
        throw error;
      }
    }
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
  requireText: boolean | ((file: PlannedBlueprintFile) => boolean) = false,
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

    if (text === null && (typeof requireText === "function" ? requireText(file) : requireText)) {
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

export async function installPlannedBlueprintFiles(
  files: PreparedBlueprintFile[],
  target: string,
  entryFile?: string,
  replace = false,
  atTarget = false,
  onFileApplied?: (file: PreparedBlueprintFile, destinationPath: string) => void,
) {
  for (const file of files) {
    const destinationPath = atTarget
      ? target
      : entryFile === undefined
        ? join(target, file.outputPath)
        : target;
    try {
      await installFile(
        file,
        destinationPath,
        replace,
        entryFile !== undefined || (atTarget && file.outputPath.toLowerCase().endsWith(".md")),
      );
    } catch (error) {
      throw new Error(
        `Failed to apply file '${file.outputPath}' at '${destinationPath}': ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
    onFileApplied?.(file, destinationPath);
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
