import { readFile } from "node:fs/promises";

import matter from "gray-matter";

import { renderText, type RenderContext } from "./render.js";

const semverPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/;

export interface Semver {
  core: [number, number, number];
  prerelease: string[];
}

export function parseSemver(value: string): Semver | null {
  const match = semverPattern.exec(value);
  if (!match) return null;
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] ? match[4].split(".") : [],
  };
}

function comparePrerelease(a: string[], b: string[]) {
  // A version without a prerelease outranks one with it.
  if (a.length === 0 || b.length === 0) return b.length - a.length;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const numA = /^\d+$/.test(a[i]);
    const numB = /^\d+$/.test(b[i]);
    if (numA && numB) {
      if (Number(a[i]) !== Number(b[i])) return Number(a[i]) < Number(b[i]) ? -1 : 1;
    } else if (numA !== numB) {
      return numA ? -1 : 1;
    } else if (a[i] !== b[i]) {
      return a[i] < b[i] ? -1 : 1;
    }
  }
  return Math.sign(a.length - b.length);
}

export function compareSemver(a: Semver, b: Semver) {
  for (let i = 0; i < 3; i++) {
    if (a.core[i] !== b.core[i]) return a.core[i] < b.core[i] ? -1 : 1;
  }
  return comparePrerelease(a.prerelease, b.prerelease);
}

// Returns the raw `version` value from SKILL.md frontmatter, or null when absent or the file is unreadable.
export async function readSkillVersion(
  skillFile: string,
  context?: RenderContext,
): Promise<string | null> {
  let content: string;
  try {
    content = await readFile(skillFile, "utf8");
  } catch {
    return null;
  }
  const parsed = matter(
    context && versionIsTemplated(content) ? renderText(content, context) : content,
  ).data;
  const version = parsed.version;
  return typeof version === "string" || typeof version === "number" ? String(version) : null;
}

function versionIsTemplated(content: string): boolean {
  const parsed = matter(content, {});
  const version = parsed.data.version;
  if (typeof version === "string") return /{{|{%/.test(version);
  if (version === null || typeof version !== "object") return false;
  // Inspect template syntax only in the top-level version field. gray-matter
  // still owns metadata parsing; this also handles unquoted Nunjucks expressions
  // that YAML would otherwise interpret as mappings before rendering.
  const versionSource = (parsed.matter ?? "").match(
    /^version:[ \t]*([^\r\n]*(?:\r?\n[ \t]+[^\r\n]*)*)/m,
  )?.[1];
  return versionSource !== undefined && /{{|{%/.test(versionSource);
}

export async function skillVersionIsTemplated(skillFile: string): Promise<boolean> {
  let content: string;
  try {
    content = await readFile(skillFile, "utf8");
  } catch {
    return false;
  }
  return versionIsTemplated(content);
}
