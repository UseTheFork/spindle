import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { test, expect } from "vitest";

import { readBlueprintVersion } from "@/BlueprintManagement/Versioning/BlueprintVersion";

test("reads Blueprint versions from metadata frontmatter", async () => {
  const directory = await mkdtemp(join(process.cwd(), "spindle-version-"));
  const file = join(directory, "SKILL.md");
  try {
    await writeFile(file, "---\nmetadata:\n  spindle:\n    version: 1.2.3\n---\nSkill\n");

    expect(await readBlueprintVersion(file)).toBe("1.2.3");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("ignores Blueprint versions under the old meta frontmatter key", async () => {
  const directory = await mkdtemp(join(process.cwd(), "spindle-version-"));
  const file = join(directory, "SKILL.md");
  try {
    await writeFile(file, "---\nmeta:\n  spindle:\n    version: 1.2.3\n---\nSkill\n");

    expect(await readBlueprintVersion(file)).toBe(null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
