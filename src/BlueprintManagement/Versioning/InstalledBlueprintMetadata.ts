import { readFile } from "node:fs/promises";

import matter from "gray-matter";

export async function readInstalledBlueprintMetadata(path: string) {
  const bytes = await readFile(path);
  let data: Record<string, unknown>;
  try {
    const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const firstLineEnd = content.indexOf("\n");
    if (
      /^---(?:\r?\n|$)/.test(content) &&
      (firstLineEnd === -1 || !/^---\s*$/m.test(content.slice(firstLineEnd + 1)))
    ) {
      throw new Error("Unterminated frontmatter.");
    }
    data = matter(content).data;
  } catch (error) {
    throw new Error(`Cannot read Blueprint metadata in '${path}'.`, { cause: error });
  }
  const metadata = data.metadata;
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    return { managed: false, version: null };
  }
  if (!Object.hasOwn(metadata, "spindle")) return { managed: false, version: null };
  const spindle = (metadata as Record<string, unknown>).spindle;
  const version =
    typeof spindle === "object" && spindle !== null && !Array.isArray(spindle)
      ? (spindle as Record<string, unknown>).version
      : undefined;
  return {
    managed: true,
    version: typeof version === "string" || typeof version === "number" ? String(version) : null,
  };
}
