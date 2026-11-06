# Ticket 06 implementation report

**Status:** DONE

## Snapshot

- **Checkout:** `/home/sincore/source/spindle`
- **Starting revision:** `07f3b41339dec0cdc5034f603a825d8c6cb323d4`
- **Final revision:** `07f3b41339dec0cdc5034f603a825d8c6cb323d4` (no commit made)
- **Tested snapshot:** the above HEAD plus the implementation and test changes listed below, with the controller-owned ticket execution marker left untouched. Focused tests and type checking ran after the final source/test edits; no source or test edits followed those checks.
- **Starting dirty state:** only the controller-owned ticket execution marker was present.
- **Final dirty state:** the controller-owned marker remains, implementation changes are in the files below, and this assigned report is new. No other changes were made.

## Changes and criteria

- Moved the shared catalog planning, Blueprint lifecycle, preparation, coordinated apply, cleanup, removal, and completed-change reporting into `BlueprintReconciliationService` in `src/reconciliation/blueprint-reconciliation-service.ts`.
- `BlueprintReconciliationService.boot()` resolves the application-owned `InstallationService`. The latter now owns prepared-file application; its replaced reconciliation API and the old `installPlannedBlueprintFiles` export were removed.
- Init and Update resolve and call `BlueprintReconciliationService`. Workspace and Blueprint source paths come from their owning `App`; mutable plans, Config, prompt answers, and computed context remain operation-local, with a fresh computed-context service for each run.
- Migrated the direct service tests to the new APIs, preserving their behavior assertions for file installation, app-root isolation, repeated runs, and source-root stability. Existing coordinated-preparation, cleanup/removal, computed-value, command, policy, output, and filesystem-failure assertions remain in place.
- Updated `docs/adr/0004-application-owned-services.md` and `docs/blueprints.md` to document service ownership and per-run state.
- This was a behavior-preserving refactor: relevant tests and the type check passed before changes. No RED test was expected or manufactured.

### Changed files

- `src/reconciliation/blueprint-reconciliation-service.ts` (new)
- `src/installation/installation-service.ts`
- `src/utilities/blueprint-files.ts`
- `src/commands/init/init-command.ts`
- `src/commands/update/update-command.ts`
- `tests/install.test.ts`
- `docs/adr/0004-application-owned-services.md`
- `docs/blueprints.md`
- `.scratch/2026-11-06-application-owned-services/reports/6-implementation.md` (this report)

## Verification

Implementer-run baseline, before refactoring:

- `just test::test tests/coordinated-preparation.test.ts tests/directory-membership.test.ts tests/removals.test.ts tests/computed-variables.test.ts tests/init.test.ts tests/update.test.ts` — passed, 65 tests.
- `just test::types` — passed.

Implementer-run on the final source/test snapshot:

- `just test::test tests/coordinated-preparation.test.ts tests/directory-membership.test.ts tests/removals.test.ts tests/computed-variables.test.ts tests/init.test.ts tests/update.test.ts tests/install.test.ts` — passed, 68 tests.
- `just test::types` — passed.

## Self-review and pending checks

- Confirmed Init/Update consumers and direct workflow tests use the reconciliation service; no source/test references remain to `installPlannedBlueprintFiles` or `InstallationOptions`.
- No known behavioral concerns. Formatting, lint, build, packaged CLI, and ticket-wide/full-suite checks were not run; they remain with the controller and are not implementer failures or evidence of ticket acceptance.
- No commit was authorized or created.

## Hand-back

The shared Blueprint lifecycle is now App-owned, with installation resolved during boot and computed context kept fresh per reconciliation. Assigned focused tests and type checking pass on the uncommitted implementation snapshot. Controller-owned checks remain pending.

## Initial review and corrective round 1

- Initial code review: `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/reports/6-code-review.md` found no issues; Ready to merge.
- Initial code-slop review: `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/reports/6-slop-review.md` found Minor SL-06-01: unread aggregate `deletions` and `membershipCleanup` arrays in `BlueprintCatalogReconciliationPlan`, built with `flatMap`.
- Initial task review: `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/reports/6-task-review.md` passed Spec and Quality and independently recorded the same Minor finding as SL-06-01.
- Corrective round: 1 of 5, persisted before dispatch. Prior attempts: NONE.
- Controller ruling: remove only the unused aggregate outputs and their flattening calculations; retain each handler plan's required deletion/cleanup entries and all reconciliation behavior.
- Corrective implementation report path: append to this file. Scoped review path: `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/reports/6-round-1-review.md`.

## Corrective round 1 result

**Status:** DONE

- **Finding:** SL-06-01 (Minor), the unread aggregate deletion and membership-cleanup outputs on `BlueprintCatalogReconciliationPlan`.
- **Correction:** Removed only the two aggregate properties and their `flatMap` calculations. `BlueprintHandlerCatalogPlan.deletions` and `.membershipCleanup`, their construction, and all reconciliation behavior remain unchanged.
- **Exact source diff:**

  ```diff
   export interface BlueprintCatalogReconciliationPlan {
     handlers: BlueprintHandlerCatalogPlan[];
  -  deletions: PlannedBlueprintDeletion[];
  -  membershipCleanup: PlannedBlueprintDeletion[];
   }
  ...
  -  return {
  -    handlers: handlerPlans,
  -    deletions: handlerPlans.flatMap((handlerPlan) => handlerPlan.deletions),
  -    membershipCleanup: handlerPlans.flatMap((handlerPlan) => handlerPlan.membershipCleanup),
  -  };
  +  return { handlers: handlerPlans };
  ```

## Corrective round 1 verification and snapshot

- **Checkout:** `/home/sincore/source/spindle`
- **Starting revision:** `07f3b41339dec0cdc5034f603a825d8c6cb323d4`
- **Final revision:** `07f3b41339dec0cdc5034f603a825d8c6cb323d4` (no commit; commit not authorized)
- **Tested snapshot:** that HEAD plus the starting uncommitted candidate and only the source correction above. Source SHA-256: `514952f34ca950fd929e6fb6ea14a724a2530d2534fef16168cbecfadc8b1be0`. No source or test edits followed the final checks.
- **Starting dirty/untracked paths:** modified `.scratch/2026-11-06-application-owned-services/issues/06-blueprint-reconciliation-service.md`, `docs/adr/0004-application-owned-services.md`, `docs/blueprints.md`, `src/commands/init/init-command.ts`, `src/commands/update/update-command.ts`, `src/installation/installation-service.ts`, `src/utilities/blueprint-files.ts`, and `tests/install.test.ts`; untracked `.scratch/2026-11-06-application-owned-services/reports/6-code-review.md`, `6-implementation.md`, `6-review-inputs.md`, `6-slop-review.md`, `6-task-review.md`, and `src/reconciliation/blueprint-reconciliation-service.ts`; no deleted paths.
- **Final dirty/untracked paths:** same inventory; the assigned report `6-implementation.md` was appended, and the reconciliation service source was updated. No other paths were changed.

The correction is a pure refactor. The approved relevant tests and type check were passing before the structural change; no artificial RED test was added for private aggregate outputs. Both checks were rerun after the change:

- Implementer-run baseline: `just test::test tests/coordinated-preparation.test.ts tests/directory-membership.test.ts tests/removals.test.ts tests/computed-variables.test.ts tests/init.test.ts tests/update.test.ts tests/install.test.ts` — passed, 68 tests.
- Implementer-run baseline: `just test::types` — passed.
- Implementer-run after correction: the same focused test command — passed, 68 tests, 0 failures.
- Implementer-run after correction: `just test::types` — passed.

Self-review confirmed the aggregate fields/calculations are gone, and each handler's deletion and membership-cleanup fields and plan construction remain. No unrelated source or test files changed. No remaining implementer concerns.

Formatting, lint, build, packaged tests, and ticket-wide/full-suite regression checks were not run for this correction; they remain with the controller and are not implementer failures or evidence of ticket acceptance. No commit was made.

**Hand-back:** SL-06-01 is corrected within the assigned source scope. Fresh focused tests and types pass on the recorded uncommitted snapshot. Controller checks and scoped corrective review remain pending.

## Final acceptance and integration

- Corrective scoped re-review: `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/reports/6-round-1-review.md` marked SL-06-01 ADDRESSED, found no new breakage, and passed Spec and Quality.
- Initial code review found no issues. Initial code-slop review found Minor SL-06-01; initial task review passed Spec and Quality with the same Minor finding. It is now closed.
- The initial review manifest's diff stat was clarified before the task review: the implementation candidate is 7 modified tracked files plus 1 added service; raw Git stat additionally counted the ticket marker. The corrected inventory is in `6-review-inputs.md`.
- Controller checks on the final corrected candidate: format and lint passed across changed ADR/docs/source/test files; types passed; focused tests passed 68/68; build passed; packaged CLI tests passed 4/4; full suite passed 199/199; `just tool::git diff --check` passed.
- All twelve ticket criteria are complete. Ticket 06 is accepted and marked `Execution: integrated`; controller integration is proceeding.
