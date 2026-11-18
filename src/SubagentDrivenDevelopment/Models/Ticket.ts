import { taskIdSchema, taskSchema } from "@spindle/SubagentDrivenDevelopment/Models/Task";
import { z } from "zod";

export const ticketIdSchema = z.string().regex(/^T-\d{4,}$/);

export const ticketSchema = z.strictObject({
  id: ticketIdSchema,
  title: z.string().min(1),
  requirements: z.string().min(1),
  acceptanceCriteria: z.string().min(1),
  dependencies: z.array(ticketIdSchema),
  tasks: z.array(taskSchema),
  branch: z.string().min(1).optional(),
  worktree: z.string().min(1).optional(),
  workRoundCommits: z.array(z.string().min(1)),
  committedTaskIds: z.array(taskIdSchema).optional(),
  merged: z.boolean(),
});

export type Ticket = z.output<typeof ticketSchema>;
