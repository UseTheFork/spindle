import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  execute,
  prepareImplementationForReview,
  recordReviewCheck,
} from "@test/Helpers/SubagentDrivenDevelopment/helpers";
import { nextSummary } from "@test/Helpers/SubagentDrivenDevelopment/StatusSummary";
import { repoRoot } from "@test/Helpers/TemporaryDirectories";
import { expect, test } from "vitest";

function runSuggested(repo: string, lines: string[], operation: string, result: string) {
  const labels =
    result === "passed"
      ? ["Next (passed):"]
      : ["Next (failed or unavailable):", `Next (${result}):`];
  const line = lines.find(
    (candidate) =>
      labels.some((label) => candidate.includes(label)) && candidate.includes(operation),
  );
  if (!line) throw new Error(`Missing ${result} guidance for ${operation}.`);
  const prefix = "pnpm spindle sdd ";
  const index = line.indexOf(prefix);
  if (index < 0) throw new Error(`Invalid suggested command: ${line}`);
  const args = line
    .slice(index + prefix.length)
    .replace("<failed|unavailable>", result)
    .replace(/<(failure-or-unavailability|unavailability)-details>/, "'Reported result details'")
    .replace("<acting-agent>", "controller");
  const output = execFileSync(
    "sh",
    [
      "-c",
      `exec "$1" --import "$2" "$3" --json sdd ${args}`,
      "sh",
      process.execPath,
      import.meta.resolve("tsx"),
      join(repoRoot, "src/index.ts"),
    ],
    {
      cwd: repo,
      encoding: "utf8",
      env: { ...process.env, TSX_TSCONFIG_PATH: join(repoRoot, "tsconfig.json") },
    },
  );
  return JSON.parse(output).data;
}

test.each(["passed", "failed", "unavailable"])(
  "next's suggested %s check and review commands are executable",
  async (result) => {
    const { repo, spec, command } = await prepareImplementationForReview();
    const checkStatus = await execute(repo, (service) => service.deliveryService.next({ spec }));
    expect(checkStatus.status, checkStatus.stderr).toBe(0);
    const check = runSuggested(
      repo,
      nextSummary(JSON.parse(checkStatus.stdout)),
      "checks record",
      result,
    );
    expect(check.record.result).toBe(result);
    if (result === "passed") {
      expect(check.record.details).toBeUndefined();
    } else {
      expect(check.record.details).toBe("Reported result details");
      const passed = await recordReviewCheck(repo, spec, command, "passed");
      expect(passed.status, passed.stderr).toBe(0);
    }

    const review = await execute(repo, (service) =>
      service.reviewService.review({ spec, ticket: "T-0001", author: "controller" }),
    );
    expect(review.status, review.stderr).toBe(0);
    const assignment = JSON.parse(review.stdout).assignments[0] as { id: string; report: string };
    writeFileSync(assignment.report, "# Review report\n\nCompleted.\n");
    if (result === "failed") {
      const finding = await execute(repo, (service) =>
        service.findingService.findingCreate({
          spec,
          ticket: "T-0001",
          assignment: assignment.id,
          blocking: true,
          summary: "Acceptance regression",
          details: "The behavior violates an acceptance requirement.",
          author: "controller",
        }),
      );
      expect(finding.status, finding.stderr).toBe(0);
    }
    const reviewStatus = await execute(repo, (service) => service.deliveryService.next({ spec }));
    expect(reviewStatus.status, reviewStatus.stderr).toBe(0);
    const submitted = runSuggested(
      repo,
      nextSummary(JSON.parse(reviewStatus.stdout)),
      "sdd submit",
      result,
    );
    expect(submitted.assignment.result).toBe(result);
    if (result === "passed") {
      expect(submitted.assignment.details).toBeUndefined();
    } else {
      expect(submitted.assignment.details).toBe("Reported result details");
    }
  },
);

test("next offers the explicit one-use approved T-0004 recovery choice", () => {
  const lines = nextSummary({
    feature: "0001-ticket-task-dispatch",
    actions: [{ ticket: "T-0004", action: "approved-exception-correction" }],
    blockers: [],
    pendingAssignments: [],
    delivery: { status: "active", execution: "unstarted", blockers: [] },
  });
  expect(lines).toContain(
    "  Next: pnpm spindle sdd correct --feature .spindle/features/0001-ticket-task-dispatch --ticket T-0004 --details '<clear-correction-objective>' --approved-exception --actor <acting-agent>",
  );
});
