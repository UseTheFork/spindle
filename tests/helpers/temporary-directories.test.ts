import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, relative, sep } from "node:path";

import { afterAll, describe, expect, test } from "vitest";

import { makeTempDir, makeTempDirSync, repoRoot } from "./TemporaryDirectories.ts";

const completedDirectories: string[] = [];

describe("temporary test directories", () => {
  test("creates unique directories under the operating-system temp root", async () => {
    const first = await makeTempDir("spindle-location-");
    const second = makeTempDirSync("spindle-location-");

    expect(first).not.toBe(second);
    for (const directory of [first, second]) {
      const fromTempRoot = relative(tmpdir(), directory);
      expect(isAbsolute(fromTempRoot)).toBe(false);
      expect(fromTempRoot).not.toBe("..");
      expect(fromTempRoot.startsWith(`..${sep}`)).toBe(false);
      const fromRepoRoot = relative(repoRoot, directory);
      expect(
        isAbsolute(fromRepoRoot) || fromRepoRoot === ".." || fromRepoRoot.startsWith(`..${sep}`),
      ).toBe(true);
      expect(existsSync(directory)).toBe(true);
    }
  });

  test("rejects prefixes that could escape the operating-system temp root", async () => {
    expect(() => makeTempDirSync("../spindle-escape-")).toThrow(
      "Temporary directory prefix must be a basename.",
    );
    await expect(makeTempDir("../spindle-escape-")).rejects.toThrow(
      "Temporary directory prefix must be a basename.",
    );
  });

  test("removes directories after a passing test", async () => {
    completedDirectories.push(await makeTempDir("spindle-clean-pass-"));
    completedDirectories.push(makeTempDirSync("spindle-clean-pass-"));
  });

  test.fails("removes directories after a failing test", async () => {
    completedDirectories.push(await makeTempDir("spindle-clean-fail-"));
    completedDirectories.push(makeTempDirSync("spindle-clean-fail-"));
    throw new Error("expected fixture failure");
  });

  afterAll(() => {
    for (const directory of completedDirectories) {
      expect(existsSync(directory)).toBe(false);
    }
  });
});
