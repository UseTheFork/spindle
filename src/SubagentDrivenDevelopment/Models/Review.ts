import { z } from "zod";

export const reviewSchema = z.strictObject({
  id: z.string().min(1),
  targetWorktree: z.string().min(1),
  scope: z.string().min(1),
  focus: z.string().min(1).optional(),
  findingsToVerify: z.array(z.string().min(1)),
  result: z
    .discriminatedUnion("recommendation", [
      z.strictObject({
        recommendation: z.literal("pass"),
        findingIds: z.array(z.string().min(1)).length(0),
      }),
      z.strictObject({
        recommendation: z.literal("changes-required"),
        findingIds: z.array(z.string().min(1)).min(1),
      }),
    ])
    .optional(),
});

export type Review = z.output<typeof reviewSchema>;
