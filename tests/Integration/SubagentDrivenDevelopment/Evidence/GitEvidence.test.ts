import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import { GitEvidence } from "@/SubagentDrivenDevelopment/Evidence/GitEvidence";

import { serviceFixture } from "../../../Helpers/SubagentDrivenDevelopment/helpers";

test("content verification preserves binary payloads and distinguishes executable modes", async () => {
  const { repo, app, git } = await serviceFixture();
  const evidence = await app.make(GitEvidence);
  writeFileSync(join(repo, "binary"), Buffer.from([0, 255, 13, 10]));
  git("add", "binary");
  git("commit", "-qm", "binary");
  const paths = ["binary"];
  const baseline = evidence.worktreeContentDigest(paths);
  expect(evidence.gitTreeContentDigest(git("rev-parse", "HEAD"), paths)).toBe(baseline);
  expect(evidence.gitIndexContentDigest(paths)).toBe(baseline);
  chmodSync(join(repo, "binary"), 0o755);
  expect(evidence.worktreeContentDigest(paths)).not.toBe(baseline);
  expect(evidence.gitIndexContentDigest(paths)).toBe(baseline);
});
