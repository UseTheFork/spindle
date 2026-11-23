import { z } from "zod";

export const taskIdSchema = z.string().regex(/^T-\d{4,}\.[1-9]\d*$/);
const commitIdSchema = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/);

const writePathSchema = z
  .string()
  .min(1)
  .refine(
    (path) =>
      !path.startsWith("/") &&
      !path.includes("\\") &&
      !path.includes("\0") &&
      !/^[a-zA-Z]:/.test(path) &&
      !/[?*[\]{}]/.test(path) &&
      path.split("/").every((part) => part !== "" && part !== "." && part !== ".."),
    "Expected repository-relative file paths, not directories or patterns.",
  );

export const taskCheckpointSchema = z.strictObject({
  attempt: z.number().int().positive(),
  recordedAt: z.iso.datetime(),
  phase: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  next: z.string().trim().min(1),
  blocker: z.string().trim().min(1).optional(),
  filesChanged: z.array(writePathSchema).optional(),
});

export type TaskCheckpoint = z.output<typeof taskCheckpointSchema>;
export type TaskCheckpointInput = Omit<TaskCheckpoint, "attempt" | "recordedAt">;

export const taskSchema = z
  .strictObject({
    id: taskIdSchema,
    instructions: z.string().min(1),
    writeScope: z.array(writePathSchema),
    context: z.array(z.string()).optional(),
    submissionComment: z.string().trim().min(1).optional(),
    dependencies: z.array(taskIdSchema),
    discoveredFrom: z.string().min(1).optional(),
    deliveryMerge: z
      .strictObject({
        originalBranch: z.string().min(1),
        sourceCommit: commitIdSchema.optional(),
      })
      .optional(),
    state: z.enum(["Pending", "InProgress", "Done"]),
    attempt: z.number().int().nonnegative(),
    checkpoints: z.array(taskCheckpointSchema).optional(),
  })
  .refine((task) => task.deliveryMerge !== undefined || task.writeScope.length > 0, {
    path: ["writeScope"],
    message: "Ordinary tasks must have a non-empty write scope.",
  })
  .refine(
    (task) =>
      task.deliveryMerge === undefined ||
      task.state === "Pending" ||
      task.deliveryMerge.sourceCommit !== undefined,
    {
      path: ["deliveryMerge", "sourceCommit"],
      message: "Dispatched delivery tasks must record their original-branch commit.",
    },
  )
  .refine((task) => (task.state === "Pending" ? task.attempt === 0 : task.attempt > 0), {
    path: ["attempt"],
    message: "Pending tasks have no dispatch attempt; started tasks have at least one.",
  })
  .refine((task) => task.submissionComment === undefined || task.state === "Done", {
    path: ["submissionComment"],
    message: "Submission comments can only be recorded for completed tasks.",
  })
  .refine((task) => task.checkpoints?.every(({ attempt }) => attempt <= task.attempt) ?? true, {
    path: ["checkpoints"],
    message: "Checkpoints must belong to an existing task attempt.",
  });

export type Task = z.output<typeof taskSchema>;
