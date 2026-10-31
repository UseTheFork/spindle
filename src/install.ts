import { access, copyFile, lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
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

// SPINDLE_STUBS_DIR overrides the stubs root (the directory containing `skills/`); tests use it for fixture stubs.
export function stubsRoot() {
  return process.env.SPINDLE_STUBS_DIR ?? fileURLToPath(new URL("./stubs/", import.meta.url));
}

export async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function assertSafeInstallPaths(githubDirectory: string, skillNames: string[]) {
  const paths = [
    githubDirectory,
    join(githubDirectory, "skills"),
    join(githubDirectory, "spindle.json"),
    ...skillNames.map((name) => join(githubDirectory, "skills", name)),
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

export async function listSkillStubs() {
  const entries = await readdir(join(stubsRoot(), "skills"), { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

export async function installDirectory(source: string, target: string, context: RenderContext) {
  await mkdir(target, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = join(source, entry.name);
    const to = join(target, entry.name);
    if (entry.isDirectory()) {
      await installDirectory(from, to, context);
      continue;
    }
    const content = await readFile(from);
    let text: string | null = null;
    if (textExtensions.has(extname(from).toLowerCase()) && !content.includes(0)) {
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(content);
      } catch {
        // Invalid UTF-8 is not renderable text; preserve the original bytes below.
      }
    }

    if (text === null) {
      await copyFile(from, to);
    } else {
      await writeFile(to, renderText(text, context));
    }
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
