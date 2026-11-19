import { ticketIdSchema } from "@spindle/SubagentDrivenDevelopment/Models/Ticket";
import { z } from "zod";

const objectId = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/);

export const ticketIntegrationJournalSchema = z
  .strictObject({
    ticketId: ticketIdSchema,
    featureBranch: z.string().min(1),
    featureWorktree: z.string().min(1),
    ticketBranch: z.string().min(1),
    ticketWorktree: z.string().min(1),
    featureCommit: objectId,
    ticketCommit: objectId,
    phase: z.enum(["merging", "merged"]),
    mergeCommit: objectId.optional(),
  })
  .refine((journal) => (journal.phase === "merged") === (journal.mergeCommit !== undefined), {
    path: ["mergeCommit"],
    message: "Only a completed merge has a merge commit.",
  });

export type TicketIntegrationJournal = z.output<typeof ticketIntegrationJournalSchema>;
