import { featureSchema } from "@spindle/SubagentDrivenDevelopment/Models/Feature";
import { expect, test } from "vitest";

test("accepts a feature before start with a ticket and pending task", () => {
  expect(
    featureSchema.safeParse({
      name: "0001-example",
      specification: "Feature requirements",
      tickets: [
        {
          id: "T-0002",
          title: "Schema",
          requirements: "Add the schema.",
          acceptanceCriteria: "The schema validates.",
          dependencies: [],
          tasks: [
            {
              id: "T-0002.1",
              instructions: "Implement the schema and satisfy its criteria.",
              writeScope: ["src/Models/Schema.ts"],
              dependencies: [],
              state: "Pending",
              attempt: 0,
            },
          ],
          workRoundCommits: [],
          merged: false,
        },
      ],
      findings: [],
      reviewRounds: [],
    }).success,
  ).toBe(true);
});
