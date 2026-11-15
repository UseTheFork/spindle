import { lstatSync } from "node:fs";
import type { Stats } from "node:fs";
import { isAbsolute, relative, sep } from "node:path";

export class FileSystem {
  public static assertRealDirectory(path: string, label: string): void {
    const entry = lstatSync(path, { throwIfNoEntry: false });
    if (entry && !entry.isDirectory()) {
      throw new Error(`${label} must be a real directory, not a file or symlink.`);
    }
  }

  public static lstatIfPresent(path: string): Stats | undefined {
    try {
      return lstatSync(path);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return undefined;
      }
      throw error;
    }
  }

  public static waitBriefly(): void {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
  }

  public static isPathInside(parent: string, child: string): boolean {
    const relativePath = relative(parent, child);
    return (
      relativePath === "" ||
      (!isAbsolute(relativePath) && relativePath !== ".." && !relativePath.startsWith(`..${sep}`))
    );
  }
}

export const LOCK_TIMEOUT_MS = 15_000;
