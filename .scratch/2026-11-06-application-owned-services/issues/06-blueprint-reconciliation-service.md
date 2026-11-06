# 06: Application-owned Blueprint reconciliation

Reporter: unknown
Category: enhancement

**What to build:** Init and Update share an application-owned Blueprint reconciliation service that reuses installation dependencies but creates fresh computed contexts for each run.

**Blocked by:** 02: Git-root bootstrap and Init/Update commands; 04: Per-run computed-context service; 05: Application-owned installation service and focused utilities.

**Status:** ready-for-agent
**Execution:** integrated

Corrective round 1 persisted before dispatch (1 of 5). Finding SL-06-01 is shared by the code-slop review and task review: `BlueprintCatalogReconciliationPlan` exposes aggregate `deletions` and `membershipCleanup` arrays that the only caller does not read; `flatMap` constructs redundant arrays. Controller ruling: remove only the unread aggregate outputs/calculations, preserving each handler plan's deletion and cleanup data and all reconciliation behavior. Prior attempts: NONE.

- [X] Move shared Blueprint lifecycle orchestration into an application-managed reconciliation service rather than leaving command classes as adapters around old lifecycle functions.
- [X] Resolve installation and other shared service dependencies during asynchronous boot; keep per-reconciliation Config, prompt answers, plans, and mutable state outside long-lived service state.
- [X] Wire Init and Update through the service using application-owned paths and a fresh computed-context instance for each run.
- [X] Preserve the existing shared lifecycle and typed Blueprint catalog, handler responsibilities, rendering, conflict handling, new-selection handling, and update policies.
- [X] Preserve selected-directory membership cleanup, complete target removals, and Stack applicability behavior.
- [X] Preserve coordinated preparation of rendered writes, Config, deletions, and membership cleanup before applying changes; preparation failure leaves the project unchanged.
- [X] Application-time filesystem failures remain explicit and report completed changes according to existing behavior; do not add a rollback guarantee or success-shaped fallback.
- [X] Repeated reconciliation through one application uses fresh Config-derived computed values while retaining within-run memoization.
- [X] Separate applications operating on different roots do not share Config, computed state, or output destinations.
- [X] Migrate lifecycle production consumers and direct-import tests directly and remove replaced exports; retain focused pure helpers rather than unnecessary service abstractions.
- [X] Existing Init/Update and workflow tests cover preparation failure, cleanup, removal, conflict/update policies, and computed resolution through the new service structure.
- [X] Validate focused coordinated-preparation, cleanup/removal, computed, and command tests plus type checking through Just, and update directly related architecture documentation.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments
