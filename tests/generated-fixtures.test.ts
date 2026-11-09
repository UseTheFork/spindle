import { rm } from "node:fs/promises";
import { resolve } from "node:path";

import { expect, test } from "vitest";

import { makeTempDir } from "./helpers.ts";

test("test fixtures are created under tests/.generated", async () => {
  const directory = await makeTempDir("spindle-fixture-location-");
  try {
    expect(resolve(directory, "..")).toBe(resolve(process.cwd(), "tests/.generated"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
