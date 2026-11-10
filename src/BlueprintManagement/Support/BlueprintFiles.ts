import { type Stats } from "node:fs";
import { access, lstat, readFile } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";

import type {
  PlannedBlueprintFile,
  PreparedBlueprintFile,
} from "@/BlueprintManagement/Types/Installation";
import { renderText, type RenderContext } from "@/TemplateRendering/Rendering/RenderText";

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
