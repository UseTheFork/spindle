import { readFileSync } from "node:fs";

import { expect, test } from "vitest";

import { LedgerRepository } from "@/SubagentDrivenDevelopment/Persistence/LedgerRepository";

import { serviceFixture } from "../../../Helpers/SubagentDrivenDevelopment/helpers";

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
    repository.validateLedger({ ...ledger, featureId: "0002" }, feature.feature),
  ).toThrow("Feature ledger ID does not match its workspace directory.");
});

test("legacy finding severity is removed when reading workflow records", async () => {
  const { app, service } = await serviceFixture();
  const feature = service.featureCreationService.create({ title: "Legacy finding", author: "controller" });
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
