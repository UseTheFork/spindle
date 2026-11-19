import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { runCliRaw } from "@test/Helpers/Cli";
import { dispatchFixture } from "@test/Helpers/SubagentDrivenDevelopment/DispatchFixture";
import { expect, test } from "vitest";

test(
  "commits out-of-scope task changes and recovers after Git advances the branch",
  { timeout: 15_000 },
  async () => {
    const { featureFlag, invoke, git, repo, run, startTicket, task, workspace } =
      await dispatchFixture();
    const id = task("first.ts");
    const { worktree }: { worktree: string } = startTicket();
    git("config", "user.name", "Test");
    git("config", "user.email", "test@example.com");
    const base = git("-C", worktree, "rev-parse", "HEAD");
    const args = [
      "ticket",
      "commit",
      ...featureFlag,
      "--ticket",
      "T-0001",
      "--message",
      "Add first file",
    ];
    expect(run(...args).stderr).toContain("must be Done");
    invoke("dispatch", ...featureFlag, "--task", id);
    await writeFile(join(worktree, "first.ts"), "first");
    await writeFile(join(worktree, "out of scope.ts"), "keep");
    invoke("task", "submit", ...featureFlag, "--task", id, "--attempt", "1");

    const ledger = join(workspace, "sdd.json");
    const interrupted = runCliRaw(repo, ["--json", "sdd", ...args], process.env.PATH ?? "", {
      SPINDLE_TEST_PRELOAD: "tests/Helpers/Preloads/fail-ticket-commit-publication.ts",
      SPINDLE_TEST_LEDGER: ledger,
    });
    expect(interrupted.status).toBe(1);
    expect(interrupted.stderr).toContain("Injected failure publishing the completed commit.");
    const commit = git("-C", worktree, "rev-parse", "HEAD");
    expect(commit).not.toBe(base);
    expect(JSON.parse(await readFile(ledger, "utf8")).pendingTicketCommit).toMatchObject({
      base,
      commit,
    });
    expect(invoke("next", ...featureFlag).actions).toEqual([
      `spindle sdd ticket commit --feature ${featureFlag[1]} --ticket T-0001 --message='Add first file'`,
    ]);
    expect(invoke(...args)).toMatchObject({ ticket: "T-0001", commit });
    expect(git("-C", worktree, "rev-list", "--count", `${base}..HEAD`)).toBe("1");
    expect(git("-C", worktree, "show", "HEAD:first.ts")).toBe("first");
    expect(git("-C", worktree, "show", "HEAD:out of scope.ts")).toBe("keep");
    expect(git("-C", worktree, "status", "--short")).toBe("");
    const completed = JSON.parse(await readFile(ledger, "utf8"));
    expect(completed).not.toHaveProperty("pendingTicketCommit");
    expect(completed.tickets[0]).toMatchObject({
      workRoundCommits: [commit],
      committedTaskIds: [id],
    });
    expect(run(...args).stderr).toContain("no new completed tasks");
  },
);
