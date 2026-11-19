import { taskIdSchema } from "@spindle/SubagentDrivenDevelopment/Models/Task";
import { ticketIdSchema } from "@spindle/SubagentDrivenDevelopment/Models/Ticket";
import { z } from "zod";

const objectId = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/);

export const ticketCommitJournalSchema = z.strictObject({
  ticketId: ticketIdSchema,
  branch: z.string().min(1),
  worktree: z.string().min(1),
  base: objectId,
  commit: objectId,
  taskIds: z.array(taskIdSchema).min(1),
  message: z.string().min(1),
});

export type TicketCommitJournal = z.output<typeof ticketCommitJournalSchema>;
