# 06: Application-owned Blueprint reconciliation

Reporter: unknown
Category: enhancement

**What to build:** Init and Update share an application-owned Blueprint reconciliation service that reuses installation dependencies but creates fresh computed contexts for each run.

**Blocked by:** 02: Git-root bootstrap and Init/Update commands; 04: Per-run computed-context service; 05: Application-owned installation service and focused utilities.

**Status:** ready-for-agent

- [ ] Move shared Blueprint lifecycle orchestration into an application-managed reconciliation service rather than leaving command classes as adapters around old lifecycle functions.
- [ ] Resolve installation and other shared service dependencies during asynchronous boot; keep per-reconciliation Config, prompt answers, plans, and mutable state outside long-lived service state.
- [ ] Wire Init and Update through the service using application-owned paths and a fresh computed-context instance for each run.
- [ ] Preserve the existing shared lifecycle and typed Blueprint catalog, handler responsibilities, rendering, conflict handling, new-selection handling, and update policies.
- [ ] Preserve selected-directory membership cleanup, complete target removals, and Stack applicability behavior.
- [ ] Preserve coordinated preparation of rendered writes, Config, deletions, and membership cleanup before applying changes; preparation failure leaves the project unchanged.
- [ ] Application-time filesystem failures remain explicit and report completed changes according to existing behavior; do not add a rollback guarantee or success-shaped fallback.
- [ ] Repeated reconciliation through one application uses fresh Config-derived computed values while retaining within-run memoization.
- [ ] Separate applications operating on different roots do not share Config, computed state, or output destinations.
- [ ] Migrate lifecycle production consumers and direct-import tests directly and remove replaced exports; retain focused pure helpers rather than unnecessary service abstractions.
- [ ] Existing Init/Update and workflow tests cover preparation failure, cleanup, removal, conflict/update policies, and computed resolution through the new service structure.
- [ ] Validate focused coordinated-preparation, cleanup/removal, computed, and command tests plus type checking through Just, and update directly related architecture documentation.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments
