import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { readBlueprintVersion } from "../src/version.ts";

test("reads Blueprint versions from metadata frontmatter", async () => {
  const directory = await mkdtemp(join(tmpdir(), "spindle-version-"));
  const file = join(directory, "SKILL.md");
  try {
    await writeFile(file, "---\nmetadata:\n  spindle:\n    version: 1.2.3\n---\nSkill\n");

    assert.equal(await readBlueprintVersion(file), "1.2.3");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("ignores Blueprint versions under the old meta frontmatter key", async () => {
  const directory = await mkdtemp(join(tmpdir(), "spindle-version-"));
  const file = join(directory, "SKILL.md");
  try {
    await writeFile(file, "---\nmeta:\n  spindle:\n    version: 1.2.3\n---\nSkill\n");

    assert.equal(await readBlueprintVersion(file), null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
