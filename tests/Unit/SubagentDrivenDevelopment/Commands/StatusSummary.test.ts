import { expect, test } from "vitest";

import { ProjectSettingsService } from "@/Settings/Services/ProjectSettingsService";

import {
  createStatusSummaryService,
  nextSummary,
} from "../../../Helpers/SubagentDrivenDevelopment/StatusSummary";

test("summary uses the configured multi-word prefix for commands without rewriting check values", async () => {
  const service = await createStatusSummaryService("npm run");
  const status = {
    feature: "0001-export",
    actions: [
      { ticket: "T-0001", action: "implement" },
      { ticket: "T-0002", action: "checks", checkCommand: "pnpm spindle custom" },
      { ticket: "T-0003", action: "adjudicate-findings" },
    ],
    findings: [
      {
        ticket: "T-0003",
        finding: { id: "F-0001", status: "open", blocking: true, summary: "Review" },
      },
    ],
    pendingAssignments: [],
    blockers: [],
    delivery: { action: "close-tickets" },
  };
  const output = service.statusSummary(status, "spec.md", "Feature status").join("\n");

  expect(output).toContain("Next: npm run spindle sdd implement");
  expect(output).toContain("npm run spindle sdd checks record");
  expect(output).toContain("--command 'pnpm spindle custom'");
  expect(output).toContain("npm run spindle sdd finding update");
  expect(output).toContain("npm run spindle sdd requirements decide");
});

test("summary uses the configured prefix for pending review and delivery guidance", async () => {
  const service = await createStatusSummaryService("yarn");
  const output = service
    .nextSummary({
      feature: "0001-export",
      actions: [],
      pendingAssignments: [
        {
          ticket: "delivery",
          id: "review-0001",
          role: "review",
          scope: "delivery",
          requestedAt: new Date().toISOString(),
          report: "/repo/review.md",
          reportPresent: true,
        },
      ],
      delivery: { action: "await-review-report" },
    })
    .join("\n");

  expect(output).toContain("yarn spindle sdd finding create");
  expect(output).toContain("yarn spindle sdd submit");
  expect(output).not.toContain("pnpm spindle");
});

test("finish uses the configured prefix for final validation guidance", async () => {
  const service = await createStatusSummaryService("bun");
  const output = service
    .finishSummary({
      feature: "0001-export",
      phase: "validation",
      finalValidation: "pending",
      mergeCommit: "abc123",
      headSha: "abc123",
      required: [{ command: "pnpm run build" }],
      records: [],
    })
    .join("\n");

  expect(output).toContain("bun spindle sdd checks record");
  expect(output).toContain("--command 'pnpm run build'");
});

test("summary uses the configured prefix for ticket and delivery correction commands", async () => {
  const service = await createStatusSummaryService("pnpm exec");
  const output = service
    .nextSummary({
      feature: "0001-export",
      actions: [{ ticket: "T-0001", action: "correct", checkFailure: "test ticket" }],
      findings: [
        {
          ticket: "T-0001",
          finding: { id: "F-0001", status: "confirmed", blocking: true },
        },
      ],
      pendingAssignments: [],
      delivery: {
        action: "correct",
        headSha: "abc123",
        findings: [{ id: "F-0002", status: "confirmed", blocking: true }],
        checkRecords: [{ command: "test delivery", result: "failed", headSha: "abc123" }],
      },
    })
    .join("\n");

  expect(output).toContain(
    "pnpm exec spindle sdd correct --feature .scratch/0001-export --ticket T-0001 --findings",
  );
  expect(output).toContain("--check-failure 'test ticket'");
  expect(output).toContain(
    "pnpm exec spindle sdd correct --feature .scratch/0001-export --scope delivery --findings",
  );
  expect(output).toContain("--check-failure 'test delivery'");
});

test("summary reads the current setting on each invocation", async () => {
  const service = await createStatusSummaryService("pnpm");
  const status = { feature: "0001-export", delivery: { action: "claim" } };
  expect(service.nextSummary(status).join("\n")).toContain("pnpm spindle sdd claim");

  const replacement = ProjectSettingsService.parse(
    JSON.stringify({ stacks: ["python"], spindle_package_manager: "npm run" }),
  );
  await ProjectSettingsService.withTemporaryState(service.app, replacement, async () => {
    expect(service.nextSummary(status).join("\n")).toContain("npm run spindle sdd claim");
  });
  expect(service.nextSummary(status).join("\n")).toContain("pnpm spindle sdd claim");
});

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

  expect(summary).toContain("step ticket:correct (judgment required)");
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
    "pnpm spindle sdd checks record --feature .scratch/0001-export --scope delivery --command 'pnpm run build' --result passed --actor <acting-agent>",
  );
  expect(summary).toContain(
    "pnpm spindle sdd checks record --feature .scratch/0001-export --scope delivery --command 'pnpm run build' --result <failed|unavailable> --details <failure-or-unavailability-details> --actor <acting-agent>",
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

test("next allows a no-finding review result while guiding finding registration before submission", () => {
  const assignment = {
    ticket: "delivery",
    id: "review-0001",
    role: "review",
    status: "pending",
    scope: "delivery",
    requestedAt: new Date().toISOString(),
    report: "/repo/.scratch/0001-export/reports/review-0001.md",
    reportPresent: true,
  };
  const summary = nextSummary({
    feature: "0001-export",
    actions: [],
    pendingAssignments: [assignment],
    findings: [],
    blockers: [],
    delivery: { action: "await-review-report", findings: [] },
  }).join("\n");

  expect(summary).toContain(
    "register each accepted finding against this assignment before submission",
  );
  expect(summary).toContain("Findings already registered from this report: none.");
  expect(summary).toContain("A failed result requires at least one registered finding.");
  expect(summary).toContain(
    "If none are accepted, submit passed, or unavailable when the report has no usable verdict.",
  );
  expect(summary).toContain(
    "pnpm spindle sdd finding create --feature .scratch/0001-export --scope delivery --assignment review-0001 --blocking --summary <summary> --details <impact> --actor <acting-agent>",
  );
  expect(summary).toContain(
    "pnpm spindle sdd submit --feature .scratch/0001-export --scope delivery --assignment review-0001 --result passed --actor <acting-agent>",
  );
  expect(summary).toContain(
    "pnpm spindle sdd submit --feature .scratch/0001-export --scope delivery --assignment review-0001 --result unavailable --details <unavailability-details> --actor <acting-agent>",
  );
  expect(summary).not.toContain("--result <failed|unavailable>");
  expect(summary.indexOf("finding create")).toBeLessThan(summary.indexOf("sdd submit"));
});

test("next supplies result-specific commands for a ticket review report", () => {
  const summary = nextSummary({
    feature: "0001-export",
    actions: [{ ticket: "T-0001", action: "await-review-report" }],
    pendingAssignments: [
      {
        ticket: "T-0001",
        id: "review-0001",
        role: "review",
        requestedAt: new Date().toISOString(),
        report: "/repo/.scratch/0001-export/reports/review-0001.md",
        reportPresent: true,
      },
    ],
    findings: [],
    blockers: [],
    delivery: { action: "close-tickets" },
  }).join("\n");

  expect(summary).toContain(
    "pnpm spindle sdd submit --feature .scratch/0001-export --ticket T-0001 --assignment review-0001 --result passed --actor <acting-agent>",
  );
  expect(summary).toContain(
    "pnpm spindle sdd submit --feature .scratch/0001-export --ticket T-0001 --assignment review-0001 --result unavailable --details <unavailability-details> --actor <acting-agent>",
  );
  expect(summary).not.toContain("--result <failed|unavailable>");
});

test("next offers a failed review result once a finding is registered", () => {
  const summary = nextSummary({
    feature: "0001-export",
    actions: [{ ticket: "T-0001", action: "await-review-report" }],
    pendingAssignments: [
      {
        ticket: "T-0001",
        id: "review-0001",
        role: "review",
        requestedAt: new Date().toISOString(),
        report: "/repo/.scratch/0001-export/reports/review-0001.md",
        reportPresent: true,
      },
    ],
    findings: [
      {
        ticket: "T-0001",
        finding: {
          id: "F-0001",
          blocking: true,
          summary: "Regression",
          provenance: [{ report: "/repo/.scratch/0001-export/reports/review-0001.md" }],
        },
      },
    ],
    blockers: [],
    delivery: { action: "close-tickets" },
  }).join("\n");

  expect(summary).toContain(
    "pnpm spindle sdd submit --feature .scratch/0001-export --ticket T-0001 --assignment review-0001 --result <failed|unavailable> --details <failure-or-unavailability-details> --actor <acting-agent>",
  );
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
  expect(summary).toContain("step ticket:adjudicate (judgment required)");
  expect(summary).toContain(
    "pnpm spindle sdd finding update --feature .scratch/0001-export --ticket T-0001 --finding F-0003 --status confirmed --actor <acting-agent>",
  );
  expect(summary).toContain(
    "pnpm spindle sdd finding update --feature .scratch/0001-export --ticket T-0001 --finding F-0003 --status dismissed --details <ruling-rationale> --actor <acting-agent>",
  );
  expect(summary).toContain(
    "To defer F-0003, first commit the approved requirements change, record its approval if needed, and obtain fresh passing review coverage for the current requirements.",
  );
  expect(summary).toContain(
    "pnpm spindle sdd requirements decide --feature .scratch/0001-export --ticket T-0001 --finding F-0003 --decision approved --details <requirements-rationale> --actor <acting-agent>",
  );
  expect(summary).toContain(
    "pnpm spindle sdd finding update --feature .scratch/0001-export --ticket T-0001 --finding F-0003 --status deferred --details <deferral-rationale> --follow-up <follow-up-reference> --requirements-decision <approved-decision-id> --actor <acting-agent>",
  );
  expect(summary).not.toContain("sdd correct");
});

test("next explains delivery finding deferral prerequisites and commands", () => {
  const summary = nextSummary({
    feature: "0001-export",
    actions: [],
    pendingAssignments: [],
    blockers: [],
    delivery: {
      action: "adjudicate-findings",
      findings: [
        {
          id: "F-0004",
          status: "open",
          blocking: true,
          summary: "Clarify the feature requirement",
        },
      ],
    },
  }).join("\n");

  expect(summary).toContain(
    "To defer F-0004, first commit the approved requirements change, record its approval if needed, and obtain fresh passing review coverage for the current requirements.",
  );
  expect(summary).toContain(
    "pnpm spindle sdd requirements decide --feature .scratch/0001-export --scope delivery --finding F-0004 --decision approved --details <requirements-rationale> --actor <acting-agent>",
  );
  expect(summary).toContain(
    "pnpm spindle sdd finding update --feature .scratch/0001-export --scope delivery --finding F-0004 --status deferred --details <deferral-rationale> --follow-up <follow-up-reference> --requirements-decision <approved-decision-id> --actor <acting-agent>",
  );
});

test("next lists failed review reports without finding creation or a dead-end notice", () => {
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
  expect(summary).not.toContain("cannot accept findings");
  expect(summary).not.toContain("sdd finding create");
  expect(summary).not.toContain("sdd correct");
});

test("next re-dispatches a ticket review after an unavailable report", () => {
  const summary = nextSummary({
    feature: "0001-export",
    actions: [
      {
        ticket: "T-0001",
        action: "review",
        unavailableReviewAssignments: [
          {
            id: "review-0002",
            agent: "sdd-code-reviewer",
            report: "/repo/.scratch/0001-export/reports/review-0002.md",
          },
        ],
      },
    ],
    findings: [],
    pendingAssignments: [],
    blockers: [],
    delivery: { action: "close-tickets" },
  }).join("\n");

  expect(summary).toContain("T-0001: step ticket:review (ready)");
  expect(summary).toContain(
    "Review review-0002 (sdd-code-reviewer) was unavailable; dispatch a new review round for that reviewer.",
  );
  expect(summary).toContain(
    "Next: pnpm spindle sdd review --feature .scratch/0001-export --ticket T-0001 --actor <acting-agent>",
  );
  expect(summary).not.toContain("cannot accept findings");
  expect(summary).not.toContain("sdd correct");
});

test("next asks for pending parallel reviews before a correction decision", () => {
  const summary = nextSummary({
    feature: "0001-export",
    actions: [{ ticket: "T-0001", action: "await-review-report" }],
    pendingAssignments: [
      {
        ticket: "T-0001",
        id: "review-0003",
        role: "review",
        status: "pending",
        scope: "initial",
        requestedAt: new Date().toISOString(),
        report: "/repo/.scratch/0001-export/reports/review-0003.md",
        reportPresent: true,
      },
    ],
    findings: [
      {
        ticket: "T-0001",
        finding: { id: "F-0001", status: "open", blocking: true, summary: "Reject rows" },
      },
    ],
    blockers: [],
    delivery: { action: "close-tickets" },
  }).join("\n");

  expect(summary).toContain("T-0001: step ticket:review (awaiting report)");
  expect(summary).toContain(
    "pnpm spindle sdd submit --feature .scratch/0001-export --ticket T-0001 --assignment review-0003 --result passed --actor <acting-agent>",
  );
  expect(summary).not.toContain("sdd correct");
  expect(summary).not.toContain("sdd finding update");
});

test("next re-dispatches a feature review after an unavailable report", () => {
  const summary = nextSummary({
    feature: "0001-export",
    actions: [],
    pendingAssignments: [],
    blockers: [],
    delivery: {
      action: "review",
      reviewAssignments: [
        { id: "review-0004", agent: "sdd-reviewer", status: "submitted", result: "passed" },
        {
          id: "review-0005",
          agent: "sdd-code-reviewer",
          status: "submitted",
          result: "unavailable",
        },
      ],
    },
  }).join("\n");

  expect(summary).toContain("Feature 0001-export: step delivery:review");
  expect(summary).toContain(
    "Review review-0005 (sdd-code-reviewer) was unavailable; dispatch a new review round for that reviewer.",
  );
  expect(summary).not.toContain("Review review-0004");
  expect(summary).toContain(
    "Next: pnpm spindle sdd review --feature .scratch/0001-export --scope delivery --actor <acting-agent>",
  );
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
    "pnpm spindle sdd checks record --feature .scratch/0001-export --ticket T-0001 --command 'pnpm run test:export' --result passed --actor <acting-agent>",
  );
  expect(summary).toContain(
    "pnpm spindle sdd checks record --feature .scratch/0001-export --ticket T-0001 --command 'pnpm run test:export' --result <failed|unavailable> --details <failure-or-unavailability-details> --actor <acting-agent>",
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
    "pnpm spindle sdd checks record --feature .scratch/0001-export --ticket T-0001 --scope post-merge --command 'pnpm run test:export' --result passed --actor <acting-agent>",
  );
  expect(summary).toContain(
    "pnpm spindle sdd checks record --feature .scratch/0001-export --ticket T-0001 --scope post-merge --command 'pnpm run test:export' --result <failed|unavailable> --details <failure-or-unavailability-details> --actor <acting-agent>",
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
    "pnpm spindle sdd checks record --feature .scratch/0001-export --scope final --command 'pnpm run build' --result passed --actor <acting-agent>",
  );
  expect(summary).toContain(
    "pnpm spindle sdd checks record --feature .scratch/0001-export --scope final --command 'pnpm run build' --result <failed|unavailable> --details <failure-or-unavailability-details> --actor <acting-agent>",
  );
});

test("next declares final checks before offering feature finish", () => {
  const summary = nextSummary({
    feature: "0001-export",
    actions: [],
    pendingAssignments: [],
    blockers: [],
    delivery: {
      action: "require-final-checks",
      finalChecks: [],
      requiredChecks: [{ command: "pnpm run test:feature" }],
    },
  }).join("\n");

  expect(summary).toContain("Feature 0001-export: step delivery:checks");
  expect(summary).toContain("Declare the complete final-check list before finishing");
  expect(summary).toContain(
    "pnpm spindle sdd checks require --feature .scratch/0001-export --scope final --command <check> [--command <check> ...] --actor <acting-agent>",
  );
  expect(summary).not.toContain("sdd finish --feature");
});
