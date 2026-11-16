import { expect, test } from "vitest";

import { WorkflowPolicy } from "@spindle/SubagentDrivenDevelopment/Policies/WorkflowPolicy";

test("ticket ownership errors identify both actors and a safe handoff command", () => {
  expect(() =>
    WorkflowPolicy.assertTicketOwner("controller", " replacement ", "0001-example", "T-0001"),
  ).toThrow(
    "Ticket T-0001 is owned by controller, but this command used --actor replacement. If you are controller, rerun with that value. To take over after the previous controller has stopped editing, run: pnpm spindle sdd resume --ticket T-0001 --feature .spindle/features/0001-example --actor <acting-agent> --confirm-handoff",
  );
  expect(() =>
    WorkflowPolicy.assertTicketOwner("controller", " controller ", "0001-example", "T-0001"),
  ).not.toThrow();
  expect(() =>
    WorkflowPolicy.assertTicketOwner(undefined, "controller", "0001-example", "T-0001"),
  ).toThrow(
    "Ticket T-0001 has no recorded owner. Follow the next workflow step: pnpm spindle sdd next --feature .spindle/features/0001-example",
  );
});

test("delivery ownership errors identify both actors and a safe handoff command", () => {
  expect(() =>
    WorkflowPolicy.assertDeliveryOwner("controller", "replacement", "0001-example"),
  ).toThrow(
    "Delivery is owned by controller, but this command used --actor replacement. If you are controller, rerun with that value. To take over after the previous controller has stopped editing, run: pnpm spindle sdd resume --scope delivery --feature .spindle/features/0001-example --actor <acting-agent> --confirm-handoff",
  );
  expect(() =>
    WorkflowPolicy.assertDeliveryOwner("controller", " controller ", "0001-example"),
  ).not.toThrow();
  expect(() => WorkflowPolicy.assertDeliveryOwner(undefined, "controller", "0001-example")).toThrow(
    "Delivery has no owner. Claim delivery first: pnpm spindle sdd claim --scope delivery --feature .spindle/features/0001-example --actor <acting-agent>",
  );
});

test("finalization ownership does not offer a handoff for a frozen journal", () => {
  expect(() =>
    WorkflowPolicy.assertFinalizationOwner("controller", "replacement", "0001-example"),
  ).toThrow(
    "Finalization of 0001-example is owned by controller, but this command used --actor replacement. The finalization journal cannot be handed off; ask controller to retry with their --actor value.",
  );
  expect(() =>
    WorkflowPolicy.assertFinalizationOwner("controller", " controller ", "0001-example"),
  ).not.toThrow();
});
