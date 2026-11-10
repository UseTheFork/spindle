import { readFileSync } from "node:fs";

import { expect, test } from "vitest";

import { LedgerRepository } from "@/SubagentDrivenDevelopment/Persistence/LedgerRepository";

import { serviceFixture } from "../helpers/helpers";

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
