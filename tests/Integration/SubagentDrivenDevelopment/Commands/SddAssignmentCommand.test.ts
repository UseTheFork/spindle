import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { dispatchFixture } from "@test/Helpers/SubagentDrivenDevelopment/DispatchFixture";
import { expect, test } from "vitest";

test(
  "reads only the current assignment without taking the write lock",
  { timeout: 15_000 },
  async () => {
    const { featureFlag, invoke, name, run, startTicket, task, workspace } =
      await dispatchFixture();
    const id = task("src/schema.ts", "--context", "docs/schema.md");
    const { worktree } = startTicket();
    const dispatch = ["dispatch", ...featureFlag, "--task", id];
    const assignment = ["assignment", "--feature", workspace, "--task", id];
    expect(run(...assignment, "--attempt", "1").stderr).toContain("not the active assignment");
    invoke(...dispatch);
    expect(run("assignment", ...featureFlag, "--task", id, "--attempt", "1").stderr).toContain(
      "absolute --feature",
    );
    invoke(...dispatch, "--retry-stopped-attempt", "1");
    expect(run(...dispatch, "--retry-stopped-attempt", "1").stderr).toContain(
      "not the active attempt",
    );
    expect(run(...assignment, "--attempt", "1").stderr).toContain("not the active assignment");
    const ledger = join(workspace, "sdd.json");
    const before = await readFile(ledger, "utf8");
    await mkdir(join(workspace, ".ledger-lock"));
    expect(invoke(...assignment, "--attempt", "2")).toMatchObject({
      role: "worker",
      feature: name,
      ticket: "T-0001",
      task: id,
      attempt: 2,
      worktree,
      instructions: "Edit the schema.",
      writeScope: ["src/schema.ts"],
      context: ["docs/schema.md"],
      requirements: "Scope",
      acceptanceCriteria: "Done",
      reportPath: join(workspace, "reports", `${id}-attempt-2.md`),
      workerRules: expect.arrayContaining(["Do not stage or commit changes."]),
      reportInstructions: expect.any(String),
    });
    expect(await readFile(ledger, "utf8")).toBe(before);
  },
);
