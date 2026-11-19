import { mkdir, readFile, rmdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { reviewFixture } from "@test/Helpers/SubagentDrivenDevelopment/ReviewFixture";
import { expect, test } from "vitest";

test(
  "starts reviews only after a committed round and gives reviewers a read-only assignment",
  { timeout: 20_000 },
  async () => {
    const { featureFlag, name, initialTask, complete, invoke, run, worktree, workspace } =
      await reviewFixture();
    const review = ["review", ...featureFlag, "--ticket", "T-0001", "--scope", "First file"];
    expect(run(...review).stderr).toContain("committed round");
    await mkdir(join(worktree, ".spindle"));
    const notes = join(worktree, ".spindle", "review-notes.md");
    await writeFile(notes, "Original notes");
    await complete(initialTask, "first.ts");
    expect(invoke("next", ...featureFlag).actions).toContain(
      `spindle sdd review --feature ${name} --ticket T-0001`,
    );
    const first = invoke(...review, "--focus", "Tests");
    await writeFile(notes, "Updated notes");
    await writeFile(join(worktree, "test-output.txt"), "Untracked test output");
    const second = invoke(...review);
    expect(first.review).not.toBe(second.review);
    expect(first.codeRevision).toBe(second.codeRevision);
    expect(first.assignmentCommand).toContain(`--feature '${workspace}' --review ${first.review}`);

    const ledger = join(workspace, "sdd.json");
    const before = await readFile(ledger, "utf8");
    const lock = join(workspace, ".ledger-lock");
    await mkdir(lock);
    const assigned = invoke("assignment", "--feature", workspace, "--review", first.review);
    expect(assigned).toMatchObject({
      role: "reviewer",
      ticket: "T-0001",
      worktree,
      codeRevision: first.codeRevision,
      scope: "First file",
      focus: "Tests",
      acceptanceCriteria: "Done",
    });
    expect(assigned).not.toHaveProperty("reportPath");
    expect(
      run("assignment", "--feature", workspace, "--review", first.review, "--attempt", "1").stderr,
    ).toContain("Use either --task with --attempt, --review, or --merge.");
    expect(run("assignment", ...featureFlag, "--review", first.review).stderr).toContain(
      "requires an absolute --feature path",
    );
    expect(await readFile(ledger, "utf8")).toBe(before);
    await rmdir(lock);
    await writeFile(join(worktree, "first.ts"), "changed");
    expect(run("assignment", "--feature", workspace, "--review", first.review).stderr).toContain(
      "no longer matches the current ticket revision",
    );
  },
);
