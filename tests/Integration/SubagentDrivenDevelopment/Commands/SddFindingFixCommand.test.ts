import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { reviewFixture } from "@test/Helpers/SubagentDrivenDevelopment/ReviewFixture";
import { expect, test } from "vitest";

test(
  "links scoped fix work and resolves the finding only after follow-up review passes",
  { timeout: 30_000 },
  async () => {
    const {
      complete,
      initialTask,
      startReview,
      submitReview,
      reportFinding,
      run,
      invoke,
      featureFlag,
      workspace,
    } = await reviewFixture();
    await complete(initialTask, "first.ts");
    const finding = reportFinding(startReview());
    const next = () => invoke("next", ...featureFlag);
    expect(next().notices.join("\n")).toContain(`finding ${finding} needs a decision`);
    const fix = [
      "finding",
      "fix",
      ...featureFlag,
      "--finding",
      finding,
      "--instructions",
      "Add the missing assertion.",
      "--write-scope",
      "first.ts",
    ];
    const path = join(workspace, "sdd.json");
    const ledger = async () => JSON.parse(await readFile(path, "utf8"));
    const before = await ledger();
    expect(run(...fix).stderr).toContain("unordered-write-conflict");
    expect(await ledger()).toEqual(before);
    const orderedFix = [...fix, "--depends-on", initialTask];
    const { task } = invoke(...orderedFix);
    expect(run(...orderedFix).stderr).toContain("no existing fix work");
    expect((await ledger()).tickets[0].tasks.at(-1)).toMatchObject({
      id: task,
      discoveredFrom: finding,
      writeScope: ["first.ts"],
      dependencies: [initialTask],
    });

    invoke("dispatch", ...featureFlag, "--task", task);
    const { worktree, finding: assignedFinding } = invoke(
      "assignment",
      "--feature",
      workspace,
      "--task",
      task,
      "--attempt",
      "1",
    );
    expect(assignedFinding).toMatchObject({ id: finding, fixWork: { type: "task", taskId: task } });
    await writeFile(join(worktree, "first.ts"), "assertion added\n");
    invoke("task", "submit", ...featureFlag, "--task", task, "--attempt", "1");
    invoke("ticket", "commit", ...featureFlag, "--ticket", "T-0001", "--message", "Fix finding");
    expect((await ledger()).findings[0].decision.status).toBe("open");
    expect(next().actions).toContain(
      `spindle sdd review --feature ${featureFlag[1]} --ticket T-0001`,
    );
    const first = startReview();
    const second = startReview();
    for (const review of [first, second]) {
      expect(
        invoke("assignment", "--feature", workspace, "--review", review).findingsToVerify,
      ).toMatchObject([{ id: finding, decision: { status: "open" } }]);
    }
    expect(submitReview(first, "pass").acceptance).toBe("InAcceptance");
    expect((await ledger()).findings[0].decision.status).toBe("open");
    const followup = reportFinding(second);
    expect((await ledger()).findings[0].decision.status).toBe("open");
    expect(next().tickets[0].acceptance).toBe("Blocked");
    invoke(
      "finding",
      "dismiss",
      ...featureFlag,
      "--finding",
      followup,
      "--reason",
      "Not required by the criterion.",
    );
    expect((await ledger()).findings[0].decision.status).toBe("resolved");
    expect(next().tickets[0].acceptance).toBe("Accepted");
  },
);
