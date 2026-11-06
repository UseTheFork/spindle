# Ticket 01 corrective round 1 re-review inputs

## Requirements and assignment

- Canonical ticket and history: `/home/sincore/source/spindle/.scratch/2026-11-06-commander-cli/issues/01-commander-update.md`
- Canonical spec: `/home/sincore/source/spindle/.scratch/2026-11-06-commander-cli/spec.md`
- Corrective context: `/home/sincore/source/spindle/.scratch/2026-11-06-commander-cli/reports/01-round-1-context.md`
- Required review workflow: `/home/sincore/source/spindle/.github/skills/int-subagent-driven-dev/references/review-inputs.md`
- Re-review finding: `TASK-01-001 — Parse update arguments before Git-root discovery`, copied verbatim in corrective context and prior Spec/Quality report.
- Round: 1 of 5; initial reviews are complete. Initial code review PASS and code-slop review found no issues; initial Spec/Quality FAIL was only for `TASK-01-001` and requested direct service evidence.
- Implementer report with appended round 1 evidence: `/home/sincore/source/spindle/.scratch/2026-11-06-commander-cli/reports/01-implementation.md`
- Prior Spec/Quality report: `/home/sincore/source/spindle/.scratch/2026-11-06-commander-cli/reports/01-task-review.md`
- Prior code review report: `/home/sincore/source/spindle/.scratch/2026-11-06-commander-cli/reports/01-code-review.md`
- Prior code-slop report: `/home/sincore/source/spindle/.scratch/2026-11-06-commander-cli/reports/01-code-slop-review.md`

## Checkout and snapshot

- Checkout: `/home/sincore/source/spindle`
- Base and HEAD: `3b684dfa306a6e670c9739926a5a5a462fd99a1e`.
- Current frozen identity is HEAD plus the uncommitted Ticket 01 implementation and round 1 correction.
- Complete implementation inventory: `src/commands/shared-options.ts` (untracked), `src/commands/update/update-command.ts`, `src/cli.ts`, `src/index.ts`, `tests/update.test.ts`.
- Fix-only diff from the previously reviewed snapshot: `src/index.ts` and `tests/update.test.ts`, as shown by `git diff -- src/index.ts tests/update.test.ts`.
- Controller-owned tracker updates and `.scratch` review/report files are not part of the code fix.
- No implementation changes are allowed while this scoped review is in progress.

## Current evidence for this snapshot

Controller-run:

- `just test::test tests/update.test.ts tests/init.test.ts tests/sdd-workspace.test.ts tests/setup-project.test.ts tests/computed-variables.test.ts` — passed, 67 tests, 0 failures. This includes the existing Commander-independent direct `UpdateCommand.run` tests in `computed-variables.test.ts`.
- `just format::check src/index.ts tests/update.test.ts src/commands/update/update-command.ts src/commands/shared-options.ts src/cli.ts` — passed.
- `just lint::check src/index.ts tests/update.test.ts src/commands/update/update-command.ts src/commands/shared-options.ts src/cli.ts` — passed.
- `just test::types` — passed.
- `just tool::git diff --check` — passed.

Implementer test-first evidence is appended in the implementation report: the outside-Git malformed invocation test failed before the fix with Git-root discovery output, then passed after the fix; valid update still fails outside Git as required. Focused `tests/update.test.ts` finished 33/33 on the corrected snapshot.
