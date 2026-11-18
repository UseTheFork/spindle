import { z } from "zod";

export const sddSettingsSchema = z.strictObject({
  worktree_directory: z.string().refine((value) => value.trim() !== "" && !value.includes("\0")),
  setup_command: z.array(z.string().refine((value) => value.trim() !== "")).default([]),
});
