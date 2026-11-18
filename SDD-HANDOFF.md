# SDD implementation handoff

The user is rebuilding Spindle's subagent-driven development (SDD) workflow one tested CLI slice at a time. [SDD-WORKFLOWS.md](./SDD-WORKFLOWS.md) is the workflow specification; use the [SDD glossary](./src/SubagentDrivenDevelopment/GLOSSARY.md) for domain terms. The latest implementation commit is `a07cc6c` (`feat: add SDD ticket review finding decisions`) on `feat/sdd-tasks-in-ledger`. Ticket integration is the next proposed slice. It has not been started or approved for implementation.

## What is implemented

| Commit | Slice |
| --- | --- |
| `d42db8b`, `af3cb5f` | Separate Zod domain models, work graph validation and readiness, and an SDD service provider. |
| `95f9af3`, `5e8b1bc` | Versioned feature workspace persistence, `sdd create`, read-only `sdd next`, `ticket create`, and `task create`. |
| `ec67b5a`, `2d239a2` | Feature and ticket worktree start with recovery; task dispatch, retries, and read-only worker assignments. |
| `e4517e8`, `8306184` | Ordinary task submission and journaled `ticket commit`. Submission marks the task Done without staging or committing. Ticket commit validates scopes, journals the exact commit, and can recover without creating a duplicate. |
| `42b534e` | Ticket acceptance review: `review --ticket`, `assignment --review`, and `review submit`. Submission records the recommendation and all proposed findings atomically. |
| `a07cc6c` | Ticket review finding decisions: `finding dismiss --reason` and `finding fix`. Fix tasks have explicit write scopes and link back to the finding. Follow-up reviewers receive the linked findings to verify, and the findings remain open until the follow-up round passes. |

## Where to start reading

- [FeatureWorkspaceService.ts](./src/SubagentDrivenDevelopment/Services/FeatureWorkspaceService.ts) assembles the feature from Markdown and the strict, versioned ledger. `withLedgerTransaction` gives mutations a locked read and atomic publication. Existing operations refuse to proceed while a ticket commit is pending, except for its recovery path.
- [TicketReviewService.ts](./src/SubagentDrivenDevelopment/Services/TicketReviewService.ts) derives acceptance for the current committed code. Reuse its acceptance rules for integration rather than inferring acceptance from a single recommendation. All tasks must be committed, all reviews in the applicable round must have results, and no open finding may remain. Tracked code changes invalidate the current review; `.spindle/` changes and untracked test artifacts do not affect the reviewed code revision.
- [TicketCommitService.ts](./src/SubagentDrivenDevelopment/Services/TicketCommitService.ts) is the precedent for journaling a Git mutation before updating a ref and for recovering when Git succeeds but ledger publication fails. [GitService.ts](./src/Git/Services/GitService.ts) has worktree and branch checks.
- [WorkGraphService.ts](./src/SubagentDrivenDevelopment/Services/WorkGraphService.ts) handles dependency, write-scope, and finding blockers. [TaskDispatchService.ts](./src/SubagentDrivenDevelopment/Services/TaskDispatchService.ts) already has conflict-linked merge-agent assignment rules, but merge-task submission is not implemented.
- [SddNextCommand.ts](./src/SubagentDrivenDevelopment/Commands/SddNextCommand.ts) reports readiness, recovery commands, and review or finding status. Register new commands and application-owned services in [SubagentDrivenDevelopmentServiceProvider.ts](./src/SubagentDrivenDevelopment/SubagentDrivenDevelopmentServiceProvider.ts).

Run SDD commands from the original checkout. `--feature` identifies its `.spindle/features/<number>-<slug>/` workspace, not a feature or ticket worktree. Assignments require an absolute feature workspace path. Specs, designs, ticket requirements, and acceptance criteria are Markdown; execution facts live in `sdd.json`. Keep live workflow records out of feature and ticket commits.

## Next proposed slice: ticket integration

Read [Integration](./SDD-WORKFLOWS.md#integration) and [Recovery and safety](./SDD-WORKFLOWS.md#recovery-and-safety) before designing the CLI. Start with a bounded `sdd integrate --ticket` slice:

1. Require that the ticket is Accepted at its current revision. Under the workspace lock, journal the integration before changing Git state. Merge the current feature branch tip into the ticket worktree.
2. On a clean merge, fast-forward the feature branch to the ticket tip. Record the integration and remove the ticket worktree and branch only after confirming the ticket work is merged. A clean integration merge does not require another ticket review.
3. If there is a conflict, do not advance the feature branch or discard the unresolved merge. Record the conflicted paths as a conflict finding, per the workflow. Conflict findings cannot be dismissed. If full conflict handling is split into another slice, decide the safe behavior before shipping a command that can enter this state.
4. Cover clean integration, refusal for an unaccepted or stale ticket, and interruption recovery with real Git tests. Include conflict safety in the test scope if the slice can leave an unresolved merge.

After that, implement conflict-linked fix work and merge-task submission verification, followed by feature review and delivery. Keep those separate unless the user approves a larger slice.

## Validation and working preferences

- Full SDD baseline at `42b534e`: **32 tests passed across 15 files**. Finding decisions at `a07cc6c`: **12 focused tests passed across 5 files**, plus production type checking and lint. The full SDD suite was not rerun after the finding changes.
- Full SDD-only test command:

  ```sh
  pnpm exec vitest run \
    tests/Unit/SubagentDrivenDevelopment/Models/*.test.ts \
    tests/Unit/SubagentDrivenDevelopment/Services/*.test.ts \
    tests/Integration/SubagentDrivenDevelopment/Commands/*.test.ts \
    tests/Integration/SubagentDrivenDevelopment/Services/*.test.ts
  ```

- Use `pnpm exec tsc --noEmit` for production types and `pnpm run lint -- <paths>` for targeted lint. The documented `tests/tsconfig.sdd.json` was absent when checked. A separate legacy Git integration suite previously failed to load because a helper imported the removed `AssignmentService`; that is outside the SDD test run and was not fixed.
- Keep Zod models in separate files, internal types private where possible, and tests beside their corresponding command or service in the test tree. Reuse [ReviewFixture.ts](./tests/Helpers/SubagentDrivenDevelopment/ReviewFixture.ts) or the adjacent fixtures for committed ticket rounds. The user approves implementation and commits separately.
