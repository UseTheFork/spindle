import { dispatchFixture } from "@test/Helpers/SubagentDrivenDevelopment/DispatchFixture";
import { expect, test } from "vitest";

test(
  "dispatches independent tasks while dependent tasks and duplicate dispatches remain blocked",
  { timeout: 15_000 },
  async () => {
    const { featureFlag, invoke, name, run, startTicket, task, workspace } =
      await dispatchFixture();
    const first = task("src/schema.ts");
    const second = task("src/service.ts");
    const dependent = task("src/command.ts", "--depends-on", first);
    const dispatch = (id: string) => ["dispatch", ...featureFlag, "--task", id];
    expect(run(...dispatch(first)).stderr).toContain("no-worktree");
    startTicket();
    expect(invoke("next", ...featureFlag).actions).toEqual(
      [first, second].map((id) => `spindle sdd dispatch --feature ${name} --task ${id}`),
    );
    expect(invoke(...dispatch(first))).toMatchObject({
      task: first,
      attempt: 1,
      assignmentCommand: `spindle sdd assignment --feature '${workspace}' --task ${first} --attempt 1 --json`,
    });
    expect(invoke(...dispatch(second))).toMatchObject({ task: second, attempt: 1 });
    const duplicate = run(...dispatch(first));
    expect(duplicate.status).toBe(1);
    expect(duplicate.stderr).toContain("already has active attempt 1");
    const blocked = run(...dispatch(dependent));
    expect(blocked.status).toBe(1);
    expect(blocked.stderr).toContain("dependency-not-done");
    expect(invoke("next", ...featureFlag).actions).toEqual([]);
  },
);
