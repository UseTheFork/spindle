import { readFileSync, writeFileSync } from "node:fs";

import { expect, test } from "vitest";

import { serviceFixture } from "../helpers/helpers";

test("readiness rejects Markdown issues without matching ledger records", async () => {
  const { service } = await serviceFixture();
  const feature = service.featureCreationService.create({
    title: "Readiness",
    author: "controller",
  });
  service.issueService.issueCreate({
    spec: feature.spec,
    title: "Work",
    reporter: "requester",
    category: "enhancement",
    author: "controller",
  });
  const ledger = JSON.parse(readFileSync(feature.ledger, "utf8"));
  ledger.issues = [];
  writeFileSync(feature.ledger, `${JSON.stringify(ledger, null, 2)}\n`);
  expect(() => service.readinessService.ready({ spec: feature.spec })).toThrow(
    "Issue I-0001 has no ledger record.",
  );
});
