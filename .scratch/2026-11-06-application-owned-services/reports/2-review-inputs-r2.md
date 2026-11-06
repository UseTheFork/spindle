# Ticket 02 corrective round 2 review inputs

## Requirements and finding

- Ticket 02 and full spec pointers: `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/issues/02-git-root-bootstrap-init-update.md` and `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/spec.md`.
- Ticket comments: none; ticket Comments section is empty.
- Finding: **TR02-Q-01** in `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/reports/2-task-review.md`, Minor. The setup-project invalid-argument cases ran in a non-Git explicit target as cwd and could pass at root discovery instead of argument parsing.
- Controller ruling, prior implementation attempts, and exact round-2 implementation evidence: `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/reports/2-implementation.md`, "Review rulings and corrective round 2" and "Corrective round 2 hand-back".
- Initial code/slop/task reviews and unchanged snapshot context: `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/reports/2-code-review.md`, `2-slop-review.md`, `2-task-review.md`, and `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/reports/2-review-inputs.md`.

## Workspace and fix-only snapshot

- Checkout: `/home/sincore/source/spindle`
- Base/HEAD: `d78367fbe923ef3e422e1ff741e6c1ed9ccb4168`; no commit created.
- This scoped re-review covers only corrective round 2's change to `tests/packaged-cli.test.ts`, on top of the ticket 02 snapshot in `2-review-inputs.md`. Exact current test file SHA-256: `f937418c01ee818507530d268406b324380a8d24cbc55be1a2fa0f899e621496`.
- Fix diff: setup invalid cases now use the valid `gitWorkspace` as invocation cwd while retaining explicit `setupWorkspace` args; added an assertion that failure stderr excludes the Git-root discovery error. Round 1 success-fixture changes in the same file remain unchanged. No production code changes in this round.
- Workflow-only ticket marker and report artifacts are excluded. No binary changes.

## Verification on corrected snapshot

Controller-run after round-2 test edit:

- `just format::check` on all ticket 02 files — passed.
- `just lint::check` on all ticket 02 files — passed.
- `just test::types` — passed.
- `just test::test tests/packaged-cli.test.ts` — passed, 4 tests before the formatter's semantics-preserving formatting; subsequent full test run includes the formatted test.
- `just test::test` — passed, 193 tests, 0 failures, after formatting and after prior completed `just build`.

Implementer reports RED before routing from the Git workspace (3 passed, 1 failed specifically on discovery-error exclusion) and GREEN after correction (4 passed). See implementation report for exact command history. The ticket 02 production snapshot was already build-verified; round 2 changed only test assertions/fixture cwd.
