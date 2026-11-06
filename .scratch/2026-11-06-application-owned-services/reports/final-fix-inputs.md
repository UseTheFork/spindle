# Full-spec final-fix context

## Persisted allowance

- Final-fix dispatch: **1 of 1 used** before implementation.
- Finding: `FS-SL-01`.
- Prior implementation attempts: NONE.
- Corrective implementation report: `final-fix-implementation.md`.
- Scoped re-review report: `final-fix-review.md`.

## Finding

`src/reconciliation/blueprint-reconciliation-service.ts:144-146,194,649-655` —
`BlueprintCatalogReconciliationPlan` wraps only a `handlers` array, and its sole
caller immediately iterates `catalogPlan.handlers`. Repository searches found
no external consumers or tests for this plan type. After the previously
corrected removal of the unused aggregate outputs, this wrapper leaves needless
type surface and one layer of indirection. Return
`BlueprintHandlerCatalogPlan[]` directly from
`planBlueprintCatalogReconciliation` and iterate it directly; preserve each
handler plan's selections, deletions, and membership-cleanup data.

## Controller ruling

Accept `FS-SL-01`. Remove only the `BlueprintCatalogReconciliationPlan`
interface/wrapper, have `planBlueprintCatalogReconciliation` return
`BlueprintHandlerCatalogPlan[]` directly, and iterate the returned array in its
sole caller. Preserve handler-plan fields and all reconciliation behavior. Do
not add tests for this private return shape or perform unrelated cleanup.

## Snapshot and prior evidence

- Checkout: `/home/sincore/source/spindle`.
- Starting HEAD: `27fe294f18965c080ba2cfc6c266dc600c1f5b39`.
- Worktree was clean before aggregate-review reports were written. Current
  untracked review reports are `final-review.md` and `final-slop-review.md`;
  preserve both.
- Aggregate code review: `final-review.md`, verdict Ready to merge, no findings.
- Aggregate slop review: `final-slop-review.md`, one Minor finding above.
- All tickets 01–07 are integrated. Their prior reports document resolved
  findings, including ticket 06's removal of unused aggregate plan outputs.
- Baseline focused tests run via Just at this snapshot and passed: 68/68 across
  coordinated preparation, directory membership, removals, computed variables,
  Init, Update, and installation tests.

## Scope and verification

Implementation scope is only
`src/reconciliation/blueprint-reconciliation-service.ts`. This is a pure
structural refactor; rerun the same 68 focused tests after the change. The
controller will run the final full-spec checks and then scoped re-review.
