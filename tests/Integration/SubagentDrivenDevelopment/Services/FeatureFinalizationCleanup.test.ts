import { existsSync, readFileSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { cliOutput, invokeAsync } from "@test/Helpers/SubagentDrivenDevelopment/helpers";
import { expect, test, vi } from "vitest";

import { git, readyFeature, recordFinal } from "../Fixtures/FeatureFinalizationFixture";

vi.setConfig({ testTimeout: 60_000 });

test.each([
  "dirty-ticket",
  "ignored-ticket",
  "moved-ticket",
  "symlink-ticket",
  "locked-ticket",
  "wrong-final-merge",
])("cleanup preflights all targets and rejects %s while preserving worktrees", async (guard) => {
  const f = await readyFeature();
  cliOutput(await f.finish());
  cliOutput(await recordFinal(f));
  if (guard === "symlink-ticket") {
    renameSync(f.ticketRoot, `${f.ticketRoot}.preserved`);
    symlinkSync(`${f.ticketRoot}.preserved`, f.ticketRoot);
  } else if (guard === "locked-ticket") git(f.original, "worktree", "lock", f.ticketRoot);
  else if (guard === "wrong-final-merge") {
    writeFileSync(join(f.original, "user.txt"), "user\n");
    git(f.original, "add", "user.txt");
    git(f.original, "commit", "-qm", "move final branch");
  } else {
    writeFileSync(join(f.ticketRoot, "user.txt"), "preserve\n");
    if (guard === "ignored-ticket")
      writeFileSync(join(f.original, ".git", "info", "exclude"), "user.txt\n");
    if (guard === "moved-ticket") {
      git(f.ticketRoot, "add", "user.txt");
      git(f.ticketRoot, "commit", "-qm", "move ticket branch");
    }
  }
  const result = await invokeAsync(f.original, [
    "finish",
    "--feature",
    f.originalSpec.replace(/\/spec\.md$/, ""),
    "--actor",
    "controller",
  ]);
  expect(result.status).not.toBe(0);
  expect(existsSync(f.root)).toBe(true);
  expect(existsSync(f.ticketRoot)).toBe(true);
  expect(JSON.parse(readFileSync(f.journal, "utf8")).phase).toBe("validation");
});
