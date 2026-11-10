import { mkdtempSync, rmSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

import { onTestFinished } from "vitest";

export const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

function tempDirectoryPath(prefix: string): string {
  if (basename(prefix) !== prefix || prefix === "." || prefix === "..") {
    throw new TypeError("Temporary directory prefix must be a basename.");
  }

  return join(tmpdir(), prefix);
}

export async function makeTempDir(prefix = "spindle-test-"): Promise<string> {
  const directory = await mkdtemp(tempDirectoryPath(prefix));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

export function makeTempDirSync(prefix = "spindle-test-"): string {
  const directory = mkdtempSync(tempDirectoryPath(prefix));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}
