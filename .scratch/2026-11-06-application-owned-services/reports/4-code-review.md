# Ticket 04 Code Review

## Strengths

- `ComputedContextService` in `src/computed/computed-context.ts` (lines 6–30) owns the memoized promise, copies and freezes the provider Config inputs, and preserves the public computed key and original provider error as `cause`.
- `reconcileBlueprints` creates a fresh service through `options.app.create` for each reconciliation (`src/blueprints/lifecycle.ts:692–697`). Init and Update both pass their owning App; repository search found no other current reconciliation call sites or legacy resolver imports.
- The tests cover concurrent same-run requests and once-only provider evaluation, copied/frozen inputs, fresh values on repeated Update runs through one App, separate-App isolation, provider errors, rendered output, and Config non-persistence (`tests/computed-variables.test.ts`, including lines 406–580).
- Existing provider classes and the read-only `ResolvedConfig` contract remain independent of `Service`. The Blueprint documentation explains service lifetime, provider inputs, and error behavior.

## Issues

### Critical

None.

### Important

None.

### Minor

None.

## Recommendations

None.

## Checks

- **Snapshot inspected:** HEAD `c10f0602f1966a1701ded3fcc5ae879cff3781aa`, plus the assigned dirty/untracked change. The supplied SHA-256 values matched for all six modified/added implementation, test, and documentation files. The deleted `src/computed/resolve.ts` was inspected from the supplied base. The tracked diff and changed-file inventory match the review package; controller-owned tracker/report files are excluded as specified.
- **Coverage:** Reviewed the complete new service, migrated command call sites and reconciliation wiring, deleted resolver behavior, changed computed workflow tests and documentation, plus surrounding App creation, RenderContext, and provider contracts. Inspected all current `reconcileBlueprints` call sites and searched for legacy resolver references.
- **Controller-supplied checks, recorded in `4-review-inputs.md` for this exact frozen candidate:** format check, lint check, type check, focused computed/rendering/reconciliation/command tests (81 passed), build, full test suite (197 passed), and `just tool::git diff --check` all passed.
- **Reviewer-run checks:** Verified HEAD, worktree inventory, and supplied file hashes; searched current source/test call sites and legacy resolver names. No project test, build, format, or lint command was run independently; the passing results above are attributed to the controller.
- **Evidence sources inspected:** Ticket 04, canonical spec, review-input package, implementation report, applicable project guidance and ADRs, changed source/tests/docs, and relevant surrounding contracts.
- **Limitations:** No independent dynamic test run. The review was scoped to ticket 04 and related call sites rather than an audit of unrelated repository code; supplied verification is current and identifies the reviewed candidate.

## Declined to judge

- Ticket 06's later reconciliation-class migration is expressly outside this ticket's acceptance criteria. This review checked that the current reconciliation function correctly creates and uses the per-run service; it does not assess or require that future refactor. No controller ruling is needed for ticket 04.

## Assessment

No concrete defects or unresolved declined-behavior decisions were found. The reviewed implementation aligns with ticket 04, and the supplied checks cover the exact candidate.

**Ready to merge? Yes**
