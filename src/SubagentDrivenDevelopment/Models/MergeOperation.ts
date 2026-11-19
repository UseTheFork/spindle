import { ticketIdSchema } from "@spindle/SubagentDrivenDevelopment/Models/Ticket";
import { z } from "zod";

const mergeOperationFields = {
  id: z.string().uuid(),
  phase: z.enum(["merge", "cleanup"]),
  sourceBranch: z.string().min(1),
  sourceWorktree: z.string().min(1),
  targetBranch: z.string().min(1),
  targetWorktree: z.string().min(1),
};

export const mergeOperationSchema = z.discriminatedUnion("type", [
  z.strictObject({
    ...mergeOperationFields,
    type: z.literal("ticket-integration"),
    ticketId: ticketIdSchema,
  }),
  z.strictObject({
    ...mergeOperationFields,
    type: z.literal("feature-finish"),
  }),
]);

export type MergeOperation = z.output<typeof mergeOperationSchema>;
