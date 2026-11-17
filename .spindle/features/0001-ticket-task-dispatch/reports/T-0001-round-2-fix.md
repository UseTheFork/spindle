# T-0001 correction, round 2

Status: DONE

Checkout: `/home/nixos/.copilot/session-state/7ea7f718-aea2-497a-bdb3-c9bd27b0cb67/files/0001-ticket-task-dispatch-T-0001`

Committed the F-0001 retry-recovery correction. The assigned worktree has no uncommitted tracked or untracked changes. Ignored tooling artifacts were not inspected.

## Finding correction and evidence

F-0001 was confirmed: recovery could replay a pending create into the ledger, after which retry allocated another ID and duplicated the task.

`TaskService.create` now checks the transaction's recovered writes before allocating an ID. It compares the pre-recovery ledger with the recovered ledger and returns the matching, newly created unassigned task only when its definition matches the retry options. New independent creates still allocate distinct IDs.

The regression simulates interruption after writing the recovery journal and before ledger replay. It verifies the first call is interrupted, retry returns the original task ID, the ledger has exactly one task, and recovery is cleared. The existing test continues to verify a second independent create gets a distinct ID.

## Changed files

- `src/SubagentDrivenDevelopment/Services/TaskService.ts`
- `tests/Integration/SubagentDrivenDevelopment/Services/Tasks.test.ts`

Self-review found no additional in-scope issues. Recovery matching requires an ID absent from the pre-recovery ticket and checks the task's title, instructions, criteria, paths, dependencies, and unassigned status.

## Fresh checks

Working directory: the checkout above.

After committing, I ran:

```sh
../node_modules/.bin/vitest run tests/Integration/SubagentDrivenDevelopment/Services/Tasks.test.ts tests/Integration/SubagentDrivenDevelopment/Persistence/LedgerRepository.test.ts
```

Passed: 2 files, 9 tests. This run covers the interrupted/recovered retry, separate creates with distinct IDs, task-definition behavior, and ledger validation on the committed changes.

`git diff --check` passed during self-review. Before committing, the configured formatter completed successfully:

```sh
../node_modules/.bin/oxfmt src/SubagentDrivenDevelopment/Services/TaskService.ts tests/Integration/SubagentDrivenDevelopment/Services/Tasks.test.ts
```

Lint, type checks, build, and broader ticket/feature regression checks were not run. The controller owns those broader checks; they remain pending and are not implementer failures or evidence of ticket acceptance.

## Hand-back

F-0001 is corrected, the recovery regression and distinct-ID coverage pass on the committed changes, and no workflow records were modified. Controller review and broader checks remain pending.
