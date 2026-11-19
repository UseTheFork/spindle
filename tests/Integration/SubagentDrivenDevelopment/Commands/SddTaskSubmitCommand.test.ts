import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { dispatchFixture } from "@test/Helpers/SubagentDrivenDevelopment/DispatchFixture";
import { expect, test } from "vitest";

test(
  "accepts ordinary task changes outside declared scopes without committing",
  { timeout: 15_000 },
  async () => {
    const { featureFlag, invoke, git, name, run, startTicket, task, workspace } =
      await dispatchFixture();
    const first = task("first.ts");
    const second = task("second.ts");
    const dependent = task("not yet assigned.ts", "--depends-on", first);
    const { worktree }: { worktree: string } = startTicket();
    const dispatch = (id: string) => invoke("dispatch", ...featureFlag, "--task", id);
    const submit = (id: string, attempt: string) => [
      "task",
      "submit",
      ...featureFlag,
      "--task",
      id,
      "--attempt",
      attempt,
    ];
    dispatch(first);
    dispatch(second);
    invoke("dispatch", ...featureFlag, "--task", first, "--retry-stopped-attempt", "1");
    const before = await readFile(join(workspace, "sdd.json"), "utf8");
    const stale = run(...submit(first, "1"));
    expect(stale.status).toBe(1);
    expect(stale.stderr).toContain("not the active assignment");

    await writeFile(join(worktree, "first.ts"), "first");
    await writeFile(join(worktree, "second.ts"), "second");
    git("-C", worktree, "add", "second.ts");
    await writeFile(join(worktree, "second.ts"), "second with unstaged edits");
    await writeFile(join(worktree, "not yet assigned.ts"), "pending task");
    expect(await readFile(join(workspace, "sdd.json"), "utf8")).toBe(before);
    expect(invoke(...submit(first, "2"))).toEqual({
      feature: name,
      ticket: "T-0001",
      task: first,
      attempt: 2,
      state: "Done",
    });
    expect(await readFile(join(worktree, "not yet assigned.ts"), "utf8")).toBe("pending task");
    const head = git("-C", worktree, "rev-parse", "HEAD");
    const status = git("-C", worktree, "status", "--short");
    expect(invoke("next", ...featureFlag).actions).toContain(
      `spindle sdd dispatch --feature ${name} --task ${dependent}`,
    );
    expect(invoke(...submit(second, "1"))).toMatchObject({ task: second, state: "Done" });
    expect(git("-C", worktree, "rev-parse", "HEAD")).toBe(head);
    expect(git("-C", worktree, "status", "--short")).toBe(status);
  },
);
