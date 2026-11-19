import { reviewSchema } from "@spindle/SubagentDrivenDevelopment/Models/Review";
import { ticketIdSchema } from "@spindle/SubagentDrivenDevelopment/Models/Ticket";
import { z } from "zod";

export const reviewRoundSchema = z.strictObject({
  target: z.discriminatedUnion("type", [
    z.strictObject({ type: z.literal("ticket"), ticketId: ticketIdSchema }),
    z.strictObject({ type: z.literal("feature") }),
  ]),
  codeRevision: z.string().min(1),
  reviews: z.array(reviewSchema).min(1),
});

export type ReviewRound = z.output<typeof reviewRoundSchema>;
