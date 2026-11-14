import { expect, test } from "vitest";

import { nextSummary } from "@/SubagentDrivenDevelopment/Commands/StatusSummary";

test("next lists ticket findings and failed checks as separate correction choices", () => {
  const summary = nextSummary({
    feature: "0001-export",
    actions: [
      {
        ticket: "T-0001",
        action: "correct",
        checkFailure: "pnpm exec vitest run tests/Export.test.ts",
      },
    ],
    findings: [
      {
        ticket: "T-0001",
        finding: {
          id: "F-0001",
          status: "confirmed",
          blocking: true,
          summary: "Reject malformed rows",
        },
      },
    ],
    pendingAssignments: [],
    blockers: [],
    delivery: { action: "close-tickets" },
  }).join("\n");

  expect(summary).toContain("step ticket:adjudicate (judgment required)");
  expect(summary).toContain("Eligible for correction on T-0001:");
  expect(summary).toContain("F-0001 (blocking) Reject malformed rows");
  expect(summary).toContain(
    "pnpm spindle sdd correct --feature .scratch/0001-export --ticket T-0001 --findings <one or more of: F-0001> --details <correction-objective> --actor <acting-agent>",
  );
  expect(summary).toContain(
    "pnpm spindle sdd correct --feature .scratch/0001-export --ticket T-0001 --check-failure 'pnpm exec vitest run tests/Export.test.ts' --details <correction-objective> --actor <acting-agent>",
  );
  expect(summary).not.toContain("--findings <finding-id>");
});

test("next adds a progress assessment when a post-merge correction is a continuation", () => {
  const summary = nextSummary({
    feature: "0001-export",
    actions: [
      {
        ticket: "T-0001",
        action: "post-merge-correct",
        checkFailure: "pnpm run test:export",
        continuationRequired: true,
      },
    ],
    findings: [],
    pendingAssignments: [],
    blockers: [],
    delivery: { action: "close-tickets" },
  }).join("\n");

  expect(summary).toContain("T-0001: step ticket:correct (judgment required)");
  expect(summary).toContain(
    "pnpm spindle sdd correct --feature .scratch/0001-export --ticket T-0001 --check-failure 'pnpm run test:export' --details <correction-objective> --decision continue --assessment <progress-assessment> --actor <acting-agent>",
  );
});

test("next lists delivery findings and failed checks as separate correction choices", () => {
  const summary = nextSummary({
    feature: "0001-export",
    actions: [],
    findings: [],
    pendingAssignments: [],
    blockers: [],
    delivery: {
      action: "correct",
      headSha: "abc123",
      findings: [
        {
          id: "F-0002",
          status: "confirmed",
          blocking: true,
          summary: "Preserve the export order",
        },
      ],
      correctionAttempts: [{ number: 1 }],
      adjudication: { status: "pending", reason: "no-progress" },
      requiredChecks: [{ command: "pnpm run build" }],
      checkRecords: [{ command: "pnpm run build", result: "failed", headSha: "abc123" }],
    },
  }).join("\n");

  expect(summary).toContain("Eligible for correction on delivery:");
  expect(summary).toContain("F-0002 (blocking) Preserve the export order");
  expect(summary).toContain(
    "pnpm spindle sdd correct --feature .scratch/0001-export --scope delivery --findings <one or more of: F-0002> --details <correction-objective> --decision continue --assessment <progress-assessment> --actor <acting-agent>",
  );
  expect(summary).toContain(
    "pnpm spindle sdd correct --feature .scratch/0001-export --scope delivery --check-failure 'pnpm run build' --details <correction-objective> --decision continue --assessment <progress-assessment> --actor <acting-agent>",
  );
  expect(summary).toContain("Correction is paused for adjudication (no-progress).");
});

test("next prints run-and-record commands for declared delivery checks", () => {
  const summary = nextSummary({
    feature: "0001-export",
    actions: [],
    findings: [],
    pendingAssignments: [],
    blockers: [],
    delivery: {
      action: "record-final-checks",
      headSha: "abc123",
      findings: [],
      correctionAttempts: [],
      requiredChecks: [{ command: "pnpm run build" }],
      checkRecords: [],
    },
  }).join("\n");

  expect(summary).toContain("Run delivery check: pnpm run build");
  expect(summary).toContain(
    "pnpm spindle sdd checks record --feature .scratch/0001-export --scope delivery --command 'pnpm run build' --result <passed|failed|unavailable> --actor <acting-agent>",
  );
  expect(summary).not.toContain("checks require --feature .scratch/0001-export --scope delivery");
});

test("next waits for delivery review reports instead of dispatching another review", () => {
  const summary = nextSummary({
    feature: "0001-export",
    actions: [],
    pendingAssignments: [
      {
        ticket: "delivery",
        id: "review-0001",
        role: "review",
        status: "pending",
        scope: "delivery",
        requestedAt: new Date().toISOString(),
        report: "/repo/.scratch/0001-export/reports/review-0001.md",
        reportPresent: false,
      },
    ],
    blockers: [],
    delivery: { action: "await-review-report" },
  }).join("\n");

  expect(summary).toContain("Feature 0001-export: step delivery:review");
  expect(summary).toContain("No ready delivery actions. Wait for the open assignments.");
  expect(summary).not.toContain("sdd review --feature");
});

test("next asks for an explicit finding disposition before dispatching correction", () => {
  const summary = nextSummary({
    feature: "0001-export",
    actions: [{ ticket: "T-0001", action: "adjudicate-findings" }],
    findings: [
      {
        ticket: "T-0001",
        finding: {
          id: "F-0003",
          status: "open",
          blocking: true,
          summary: "Clarify the empty export behavior",
        },
      },
    ],
    pendingAssignments: [],
    blockers: [],
    delivery: { action: "close-tickets" },
  }).join("\n");

  expect(summary).toContain("Unresolved findings need a disposition on T-0001:");
  expect(summary).toContain(
    "pnpm spindle sdd finding update --feature .scratch/0001-export --ticket T-0001 --finding F-0003 --status confirmed --actor <acting-agent>",
  );
  expect(summary).toContain(
    "pnpm spindle sdd finding update --feature .scratch/0001-export --ticket T-0001 --finding F-0003 --status dismissed --details <ruling-rationale> --actor <acting-agent>",
  );
  expect(summary).not.toContain("sdd correct");
});

test("next identifies failed review reports that need canonical finding registration", () => {
  const summary = nextSummary({
    feature: "0001-export",
    actions: [
      {
        ticket: "T-0001",
        action: "controller-correction-decision",
        failedReviewAssignments: [
          {
            id: "review-0001",
            role: "review",
            report: "/repo/.scratch/0001-export/reports/review-0001.md",
          },
        ],
      },
    ],
    findings: [],
    pendingAssignments: [],
    blockers: [],
    delivery: { action: "close-tickets" },
  }).join("\n");

  expect(summary).toContain("review-0001: /repo/.scratch/0001-export/reports/review-0001.md");
  expect(summary).toContain(
    "pnpm spindle sdd finding create --feature .scratch/0001-export --ticket T-0001 --assignment review-0001 --blocking --summary <summary> --details <impact> --actor <acting-agent>",
  );
  expect(summary).toContain(
    "pnpm spindle sdd finding create --feature .scratch/0001-export --ticket T-0001 --assignment review-0001 --non-blocking --summary <summary> --details <impact> --actor <acting-agent>",
  );
  expect(summary).not.toContain("sdd correct");
});

test("next exposes the check command that must be recorded before ticket review", () => {
  const summary = nextSummary({
    feature: "0001-export",
    actions: [{ ticket: "T-0001", action: "checks", checkCommand: "pnpm run test:export" }],
    findings: [],
    pendingAssignments: [],
    blockers: [],
    delivery: { action: "close-tickets" },
  }).join("\n");

  expect(summary).toContain("T-0001: step ticket:checks (ready)");
  expect(summary).toContain("Run ticket check: pnpm run test:export");
  expect(summary).toContain(
    "pnpm spindle sdd checks record --feature .scratch/0001-export --ticket T-0001 --command 'pnpm run test:export' --result <passed|failed|unavailable> --actor <acting-agent>",
  );
});

test("next prints run-and-record commands for declared post-merge checks", () => {
  const summary = nextSummary({
    feature: "0001-export",
    actions: [
      {
        ticket: "T-0001",
        action: "post-merge-checks",
        checkCommand: "pnpm run test:export",
      },
    ],
    findings: [],
    pendingAssignments: [],
    blockers: [],
    delivery: { action: "close-tickets" },
  }).join("\n");

  expect(summary).toContain("T-0001: step ticket:post-merge (ready)");
  expect(summary).toContain("Run post-merge check: pnpm run test:export");
  expect(summary).toContain(
    "pnpm spindle sdd checks record --feature .scratch/0001-export --ticket T-0001 --scope post-merge --command 'pnpm run test:export' --result <passed|failed|unavailable> --actor <acting-agent>",
  );
  expect(summary).not.toContain(
    "checks require --feature .scratch/0001-export --ticket T-0001 --scope post-merge",
  );
});

test("next prints each pending final check before its record command", () => {
  const summary = nextSummary({
    feature: "0001-export",
    phase: "validation",
    finalValidation: "pending",
    headSha: "abc123",
    required: [{ command: "pnpm run build" }],
    records: [],
    actions: [],
    pendingAssignments: [],
    blockers: [],
    delivery: { action: "finished" },
  }).join("\n");

  expect(summary).toContain("Run final check: pnpm run build");
  expect(summary).toContain(
    "pnpm spindle sdd checks record --feature .scratch/0001-export --scope final --command 'pnpm run build' --result <passed|failed|unavailable> --actor <acting-agent>",
  );
});
