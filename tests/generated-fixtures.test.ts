import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { makeTempDir } from "./helpers.ts";

test("test fixtures are created under tests/.generated", async () => {
  const directory = await makeTempDir("spindle-fixture-location-");
  try {
    assert.equal(resolve(directory, ".."), resolve(process.cwd(), "tests/.generated"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
