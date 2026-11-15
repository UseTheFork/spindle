import { readFile } from "node:fs/promises";

import matter from "gray-matter";

import { RenderText, type RenderContext } from "@/TemplateRendering/Rendering/RenderText";

const semverPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/;

export interface Semver {
  core: [bigint, bigint, bigint];
  prerelease: string[];
}

export class BlueprintVersion {
  public static parseSemver(value: string): Semver | null {
    const match = semverPattern.exec(value);
    if (!match) return null;
    return {
      core: [BigInt(match[1]), BigInt(match[2]), BigInt(match[3])],
      prerelease: match[4] ? match[4].split(".") : [],
    };
  }

  private static comparePrerelease(a: string[], b: string[]) {
    // A version without a prerelease outranks one with it.
    if (a.length === 0 || b.length === 0) return b.length - a.length;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      const numA = /^\d+$/.test(a[i]);
      const numB = /^\d+$/.test(b[i]);
      if (numA && numB) {
        const valueA = BigInt(a[i]);
        const valueB = BigInt(b[i]);
        if (valueA !== valueB) return valueA < valueB ? -1 : 1;
      } else if (numA !== numB) {
        return numA ? -1 : 1;
      } else if (a[i] !== b[i]) {
        return a[i] < b[i] ? -1 : 1;
      }
    }
    return Math.sign(a.length - b.length);
  }

  public static compareSemver(a: Semver, b: Semver) {
    for (let i = 0; i < 3; i++) {
      if (a.core[i] !== b.core[i]) return a.core[i] < b.core[i] ? -1 : 1;
    }
    return BlueprintVersion.comparePrerelease(a.prerelease, b.prerelease);
  }

  public static async readBlueprintVersion(
    entryFile: string,
    context?: RenderContext,
    options: {
      onRendered?: (sourceText: string, renderedText: string) => void;
    } = {},
  ): Promise<string | null> {
    let content: string;
    try {
      content = await readFile(entryFile, "utf8");
    } catch {
      return null;
    }
    const rendered = context
      ? RenderText.render(content, {
          stacks: [...context.stacks],
          variables: { ...context.variables },
          computed: { ...context.computed },
        })
      : content;
    if (context) options.onRendered?.(content, rendered);
    try {
      const version = matter(rendered, {}).data.metadata?.spindle?.version;
      return typeof version === "string" || typeof version === "number" ? String(version) : null;
    } catch {
      return null;
    }
  }
}

// Returns the raw Spindle-owned version value from entry-file frontmatter, or null when absent or unreadable.
