import { findingSchema } from "@spindle/SubagentDrivenDevelopment/Models/Finding";
import { finishJournalSchema } from "@spindle/SubagentDrivenDevelopment/Models/FinishJournal";
import { reviewRoundSchema } from "@spindle/SubagentDrivenDevelopment/Models/ReviewRound";
import { startJournalSchema } from "@spindle/SubagentDrivenDevelopment/Models/StartJournal";
import { ticketSchema } from "@spindle/SubagentDrivenDevelopment/Models/Ticket";
import { ticketCommitJournalSchema } from "@spindle/SubagentDrivenDevelopment/Models/TicketCommitJournal";
import { ticketIntegrationJournalSchema } from "@spindle/SubagentDrivenDevelopment/Models/TicketIntegrationJournal";
import { z } from "zod";

export const featureSchema = z.strictObject({
  name: z.string().min(1),
  specification: z.string().min(1),
  design: z.string().optional(),
  originalBranch: z.string().min(1).optional(),
  featureBranch: z.string().min(1).optional(),
  featureWorktree: z.string().min(1).optional(),
  completed: z.literal(true).optional(),
  pendingStart: startJournalSchema.optional(),
  pendingTicketCommit: ticketCommitJournalSchema.optional(),
  pendingIntegration: ticketIntegrationJournalSchema.optional(),
  pendingFinish: finishJournalSchema.optional(),
  tickets: z.array(ticketSchema),
  findings: z.array(findingSchema),
  reviewRounds: z.array(reviewRoundSchema),
});

export type Feature = z.output<typeof featureSchema>;
