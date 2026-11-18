import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { reviewFixture } from "@test/Helpers/SubagentDrivenDevelopment/ReviewFixture";
import { expect, test } from "vitest";

test(
  "records a dismissal reason without bypassing pending reviews",
  { timeout: 20_000 },
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
    const first = startReview();
    const second = startReview();
    const finding = reportFinding(first);
    const dismiss = ["finding", "dismiss", ...featureFlag, "--finding", finding, "--reason"];
    const ledger = join(workspace, "sdd.json");
    const before = await readFile(ledger, "utf8");
    expect(run(...dismiss, " ").stderr).toContain("reason must not be empty");
    expect(await readFile(ledger, "utf8")).toBe(before);
    const reason = "This criterion does not require that assertion.";
    expect(invoke(...dismiss, reason)).toMatchObject({
      finding,
      ticket: "T-0001",
      decision: { status: "dismissed", reason },
    });
    expect(JSON.parse(await readFile(ledger, "utf8")).findings[0].decision).toEqual({
      status: "dismissed",
      reason,
    });
    expect(run(...dismiss, "Another reason").stderr).toContain("is not open");
    expect(invoke("next", ...featureFlag).tickets[0].acceptance).toBe("InAcceptance");
    expect(submitReview(second, "pass").acceptance).toBe("Accepted");
  },
);
