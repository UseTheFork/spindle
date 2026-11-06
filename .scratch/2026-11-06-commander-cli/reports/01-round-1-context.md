# Ticket 01 corrective round 1 inputs

## Assignment and budget

- Ticket: `/home/sincore/source/spindle/.scratch/2026-11-06-commander-cli/issues/01-commander-update.md`
- Canonical spec: `/home/sincore/source/spindle/.scratch/2026-11-06-commander-cli/spec.md`
- Checkout: `/home/sincore/source/spindle`
- Starting code snapshot: HEAD `3b684dfa306a6e670c9739926a5a5a462fd99a1e` plus the frozen Ticket 01 implementation changes documented in `/home/sincore/source/spindle/.scratch/2026-11-06-commander-cli/reports/01-review-inputs.md`.
- Corrective round: 1 of 5 permitted ticket fix dispatches.
- Prior corrective attempts: NONE.
- Prior rulings: NONE. Finding `TASK-01-001` is accepted as blocking.
- Preserve initial report history and initial verdicts; this is a fix-only assignment.

## Finding to fix (verbatim)

### TASK-01-001 — Parse update arguments before Git-root discovery

- **Impact/severity:** Important; blocks Spec and Quality approval.
- **Location:** `src/index.ts:31-39`.
- **Evidence:** `runExecutable` calls `discoverGitRoot(startingDirectory)` before dispatch unless the arguments match its informational allowlist. Invalid update invocations are not on that allowlist. Consequently, running `spindle update --stack python` (or another malformed update invocation) outside a Git working tree reports a Git-root error instead of Commander's argument error.
- **Required correction:** Arrange for Commander to parse and validate update arguments before Git-root discovery, while still requiring a discovered root before executing a valid update. Add a source-CLI subprocess test from a non-Git temporary directory asserting that an invalid update invocation reports the Commander argument error rather than a Git-root failure.
- **Blocking:** Yes.

## History and evidence

- Initial code review: PASS; no findings. Report: `/home/sincore/source/spindle/.scratch/2026-11-06-commander-cli/reports/01-code-review.md`.
- Initial code-slop review: no material simplification found. Report: `/home/sincore/source/spindle/.scratch/2026-11-06-commander-cli/reports/01-code-slop-review.md`.
- Initial Spec/Quality review: FAIL on `TASK-01-001`; also requested direct service-test evidence. Report: `/home/sincore/source/spindle/.scratch/2026-11-06-commander-cli/reports/01-task-review.md`.
- Existing direct service coverage is in `/home/sincore/source/spindle/tests/computed-variables.test.ts`, which obtains `UpdateCommand` from `App` and calls its Commander-independent `run`.
- Existing outside-Git subprocess patterns use `runCliRaw` in `/home/sincore/source/spindle/tests/git-root.test.ts`; the specific new regression should assert that `update --stack python` with Git unavailable reports Commander's unknown-option error, not the Git working-tree-root error.

## Scope and permissions

Modify only `src/index.ts`, focused `tests/update.test.ts` (or another directly relevant existing CLI test file if necessary), and this round's implementation report. Preserve the frozen implementation and user/controller changes. Do not edit other command behavior, tracker state, or initial reports. Do not commit or publish. The source CLI subprocess seam (`runCliRaw` from outside Git) is confirmed.

## Required verification

Run the relevant regression test using `just test::test ...` after adding the failing test and fixing it. The controller will run ticket-wide tests including `tests/computed-variables.test.ts`, formatting, lint, type-check, and `git diff --check` on the fixed snapshot.
