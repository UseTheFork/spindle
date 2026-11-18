import { reviewSchema } from "@spindle/SubagentDrivenDevelopment/Models/Review";
import { expect, test } from "vitest";

test("requires review recommendations and findings to agree", () => {
  const review = {
    id: "review-1",
    targetWorktree: "/worktree",
    scope: "Ticket diff",
    findingsToVerify: [],
  };
  expect(
    reviewSchema.safeParse({
      ...review,
      result: { recommendation: "pass", findingIds: ["finding-1"] },
    }).success,
  ).toBe(false);
  expect(
    reviewSchema.safeParse({
      ...review,
      result: { recommendation: "changes-required", findingIds: [] },
    }).success,
  ).toBe(false);
  expect(
    reviewSchema.safeParse({
      ...review,
      result: { recommendation: "changes-required", findingIds: ["finding-1"] },
    }).success,
  ).toBe(true);
});
