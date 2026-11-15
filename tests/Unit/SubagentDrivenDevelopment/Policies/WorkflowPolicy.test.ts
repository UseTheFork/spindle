import { expect, test } from "vitest";

import {
  assertDeliveryOwner,
  assertFinalizationOwner,
  assertTicketOwner,
} from "@/SubagentDrivenDevelopment/Policies/WorkflowPolicy";

test("ticket ownership errors identify both actors and a safe handoff command", () => {
  expect(() => assertTicketOwner("controller", " replacement ", "0001-example", "T-0001")).toThrow(
    "Ticket T-0001 is owned by controller, but this command used --actor replacement. If you are controller, rerun with that value. To take over after the previous controller has stopped editing, run: pnpm spindle sdd resume --ticket T-0001 --feature .scratch/0001-example --actor <acting-agent> --confirm-handoff",
  );
  expect(() =>
    assertTicketOwner("controller", " controller ", "0001-example", "T-0001"),
  ).not.toThrow();
  expect(() => assertTicketOwner(undefined, "controller", "0001-example", "T-0001")).toThrow(
    "Ticket T-0001 has no recorded owner. Follow the next workflow step: pnpm spindle sdd next --feature .scratch/0001-example",
  );
});

test("delivery ownership errors identify both actors and a safe handoff command", () => {
  expect(() => assertDeliveryOwner("controller", "replacement", "0001-example")).toThrow(
    "Delivery is owned by controller, but this command used --actor replacement. If you are controller, rerun with that value. To take over after the previous controller has stopped editing, run: pnpm spindle sdd resume --scope delivery --feature .scratch/0001-example --actor <acting-agent> --confirm-handoff",
  );
  expect(() => assertDeliveryOwner("controller", " controller ", "0001-example")).not.toThrow();
  expect(() => assertDeliveryOwner(undefined, "controller", "0001-example")).toThrow(
    "Delivery has no owner. Claim delivery first: pnpm spindle sdd claim --scope delivery --feature .scratch/0001-example --actor <acting-agent>",
  );
});

test("finalization ownership does not offer a handoff for a frozen journal", () => {
  expect(() => assertFinalizationOwner("controller", "replacement", "0001-example")).toThrow(
    "Finalization of 0001-example is owned by controller, but this command used --actor replacement. The finalization journal cannot be handed off; ask controller to retry with their --actor value.",
  );
  expect(() => assertFinalizationOwner("controller", " controller ", "0001-example")).not.toThrow();
});
