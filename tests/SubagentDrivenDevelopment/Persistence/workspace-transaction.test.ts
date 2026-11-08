import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import { WorkspaceTransaction } from "@/SubagentDrivenDevelopment/Persistence/WorkspaceTransaction";

import { serviceFixture } from "../helpers/helpers";

test("all workflow writes require the transaction-owned lock", async () => {
  const { app, service } = await serviceFixture();
  const feature = service.featureCreationService.create({
    title: "Transaction",
    author: "controller",
  });
  const transaction = await app.make(WorkspaceTransaction);
  expect(() => transaction.applyWrites(feature.workspace, [])).toThrow(
    "Workflow writes require the workspace transaction lock.",
  );
  expect(existsSync(join(feature.workspace, ".sdd-write-recovery.json"))).toBe(false);
});

test("transaction failures release ownership without changing the ledger", async () => {
  const { app, service } = await serviceFixture();
  const feature = service.featureCreationService.create({
    title: "Transaction",
    author: "controller",
  });
  const transaction = await app.make(WorkspaceTransaction);
  const before = readFileSync(feature.ledger, "utf8");
  const error = new Error("operation failed");
  expect(() =>
    transaction.run(feature.workspace, () => {
      expect(existsSync(join(feature.workspace, ".sdd-issues.lock"))).toBe(true);
      throw error;
    }),
  ).toThrow(error);
  expect(readFileSync(feature.ledger, "utf8")).toBe(before);
  expect(existsSync(join(feature.workspace, ".sdd-issues.lock"))).toBe(false);
  expect(transaction.run(feature.workspace, () => 42)).toBe(42);
});

test("journal recovery finishes before the transaction callback and remains idempotent", async () => {
  const { app, service } = await serviceFixture();
  const feature = service.featureCreationService.create({
    title: "Transaction",
    author: "controller",
  });
  const before = readFileSync(feature.ledger, "utf8");
  const after = before.replace('"Transaction"', '"Recovered"');
  const journal = join(feature.workspace, ".sdd-write-recovery.json");
  writeFileSync(
    journal,
    JSON.stringify({ version: 1, writes: [{ path: "sdd.json", before, after }] }),
  );
  const transaction = await app.make(WorkspaceTransaction);
  transaction.run(feature.workspace, () => {
    expect(readFileSync(feature.ledger, "utf8")).toBe(after);
    expect(existsSync(journal)).toBe(false);
  });
  transaction.run(feature.workspace, () =>
    expect(readFileSync(feature.ledger, "utf8")).toBe(after),
  );
});
