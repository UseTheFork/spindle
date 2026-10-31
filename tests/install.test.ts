import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test } from "node:test";

import { installDirectory } from "../src/install.ts";
import { makeTempDir } from "./helpers.ts";

test("installation renders recognized UTF-8 text and preserves files that must not be rendered", async () => {
  const source = await makeTempDir("spindle-install-source-");
  const target = await makeTempDir("spindle-install-target-");
  const context = { stacks: ["python", "typescript"], variables: { name: "Spindle" } };
  const preservedFiles = new Map<string, Buffer>([
    ["assets/logo.png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff])],
    ["assets/template.bin", Buffer.from("{{ variables.name }}\n")],
    ["assets/nul.txt", Buffer.from("A\0B")],
    ["assets/invalid-utf8.md", Buffer.from([0x41, 0xc3, 0x28, 0x42])],
  ]);
  try {
    await writeFile(join(source, "SKILL.md"), "Hello {{ variables.name }}!");
    await mkdir(join(source, "templates/sub"), { recursive: true });
    await writeFile(join(source, "templates/a.md"), "a {{ stacks | join(',') }}\n");
    await writeFile(
      join(source, "templates/sub/x.md"),
      "x {% raw %}{{VSCODE_FOO}}{% endraw %} {{ stacks | join('+') }}\n",
    );
    for (const [path, content] of preservedFiles) {
      const file = join(source, path);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, content);
    }

    await installDirectory(source, target, context);

    assert.equal(await readFile(join(target, "SKILL.md"), "utf8"), "Hello Spindle!");
    assert.equal(await readFile(join(target, "templates/a.md"), "utf8"), "a python,typescript\n");
    assert.equal(
      await readFile(join(target, "templates/sub/x.md"), "utf8"),
      "x {{VSCODE_FOO}} python+typescript\n",
    );
    for (const [path, content] of preservedFiles) {
      assert.deepEqual(await readFile(join(target, path)), content, path);
    }
  } finally {
    await rm(source, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
  }
});
