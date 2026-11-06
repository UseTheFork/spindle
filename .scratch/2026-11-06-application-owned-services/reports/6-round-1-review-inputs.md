# Ticket 06 corrective round 1 review inputs

## Requirements

- Ticket: `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/issues/06-blueprint-reconciliation-service.md`
- Spec: `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/spec.md`
- Ticket comments: none; its Comments section is empty.
- Initial findings/reviews:
  - Code review: `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/reports/6-code-review.md`
  - Code-slop review: `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/reports/6-slop-review.md`
  - Task review: `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/reports/6-task-review.md`
- Initial full candidate and verification package: `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/reports/6-review-inputs.md`
- Implementation and correction history: `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/reports/6-implementation.md`
- Applicable test instructions: `/home/sincore/source/spindle/.github/instructions/testing.instructions.md`

## Workspace and snapshot

- Checkout: `/home/sincore/source/spindle`
- Base/HEAD: `07f3b41339dec0cdc5034f603a825d8c6cb323d4`; no commit created.
- Previous reviewed implementation snapshot: the same HEAD plus the dirty/untracked implementation candidate in `6-review-inputs.md`; its complete changed-file inventory and hashes are preserved there.
- Corrected snapshot: previous candidate plus only the one-file fix below. The reconciliation service SHA-256 changed from `c3c7c6d5acd7006f96479e788c303ecf7e93ff25fad01667d80b996759bf0246` to `514952f34ca950fd929e6fb6ea14a724a2530d2534fef16168cbecfadc8b1be0`. All other implementation file hashes and paths are unchanged from the initial package. No binary changes.
- Workflow-only excluded files: controller-owned ticket marker and reports under `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/reports/`.
- No unrelated user changes or source/test files were introduced in this round.

## Finding and complete fix delta

Finding SL-06-01, independently recorded by code-slop and task review:

> `src/reconciliation/blueprint-reconciliation-service.ts:144-147,258-259` — `BlueprintCatalogReconciliationPlan` includes aggregate `deletions` and `membershipCleanup` arrays, and the private planning function builds both with `flatMap`. Its only in-repository caller reads `catalogPlan.handlers`; searches found no other consumers of the aggregate fields. These unused outputs add API surface and allocate duplicate arrays without affecting reconciliation. Return only the handler plans (or otherwise remove the unread aggregate fields and calculations); the caller retains all per-handler deletion and cleanup data it uses.

Corrective diff:

```diff
 export interface BlueprintCatalogReconciliationPlan {
   handlers: BlueprintHandlerCatalogPlan[];
-  deletions: PlannedBlueprintDeletion[];
-  membershipCleanup: PlannedBlueprintDeletion[];
 }
 ...
- return {
-   handlers: handlerPlans,
-   deletions: handlerPlans.flatMap((handlerPlan) => handlerPlan.deletions),
-   membershipCleanup: handlerPlans.flatMap((handlerPlan) => handlerPlan.membershipCleanup),
- };
+ return { handlers: handlerPlans };
```

`BlueprintHandlerCatalogPlan` still retains per-handler `deletions` and `membershipCleanup` fields and their plan construction is unchanged.

## Prior verdicts and controller ruling

- Initial code review: no findings, Ready to merge.
- Initial code-slop review: Minor SL-06-01.
- Initial task review: Spec PASS and Quality PASS; same Minor SL-06-01.
- Controller ruling before dispatch: remove only the unread aggregate outputs/calculations; preserve per-handler planning and all reconciliation behavior.
- Corrective round: 1 of 5; prior attempts: NONE.

## Verification

Controller-run on the corrected candidate:

- Format and lint checks on all changed ADR/docs/source/test files — passed.
- `just test::types` — passed.
- `just test::test tests/coordinated-preparation.test.ts tests/directory-membership.test.ts tests/removals.test.ts tests/computed-variables.test.ts tests/init.test.ts tests/update.test.ts tests/install.test.ts` — passed, 68 tests, 0 failures.
- `just build` — passed.
- `just test::test tests/packaged-cli.test.ts` — passed, 4 tests, 0 failures, after build.
- `just test::test` — passed, 199 tests, 0 failures, sequentially after build.
- `just tool::git diff --check` — passed.

The implementer independently reran the focused suite and types after the correction; details are in `6-implementation.md`. Source hash and status were rechecked after those controller checks.
