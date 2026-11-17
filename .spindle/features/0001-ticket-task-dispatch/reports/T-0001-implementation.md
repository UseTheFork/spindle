# T-0001 implementation

Status: DONE_WITH_CONCERNS

Checkout: `/home/nixos/.copilot/session-state/7ea7f718-aea2-497a-bdb3-c9bd27b0cb67/files/0001-ticket-task-dispatch-T-0001`

Committed task definition CLI, service, schema, and tests in two commits. No tracked or untracked changes remain in the ticket checkout. Vitest created ignored `node_modules/.vitest-cache/`, `node_modules/.vite/`, and `node_modules/.vite-temp/` in the worktree; they remain in place. No workflow records were modified.

## Criteria and evidence

- Creation persists definitions and returns ticket-local IDs; sequential and independent-ticket IDs, unassigned status, and unchanged ticket Markdown are covered by `Tasks.test.ts`.
- Updates replace only requested fields, including clearing lists; direct-service and CLI tests verify persisted values and preservation of other fields.
- Required fields, explicit relative paths, missing dependencies, cycles, and duplicate IDs are validated before the ledger write. Tests cover invalid creation and updates, unchanged ledger bytes, malformed persisted records, and cross-ticket dependency rejection.
- The task field is additive and optional on schema-version-3 tickets at this intermediate stage; no active ledger was migrated. Existing ledger validation tests pass. T-0004 owns the final schema and one-time conversion.

## Fresh checks

Working directory: the ticket checkout above.

- `../node_modules/.bin/vitest run tests/Integration/SubagentDrivenDevelopment/Services/Tasks.test.ts tests/Integration/SubagentDrivenDevelopment/Persistence/LedgerRepository.test.ts` — passed on the final commit: 2 files, 7 tests.
- An intervening invocation misspelled `SubagentDrivenDevelopment` as `SubagentDrivenivenDevelopment`; Vitest silently ran only the ledger file (3 passed). It did not establish task-test coverage and was superseded by the correctly selected run above.
- Earlier focused run before the path-validation follow-up also passed 2 files and 7 tests.

Configured `oxfmt` was run directly from the parent installation on all changed implementation and test files before the first commit and on the two follow-up files before the second commit. No build was run. Lint, type checks, and broader ticket/feature regression checks remain controller-owned and were not run.

## Changed files

- `src/SubagentDrivenDevelopment/Commands/{SddCommandGroups,TaskCommandFields,TaskCreateCommand,TaskUpdateCommand}.ts`
- `src/SubagentDrivenDevelopment/Models/{Options,Tasks,Workflow}.ts`
- `src/SubagentDrivenDevelopment/Persistence/{LedgerRepository,TaskSchema}.ts`
- `src/SubagentDrivenDevelopment/Services/TaskService.ts`
- `src/SubagentDrivenDevelopment/SubagentDrivenDevelopmentServiceProvider.ts`
- `tests/Integration/SubagentDrivenDevelopment/Services/Tasks.test.ts`

## Self-review and hand-back

Self-review found extended glob patterns were initially accepted; the follow-up commit rejects them and adds test cases. The task update service currently permits definition changes regardless of status because lifecycle and reservations are outside this ticket. Before dependent tickets enable active task states, their integration must enforce safe update rules so reservations and accepted-dependency invariants cannot be bypassed. The intermediate schema-3 additive field is deliberately not the final schema rollout; T-0004 must make the specified one-time conversion without breaking this feature's active ledger. Controller should review these seams and run its pending checks.
