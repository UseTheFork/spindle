import { taskIdSchema } from "@spindle/SubagentDrivenDevelopment/Models/Task";
import { ticketIdSchema } from "@spindle/SubagentDrivenDevelopment/Models/Ticket";
import { z } from "zod";

const fixWorkSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("task"), taskId: taskIdSchema }),
  z.strictObject({ type: z.literal("ticket"), ticketId: ticketIdSchema }),
]);

const findingFields = {
  id: z.string().min(1),
  title: z.string().min(1),
  fixWork: fixWorkSchema.optional(),
};

export const findingSchema = z.discriminatedUnion("type", [
  z.strictObject({
    ...findingFields,
    type: z.literal("review"),
    reviewId: z.string().min(1),
    severity: z.string().min(1),
    location: z.string().min(1),
    criterion: z.string().min(1),
    evidence: z.string().min(1),
    suggestedFix: z.string().min(1),
    decision: z.discriminatedUnion("status", [
      z.strictObject({ status: z.literal("open") }),
      z.strictObject({ status: z.literal("resolved") }),
      z.strictObject({ status: z.literal("dismissed"), reason: z.string().min(1) }),
    ]),
  }),
  z.strictObject({
    ...findingFields,
    type: z.literal("conflict"),
    ticketId: ticketIdSchema,
    conflictedPaths: z.array(z.string().min(1)).min(1),
    decision: z.enum(["open", "resolved"]),
  }),
]);

export type Finding = z.output<typeof findingSchema>;
