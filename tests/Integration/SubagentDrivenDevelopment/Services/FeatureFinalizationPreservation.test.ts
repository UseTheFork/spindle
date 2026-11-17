import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import { cliOutput, invokeAsync } from "@test/Helpers/SubagentDrivenDevelopment/helpers";
import { expect, test, vi } from "vitest";

import {
  git,
  originalIgnoredArtifacts,
  readyFeature,
  recordFinal,
} from "../Fixtures/FeatureFinalizationFixture";

vi.setConfig({ testTimeout: 60_000 });

test("original ignored node_modules and build artifacts survive the real complete flow", async () => {
  const f = await readyFeature();
  const files = originalIgnoredArtifacts(f);
  const merged = cliOutput(await f.finish());
  expect(merged.finalValidation).toBe("pending");
  cliOutput(await recordFinal(f));
  const complete = cliOutput(
    await invokeAsync(f.original, [
      "finish",
      "--feature",
      f.originalSpec.replace(/\/spec\.md$/, ""),
      "--actor",
      "controller",
    ]),
  );
  expect(complete.finished).toBe(true);
  expect(existsSync(f.root)).toBe(false);
  expect(existsSync(f.ticketRoot)).toBe(false);
  for (const file of files) expect(readFileSync(file.path, "utf8")).toBe(file.content);
});

test.each(["file", "directory", "parent-file", "empty-directory"])(
  "an original ignored %s colliding with incoming feature code blocks merge and is preserved",
  async (kind) => {
    const f = await readyFeature(kind === "parent-file" ? "feature.ts/child.ts" : "feature.ts");
    const files = originalIgnoredArtifacts(f);
    const exclude = join(f.original, ".git", "info", "exclude");
    writeFileSync(exclude, `${readFileSync(exclude, "utf8")}\nfeature.ts\n`);
    const collision = join(f.original, "feature.ts");
    const directory = kind === "directory" || kind === "empty-directory";
    if (directory) mkdirSync(collision);
    const dataPath = directory ? join(collision, "artifact.txt") : collision;
    const userData = "unrelated original ignored source file\n";
    if (kind !== "empty-directory") writeFileSync(dataPath, userData);
    expect(git(f.original, "status", "--porcelain")).toBe("");
    const failed = await f.finish();
    expect(failed.status).not.toBe(0);
    expect(failed.stderr).toMatch(/overwritten by merge/);
    if (kind !== "empty-directory") expect(readFileSync(dataPath, "utf8")).toBe(userData);
    else expect(lstatSync(collision).isDirectory()).toBe(true);
    expect(git(f.original, "rev-parse", "HEAD")).toBe(f.featureRevision);
    expect(existsSync(f.root)).toBe(true);
    expect(existsSync(f.ticketRoot)).toBe(true);
    const stopped = JSON.parse(readFileSync(f.journal, "utf8"));
    expect(stopped.phase).toBe("merging");
    const recordsCommit = git(f.root, "rev-parse", "HEAD");
    // Simulate the user's safe resolution, preserving rather than deleting data.
    const preserved = join(f.original, "node_modules", "preserved-feature.ts");
    renameSync(collision, preserved);
    cliOutput(await f.finish());
    expect(git(f.root, "rev-parse", "HEAD")).toBe(recordsCommit);
    cliOutput(await recordFinal(f));
    expect(
      cliOutput(
        await invokeAsync(f.original, [
          "finish",
          "--feature",
          f.originalSpec.replace(/\/spec\.md$/, ""),
          "--actor",
          "controller",
        ]),
      ).finished,
    ).toBe(true);
    if (kind !== "empty-directory")
      expect(readFileSync(directory ? join(preserved, "artifact.txt") : preserved, "utf8")).toBe(
        userData,
      );
    else expect(lstatSync(preserved).isDirectory()).toBe(true);
    for (const file of files) expect(readFileSync(file.path, "utf8")).toBe(file.content);
  },
);

test("a configured failing signer blocks finalization and preserves staged records and worktrees", async () => {
  const f = await readyFeature();
  const signer = join(dirname(f.original), "fixture-failing-signer.sh");
  writeFileSync(signer, "#!/bin/sh\nexit 1\n");
  chmodSync(signer, 0o755);
  git(f.original, "config", "gpg.format", "openpgp");
  git(f.original, "config", "gpg.program", signer);
  git(f.original, "config", "user.signingkey", "fixture-signing-key");
  git(f.original, "config", "commit.gpgSign", "true");
  const featureHead = git(f.root, "rev-parse", "HEAD");
  const ledgerBefore = readFileSync(join(dirname(f.spec), "sdd.json"), "utf8");
  const failed = await f.finish();
  expect(failed.status).not.toBe(0);
  expect(failed.stderr).toMatch(/gpg failed to sign|failed to write commit object/i);
  expect(git(f.original, "config", "--get", "commit.gpgSign")).toBe("true");
  expect(git(f.root, "rev-parse", "HEAD")).toBe(featureHead);
  expect(git(f.original, "rev-parse", "HEAD")).toBe(f.featureRevision);
  expect(readFileSync(join(dirname(f.spec), "sdd.json"), "utf8")).toBe(ledgerBefore);
  const staged = git(f.root, "diff", "--cached", "--name-only").split("\n").filter(Boolean);
  expect(staged.length).toBeGreaterThan(0);
  expect(staged.every((path) => path.startsWith(`.spindle/features/${f.feature}/`))).toBe(true);
  expect(JSON.parse(readFileSync(f.journal, "utf8")).phase).toBe("records");
  expect(existsSync(f.root)).toBe(true);
  expect(existsSync(f.ticketRoot)).toBe(true);
});
