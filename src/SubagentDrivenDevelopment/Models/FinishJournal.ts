import { z } from "zod";

const commitId = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/);

export const finishJournalSchema = z.strictObject({
  originalBranch: z.string().min(1),
  featureBranch: z.string().min(1),
  featureWorktree: z.string().min(1),
  featureWorkspace: z.string().min(1),
  originalCommit: commitId,
  featureCommit: commitId,
  phase: z.enum(["prepared", "fast-forwarded"]),
});

export type FinishJournal = z.output<typeof finishJournalSchema>;
