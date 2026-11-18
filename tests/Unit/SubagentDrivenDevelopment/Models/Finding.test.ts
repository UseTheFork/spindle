import { findingSchema } from "@spindle/SubagentDrivenDevelopment/Models/Finding";
import { expect, test } from "vitest";

test("requires a reason to dismiss a review finding and disallows dismissing conflicts", () => {
  const reviewFinding = {
    id: "finding-1",
    type: "review",
    reviewId: "review-1",
    title: "Missing behavior",
    severity: "high",
    location: "src/Models/Schema.ts",
    criterion: "Schema validates",
    evidence: "Validation fails",
    suggestedFix: "Add validation",
  };
  expect(
    findingSchema.safeParse({ ...reviewFinding, decision: { status: "dismissed" } }).success,
  ).toBe(false);
  expect(
    findingSchema.safeParse({
      ...reviewFinding,
      decision: { status: "dismissed", reason: "Criterion does not apply." },
    }).success,
  ).toBe(true);
  expect(
    findingSchema.safeParse({
      id: "finding-2",
      type: "conflict",
      title: "Merge conflict",
      ticketId: "T-0002",
      conflictedPaths: ["src/Models/Schema.ts"],
      decision: "dismissed",
    }).success,
  ).toBe(false);
});
