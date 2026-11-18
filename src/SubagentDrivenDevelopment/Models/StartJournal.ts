import { ticketIdSchema } from "@spindle/SubagentDrivenDevelopment/Models/Ticket";
import { z } from "zod";

const destination = {
  branch: z.string().min(1),
  worktree: z.string().min(1),
  commit: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/),
};

export const startJournalSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...destination, kind: z.literal("feature"), originalBranch: z.string().min(1) }),
  z.strictObject({ ...destination, kind: z.literal("ticket"), ticketId: ticketIdSchema }),
]);

export type StartJournal = z.output<typeof startJournalSchema>;
