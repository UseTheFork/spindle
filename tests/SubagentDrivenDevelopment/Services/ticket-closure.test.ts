import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import { createTicket, ticketFixture } from "../helpers/ticket-helpers";

test("manual ticket closure cannot bypass post-merge validation", async () => {
  const { service, feature } = await ticketFixture("Automatic Closure");
  const { ticket } = createTicket(service, feature.spec, "Validate before closing");
  const ledger = join(feature.workspace, "sdd.json");
  const before = readFileSync(ledger, "utf8");

  expect(() =>
    service.ticketService.ticketUpdate({
      spec: feature.spec,
      ticket,
      status: "closed",
      author: "controller",
    }),
  ).toThrow(/automatically after passing post-merge checks/);
  expect(readFileSync(ledger, "utf8")).toBe(before);
});
