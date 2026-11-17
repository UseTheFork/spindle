import { readFileSync } from "node:fs";
import { join } from "node:path";

import { LedgerRepository } from "@spindle/SubagentDrivenDevelopment/Persistence/LedgerRepository";
import { serviceFixture } from "@test/Helpers/SubagentDrivenDevelopment/helpers";
import { expect, test } from "vitest";

test("ledger validation returns the original validated object and preserves schema errors", async () => {
  const { app, service } = await serviceFixture();
  const feature = service.featureCreationService.create({ title: "Ledger", author: "controller" });
  const repository = await app.make(LedgerRepository);
  const raw: unknown = JSON.parse(readFileSync(feature.ledger, "utf8"));
  const ledger = repository.validateLedger(raw, feature.feature);
  expect(ledger).toBe(raw);
  expect(() => repository.validateLedger({ ...ledger, schemaVersion: 2 }, feature.feature)).toThrow(
    "Unsupported feature ledger schema version: 2.",
  );
  expect(() =>
    repository.validateLedger(
      { ...ledger, featureId: "0002", schemaVersion: 3 },
      "0002-unrelated-feature",
    ),
  ).toThrow("Unsupported feature ledger schema version: 3.");
  expect(() =>
    repository.validateLedger({ ...ledger, featureId: "0002" }, feature.feature),
  ).toThrow("Feature ledger ID does not match its workspace directory.");
});

test("legacy finding severity is removed when reading workflow records", async () => {
  const { app, service } = await serviceFixture();
  const feature = service.featureCreationService.create({
    title: "Legacy finding",
    author: "controller",
  });
  service.ticketService.ticketCreate({
    spec: feature.spec,
    title: "Review finding",
    reporter: "requester",
    category: "bug",
    author: "controller",
  });
  const raw = JSON.parse(readFileSync(feature.ledger, "utf8")) as {
    tickets: { findings?: Record<string, unknown>[] }[];
  };
  raw.tickets[0]!.findings = [
    {
      id: "F-0001",
      severity: "high",
      blocking: true,
      status: "open",
      summary: "Legacy severity",
      details: "This field is no longer part of findings.",
      author: "controller",
      createdAt: new Date().toISOString(),
      provenance: [
        {
          report: "/feature/reports/review.md",
          headSha: "a".repeat(40),
          author: "controller",
          summary: "Legacy severity",
          details: "This field is no longer part of findings.",
        },
      ],
      history: [
        {
          at: new Date().toISOString(),
          author: "controller",
          action: "registered",
          details: "Legacy finding.",
        },
      ],
    },
  ];

  const repository = await app.make(LedgerRepository);
  const ledger = repository.validateLedger(raw, feature.feature);

  expect(raw.tickets[0]!.findings![0]).toHaveProperty("severity", "high");
  expect(ledger.tickets[0]!.findings![0]).not.toHaveProperty("severity");
});

test("legacy no-findings review submissions migrate to empty finding lists across the ledger", async () => {
  const { app, service } = await serviceFixture();
  const feature = service.featureCreationService.create({
    title: "Legacy review assignment",
    author: "controller",
  });
  service.ticketService.ticketCreate({
    spec: feature.spec,
    title: "Reviewed ticket",
    reporter: "requester",
    category: "bug",
    author: "controller",
  });
  const raw = JSON.parse(readFileSync(feature.ledger, "utf8"));
  const at = new Date().toISOString();
  const review = (
    id: string,
    scope: "initial" | "corrective" | "delivery",
    report: string,
    attempt?: number,
  ) => ({
    id,
    agent: "sdd-task-reviewer",
    role: "review",
    scope,
    ...(attempt === undefined ? {} : { attempt }),
    headSha: "a".repeat(40),
    inventory: [],
    report,
    requestedAt: at,
    status: "submitted",
    result: "passed",
    noFindings: true,
    reportSha256: "b".repeat(64),
    submittedAt: at,
    submittedBy: "controller",
  });
  const implementation = (id: string, report: string) => ({
    id,
    role: "implementation",
    action: "correct",
    controller: "controller",
    report,
    requestedAt: at,
    status: "submitted",
    attempt: 1,
    findingIds: [],
    checkFailure: "just test",
    objective: "Resolve the failed check.",
    reportSha256: "c".repeat(64),
    submittedAt: at,
    submittedBy: "controller",
    handoffs: [],
  });
  const attempt = (
    id: string,
    report: string,
    assignmentReport: string,
    reviewScope: "corrective" | "delivery" = "corrective",
  ) => ({
    number: 1,
    findingIds: [],
    checkFailure: "just test",
    objective: "Resolve the failed check.",
    startedAt: at,
    startedBy: "controller",
    assignmentId: id,
    assignment: implementation(id, assignmentReport),
    reviewAssignments: [review(`${id}-review`, reviewScope, report, 1)],
  });

  raw.tickets[0].reviewAssignments = [
    review(
      "ticket-review",
      "initial",
      join(feature.workspace, "reports", "T-0001-review-ticket-review.md"),
    ),
  ];
  raw.tickets[0].reviewHistory = [
    review(
      "ticket-history",
      "initial",
      join(feature.workspace, "reports", "T-0001-review-ticket-history.md"),
    ),
  ];
  raw.tickets[0].correctionAttempts = [
    attempt(
      "ticket-correction",
      join(feature.workspace, "reports", "T-0001-round-1-review-ticket-correction-review.md"),
      join(feature.workspace, "reports", "T-0001-round-1-fix.md"),
    ),
  ];
  raw.delivery.reviewAssignments = [
    review(
      "delivery-review",
      "delivery",
      join(feature.workspace, "reports", "final-review-delivery-review.md"),
    ),
  ];
  raw.delivery.reviewHistory = [
    review(
      "delivery-history",
      "delivery",
      join(feature.workspace, "reports", "final-review-delivery-history.md"),
    ),
  ];
  raw.delivery.correctionAttempts = [
    attempt(
      "delivery-correction",
      join(feature.workspace, "reports", "final-round-1-review-delivery-correction-review.md"),
      join(feature.workspace, "reports", "final-round-1-fix.md"),
      "delivery",
    ),
  ];

  const repository = await app.make(LedgerRepository);
  const ledger = repository.validateLedger(raw, feature.feature);

  const assignments = [
    ...ledger.tickets[0]!.reviewAssignments!,
    ...ledger.tickets[0]!.reviewHistory!,
    ...ledger.tickets[0]!.correctionAttempts![0]!.reviewAssignments!,
    ...ledger.delivery.reviewAssignments!,
    ...ledger.delivery.reviewHistory!,
    ...ledger.delivery.correctionAttempts![0]!.reviewAssignments!,
  ];
  expect(assignments.every((assignment) => assignment.findingIds?.length === 0)).toBe(true);
  expect(assignments.every((assignment) => !Object.hasOwn(assignment, "noFindings"))).toBe(true);
});
