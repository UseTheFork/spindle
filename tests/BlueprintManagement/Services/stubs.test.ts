import { rm } from "node:fs/promises";

import { expect, test } from "vitest";

import { Stacks } from "@/Support/Stacks";

import { makeTempDir, runCli } from "../../helpers.ts";

const stackSelections = Stacks.supported
  .reduce<string[][]>(
    (selections, stack) => [...selections, ...selections.map((selection) => [...selection, stack])],
    [[]],
  )
  .slice(1);

for (const stacks of stackSelections) {
  test(`init completes for production Blueprints with ${stacks.join(", ")}`, async () => {
    const project = await makeTempDir("spindle-production-init-");
    try {
      const result = runCli(
        project,
        ["init", ...stacks.flatMap((stack) => ["--stack", stack])],
        process.env.PATH ?? "",
      );

      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toMatch(/^✔ Installed /);
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });
}
