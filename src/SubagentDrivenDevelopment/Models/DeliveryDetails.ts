import { z } from "zod";

export const deliveryDetailsSchema = z.strictObject({
  originalBranch: z.string().min(1),
  baseCommit: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/),
  sourceCommit: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/),
});

export type DeliveryDetails = z.output<typeof deliveryDetailsSchema>;
