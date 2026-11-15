import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { test, expect } from "vitest";

import { BlueprintVersion } from "@spindle/BlueprintManagement/Versioning/BlueprintVersion";

import { makeTempDir } from "@test/Helpers/TemporaryDirectories";

test("reads Blueprint versions from metadata frontmatter", async () => {
  const directory = await makeTempDir("spindle-version-");
  const file = join(directory, "SKILL.md");
  await writeFile(file, "---\nmetadata:\n  spindle:\n    version: 1.2.3\n---\nSkill\n");

  expect(await BlueprintVersion.readBlueprintVersion(file)).toBe("1.2.3");
});
