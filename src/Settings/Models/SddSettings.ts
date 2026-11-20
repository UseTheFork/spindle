import { z } from "zod";

export const sddSettingsSchema = z.strictObject({
  worktree_directory: z
    .string()
    .refine((value) => value.trim() !== "" && !value.includes("\0"))
    .describe("Parent directory for SDD worktrees, outside the original checkout."),
  setup_command: z
    .array(z.string().refine((value) => value.trim() !== ""))
    .default([])
    .describe(
      "Ordered commands for each new ticket worktree; prefix plain-language instructions with Instruction:.",
    ),
});
