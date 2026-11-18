import { z } from "zod";

export const taskIdSchema = z.string().regex(/^T-\d{4,}\.[1-9]\d*$/);

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
    "Write scope must contain repository-relative file paths, not directories or patterns.",
  );

export const taskSchema = z
  .strictObject({
    id: taskIdSchema,
    instructions: z.string().min(1),
    writeScope: z.array(writePathSchema).min(1),
    context: z.array(z.string()).optional(),
    dependencies: z.array(taskIdSchema),
    discoveredFrom: z.string().min(1).optional(),
    state: z.enum(["Pending", "InProgress", "Done"]),
    attempt: z.number().int().nonnegative(),
  })
  .refine((task) => (task.state === "Pending" ? task.attempt === 0 : task.attempt > 0), {
    path: ["attempt"],
    message: "Pending tasks have no dispatch attempt; started tasks have at least one.",
  });

export type Task = z.output<typeof taskSchema>;
