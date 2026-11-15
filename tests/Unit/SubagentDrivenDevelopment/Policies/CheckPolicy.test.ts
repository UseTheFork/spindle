import { expect, test } from "vitest";

import type { DeliveryProgress } from "@/SubagentDrivenDevelopment/Models/Workflow";
import { hasOnlyRetryableDeliveryCheckIssue } from "@/SubagentDrivenDevelopment/Policies/CheckPolicy";

test("legacy unavailable checks do not hide an earlier unresolved failure", () => {
  const delivery: DeliveryProgress = {
    execution: "changes-requested",
    history: [
      { at: "2026-01-01", author: "controller", action: "delivery-check-recorded:check:failed" },
      {
        at: "2026-01-02",
        author: "controller",
        action: "delivery-check-recorded:check:unavailable",
      },
    ],
    checks: {
      required: [],
      records: [
        {
          command: "check",
          result: "failed",
          author: "controller",
          headSha: "old",
          recordedAt: "2026-01-01",
        },
        {
          command: "check",
          result: "unavailable",
          author: "controller",
          headSha: "current",
          recordedAt: "2026-01-02",
        },
      ],
    },
  };

  expect(hasOnlyRetryableDeliveryCheckIssue(delivery, "current")).toBe(false);
  delivery.history.splice(1, 0, {
    at: "2026-01-01",
    author: "controller",
    action: "correction-report-submitted:assignment",
  });
  expect(hasOnlyRetryableDeliveryCheckIssue(delivery, "current")).toBe(true);
});
