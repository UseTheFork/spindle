import { describe, expect, test } from "vitest";

import { CheckRecords } from "@spindle/SubagentDrivenDevelopment/Support/CheckRecords";

describe("CheckRecords.latestForHead", () => {
  test("selects the latest record per command for the requested commit", () => {
    const first = { command: "lint", headSha: "current", result: "failed" };
    const otherCommand = { command: "test", headSha: "current", result: "passed" };
    const otherCommit = { command: "lint", headSha: "other", result: "passed" };
    const latest = { command: "lint", headSha: "current", result: "passed" };

    expect(
      CheckRecords.latestForHead([first, otherCommand, otherCommit, latest], "current"),
    ).toEqual([latest, otherCommand]);
    expect(CheckRecords.latestForHead([first], "other")).toEqual([]);
  });
});
