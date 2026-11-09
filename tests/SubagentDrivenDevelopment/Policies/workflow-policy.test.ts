import { expect, test } from "vitest";

import { LedgerRepository } from "@/SubagentDrivenDevelopment/Persistence/LedgerRepository";
import { WorkflowPolicy } from "@/SubagentDrivenDevelopment/Policies/WorkflowPolicy";

import { serviceFixture } from "../helpers/helpers";

test("workflow gates preserve ticket selection errors and closed-delivery behavior", async () => {
  const { app, service } = await serviceFixture();
  const feature = service.featureCreationService.create({
    title: "Policies",
    author: "controller",
  });

  const ledger = (await app.make(LedgerRepository)).readLedger(feature);
  const policy = await app.make(WorkflowPolicy);
  expect(() => policy.requireProgress(ledger, "T-0001")).toThrow(
    "Ticket T-0001 has no ledger execution record.",
  );
  ledger.delivery.finished = { at: new Date().toISOString(), author: "controller" };
  expect(() => policy.assertDeliveryOpen(ledger.delivery)).toThrow(
    "Delivery is finished; final checks cannot be changed.",
  );
});
