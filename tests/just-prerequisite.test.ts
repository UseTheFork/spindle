import assert from "node:assert/strict";
import { readdir, rm } from "node:fs/promises";
import { test } from "node:test";

import { makeTempDir, runCli } from "./helpers.ts";

const cases: [string, string[]][] = [
  ["valid init", ["init", "--stack", "typescript"]],
  ["missing stack", ["init"]],
  ["invalid stack", ["init", "--stack", "ruby"]],
  ["unknown command", ["bogus"]],
  ["no arguments", []],
  ["SDD command", ["sdd", "workspace"]],
  ["SDD help", ["sdd", "--help"]],
  ["SDD workspace help", ["sdd", "workspace", "--help"]],
  ["top-level help", ["--help"]],
];

for (const [name, args] of cases) {
  test(`fails with install link and writes nothing when just is missing (${name})`, async () => {
    const project = await makeTempDir();
    const emptyPath = await makeTempDir("spindle-empty-path-");
    try {
      const result = runCli(project, args, emptyPath);

      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /`just` is not installed|just.*not (found|installed)/i);
      assert.match(result.stderr, /https:\/\/just\.systems\/man\/en\/installation\.html/);
      assert.doesNotMatch(result.stderr, /usage|stack/i);
      assert.deepEqual(await readdir(project), []);
    } finally {
      await rm(project, { recursive: true, force: true });
      await rm(emptyPath, { recursive: true, force: true });
    }
  });
}
