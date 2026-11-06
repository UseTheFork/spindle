# Ticket 02 corrective round 2 re-review inputs

## Requirements and findings

- Canonical ticket/history: `/home/sincore/source/spindle/.scratch/2026-11-06-commander-cli/issues/02-commander-init.md`
- Full spec: `/home/sincore/source/spindle/.scratch/2026-11-06-commander-cli/spec.md`
- Corrective context: `/home/sincore/source/spindle/.scratch/2026-11-06-commander-cli/reports/02-round-2-context.md`
- Initial code review and updated verdict: `/home/sincore/source/spindle/.scratch/2026-11-06-commander-cli/reports/02-code-review.md`
- Initial code-slop review and updated verdict: `/home/sincore/source/spindle/.scratch/2026-11-06-commander-cli/reports/02-code-slop-review.md`
- Initial Spec/Quality review: `/home/sincore/source/spindle/.scratch/2026-11-06-commander-cli/reports/02-task-review.md`
- Implementation history and round 1/2 evidence: `/home/sincore/source/spindle/.scratch/2026-11-06-commander-cli/reports/02-implementation.md`
- Current round: 2 of 5; round 1 fixed `TASK-02-001` (root help). Initial reviews completed.

### Findings to verify

**TASK-02-002 — Validate semantic init arguments before Git discovery.** Invalid Stack/Variable values outside Git must produce their semantic argument error before Git-root discovery, while valid workspace execution still requires Git. Fix performs `validateStacks` and `parseVariableFlags`/definition checks before `createApp()` in the Commander action; service `run` validations remain. Regression cases cover unsupported Stack, malformed and unknown Variable, and missing non-interactive Stack with Git unavailable.

**Minor code-slop — Duplicate lazy App factory wiring.** The init and update command registrations previously duplicated lazy Git-root discovery and App construction. Round 2 introduces one shared lazy local factory in `runExecutable`.

Prior code-review verdict after hash reconciliation: PASS, no findings. Prior Spec/Quality: PASS on all criteria except blocking TASK-02-002. Prior code-slop: one Minor duplicate factory finding. No declined behavior rulings.

## Checkout and snapshot

- Checkout: `/home/sincore/source/spindle`
- HEAD: `f55ae659fae89c202dba120b300f4172720e82fe`
- Current frozen source identity is HEAD plus the full ticket 02 working-tree changes and the round 2 correction.
- Complete source inventory vs HEAD: `src/cli.ts`, `src/commands/init/init-command.ts`, `src/index.ts`, `tests/init.test.ts`.
- Exact current file SHA-256 values:
  - `src/cli.ts`: `5b49ab142c2f6af2fc225d232ba1ff30976d33228adbed73dfe25a8e26510880`
  - `src/commands/init/init-command.ts`: `a2bbdddb19f87b260f1373c568563bf8d1f90531c0d24241d1bedb0c9246ff61`
  - `src/index.ts`: `8e059db38e2560e3edc5140643e1ab6d1a59ac23f33c073b9d60c986c24e3982`
  - `tests/init.test.ts`: `2e62d086a31d815f90c77da7d3e4d62063157a083452130dfafdf9ecb028f798`
- Previously reviewed round 1 snapshot hashes for files round 2 modifies: init command `68d4311128bf7383d6eb5ec95ae8ae21e129145975a03124050c2bd0c6db3870`, index `09ce0024b2e0373502edcd7b72a6e09070afcd75cea6eba3737062a9f4f7f9e3`, init tests `e8c824f2294314d1749d84ddb1de7ec9014dcee0b573d6f5228d65f2ef3d287c`; `src/cli.ts` remains `5b49...`.
- Full assigned change can be retrieved read-only with `git diff f55ae659fae89c202dba120b300f4172720e82fe -- src/cli.ts src/commands/init/init-command.ts src/index.ts tests/init.test.ts`.
- Round 2 fix-only scope: pre-App deterministic init validation in `src/commands/init/init-command.ts`; shared `createApp` closure in `src/index.ts`; outside-Git semantic invalid-argument tests in `tests/init.test.ts`. `src/cli.ts` was not changed in round 2. Compared with prior round 1 source hashes, these are the only changed implementation files.
- The init test file was formatted by the controller after implementer RED/GREEN; the final checks below were rerun after formatting.
- No implementation edits are allowed during this scoped re-review.

## Current verification on the exact hashes above

Controller-run:

- `just test::test tests/init.test.ts tests/update.test.ts tests/sdd-workspace.test.ts tests/setup-project.test.ts tests/computed-variables.test.ts` — passed, 73 tests, 0 failures (includes direct service coverage).
- `just format::check src/commands/init/init-command.ts src/cli.ts src/index.ts tests/init.test.ts src/commands/shared-options.ts` — passed.
- `just lint::check src/commands/init/init-command.ts src/cli.ts src/index.ts tests/init.test.ts src/commands/shared-options.ts` — passed.
- `just test::types` — passed.
- `just tool::git diff --check` — passed.

Implementer reports focused RED for unsupported Stack outside Git and GREEN after correction; the final focused suite passed 18 tests before the controller formatting step.
