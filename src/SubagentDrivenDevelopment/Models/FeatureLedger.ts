import { featureSchema } from "@spindle/SubagentDrivenDevelopment/Models/Feature";
import { ticketSchema } from "@spindle/SubagentDrivenDevelopment/Models/Ticket";
import { z } from "zod";

export const featureLedgerSchema = featureSchema
  .omit({ name: true, specification: true, design: true })
  .extend({
    version: z.literal(1),
    lastMergeOperationNumber: z
      .string()
      .regex(/^[1-9]\d*$/)
      .optional(),
    tickets: z.array(ticketSchema.omit({ requirements: true, acceptanceCriteria: true })),
  });

export type FeatureLedger = z.output<typeof featureLedgerSchema>;
