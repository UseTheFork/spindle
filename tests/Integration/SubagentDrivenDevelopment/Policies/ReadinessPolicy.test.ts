import { readFileSync, writeFileSync } from "node:fs";

import { expect, test } from "vitest";

import { serviceFixture } from "../../../Helpers/SubagentDrivenDevelopment/helpers";

test("readiness rejects Markdown tickets without matching ledger records", async () => {
  const { service } = await serviceFixture();
  const feature = service.featureCreationService.create({
    title: "Readiness",
    author: "controller",
  });
  service.ticketService.ticketCreate({
    spec: feature.spec,
    title: "Work",
    reporter: "requester",
    category: "enhancement",
    author: "controller",
  });
  const ledger = JSON.parse(readFileSync(feature.ledger, "utf8"));
  ledger.tickets = [];
  writeFileSync(feature.ledger, `${JSON.stringify(ledger, null, 2)}\n`);
  expect(() => service.readinessService.ready({ spec: feature.spec })).toThrow(
    "Ticket T-0001 has no ledger record.",
  );
});
