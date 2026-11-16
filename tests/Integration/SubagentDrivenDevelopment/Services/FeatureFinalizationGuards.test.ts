import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  git,
  readyFeature,
} from "@test/Helpers/SubagentDrivenDevelopment/FeatureFinalizationFixture";
import { invokeAsync } from "@test/Helpers/SubagentDrivenDevelopment/helpers";
import { expect, test, vi } from "vitest";

vi.setConfig({ testTimeout: 60_000 });

test.each([
  "dirty-original",
  "moved-original",
  "detached-original",
  "wrong-branch",
  "dirty-code",
  "missing-retrospective",
  "changed-review",
])("full finish rejects %s without committing records or destroying work", async (guard) => {
  const f = await readyFeature();
  const before = git(f.root, "rev-parse", "HEAD");
  if (guard === "dirty-original" || guard === "moved-original") {
    writeFileSync(join(f.original, "user.txt"), "preserve\n");
    if (guard === "moved-original") {
      git(f.original, "add", "user.txt");
      git(f.original, "commit", "-qm", "user movement");
    }
  } else if (guard === "detached-original") git(f.original, "checkout", "--detach", "-q");
  else if (guard === "wrong-branch") git(f.original, "checkout", "-qb", "user-branch");
  else if (guard === "dirty-code") writeFileSync(join(f.root, "user.ts"), "preserve\n");
  else if (guard === "changed-review") {
    const ledger = JSON.parse(readFileSync(join(dirname(f.spec), "sdd.json"), "utf8"));
    writeFileSync(ledger.delivery.reviewAssignments[0].report, "# changed report\n");
  }
  const result =
    guard === "missing-retrospective"
      ? await invokeAsync(f.root, [
          "finish",
          "--feature",
          f.spec.replace(/\/spec\.md$/, ""),
          "--actor",
          "controller",
        ])
      : await f.finish();
  expect(result.status).not.toBe(0);
  expect(git(f.root, "rev-parse", "HEAD")).toBe(before);
  expect(existsSync(f.root)).toBe(true);
  expect(existsSync(f.ticketRoot)).toBe(true);
});
