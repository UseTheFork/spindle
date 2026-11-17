# T-0001 correction, round 1

Status: DONE_WITH_CONCERNS

Checkout: `/home/nixos/.copilot/session-state/7ea7f718-aea2-497a-bdb3-c9bd27b0cb67/files/0001-ticket-task-dispatch-T-0001`

Committed the registration-test correction and the lint correction in two commits, each with the requested co-author trailer. The ticket checkout has no remaining tracked or untracked changes. Ignored `node_modules/` remains; `pnpm exec` populated local dependencies from the existing store during formatting.

## Correction evidence

Controller-supplied failure: the declared check stopped at `Provider.test.ts`, which expected 24 commands instead of the 26 registered. The controller reported 50 passing files, one failing file, 262 passing tests and one failing test; type checks and lint did not run.

The correction expects 26 distinct command constructors, explicitly includes both task commands, checks every command's singleton binding, and verifies the `task create` and `task update` schema group.

My first fresh check on the registration correction ran 51 files and 263 tests successfully; both type checks passed, then lint failed on the intentional control-character regex in `TaskSchema.ts`. The follow-up narrowly suppresses that lint rule on the expression, retaining the validation. Tests now exercise control-character rejection across edit, create, and reference paths without ledger writes, and acceptance of interior spaces and non-ASCII characters.

## Criteria and tests

- Task creation, ticket-local IDs, and field-only updates: `Services/Tasks.test.ts` exercises persisted definitions, distinct IDs, separate ticket IDs, and update preservation.
- Invalid required fields, explicit path validation, missing dependencies and cycles: the same test exercises rejection and unchanged ledger content, including the added control-character cases.
- Registration: `Commands/Provider.test.ts` covers task command declarations, uniqueness, singleton binding and schema registration.
- These tests ran as part of the complete SDD integration selection below; passing tests do not constitute ticket acceptance.

## Fresh check on the final commit

Working directory: the ticket checkout above.

```sh
../node_modules/.bin/vitest run tests/Integration/SubagentDrivenDevelopment && ../node_modules/.bin/tsc --noEmit && ../node_modules/.bin/tsc --noEmit -p tests/tsconfig.sdd.json && ../node_modules/.bin/oxlint src/SubagentDrivenDevelopment tests/Integration/SubagentDrivenDevelopment
```

Exit 0. Vitest: 51 files and 264 tests passed. Both type checks and SDD lint completed successfully. The suite printed unknown-option errors from negative CLI cases; the associated tests passed.

Formatting before the first commit: `pnpm exec oxfmt tests/Integration/SubagentDrivenDevelopment/Commands/Provider.test.ts`. Before the second commit: `../node_modules/.bin/oxfmt src/SubagentDrivenDevelopment/Persistence/TaskSchema.ts tests/Integration/SubagentDrivenDevelopment/Services/Tasks.test.ts`. Both completed successfully. `git diff --check` passed during self-review.

## Changed files

- `tests/Integration/SubagentDrivenDevelopment/Commands/Provider.test.ts`
- `src/SubagentDrivenDevelopment/Persistence/TaskSchema.ts`
- `tests/Integration/SubagentDrivenDevelopment/Services/Tasks.test.ts`

## Self-review and hand-back

No additional defects found in this correction. The initial report's concerns remain: dependent work must protect active-task definition changes and reservations, and T-0004 owns the final schema rollout and one-time ledger conversion. This correction did not change those seams.

The assigned SDD lint and type checks were run successfully. The build, unrelated type/lint selections, broader repository and feature regression checks, review, and acceptance were not run and remain with the controller as applicable. No workflow records were modified.
