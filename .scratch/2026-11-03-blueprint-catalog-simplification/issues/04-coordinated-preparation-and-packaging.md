# 04: Guarantee coordinated preparation and packaged behavior

Reporter: unknown
Category: enhancement
Status: ready-for-agent

Source: [Feature specification](../spec.md)

**What to build:** Catalog reconciliation across all kinds prepares the entire
selected change set before modifying an installation, reports partial progress
on application failure, and works identically from the packaged CLI outside the
checkout.

**Blocked by:**
- 02: Remove retired and Stack-inapplicable content.
- 03: Reconcile authoritative directory membership.

- [ ] Coordinate catalog validation, source expansion, update/conflict/new-content
      decisions, all selected rendered writes, whole-target deletions,
      destination-only cleanup, Config writes, and managed Just imports before
      any installation changes.
- [ ] Preparation failures leave the complete installation, Config, and root
      imports unchanged, even when valid writes and destructive cleanup were
      already planned in other kinds.
- [ ] A current or skipped update does not accidentally suppress confirmed
      cleanup, and a preparation failure does not accidentally apply it.
- [ ] Filesystem failures during application stop the command with unsuccessful
      status and explicit diagnostics identifying changes already applied and
      the failure. Do not claim successful rollback or hide partial progress.
      Full transactional rollback remains out of scope.
- [ ] Use existing failure-injection patterns to exercise application-time
      write and deletion failures through the real CLI without introducing a
      public testing API.
- [ ] CLI tests pair planned deletions and directory cleanup with failures in
      another selected kind's templates, metadata, or Just preparation. Assert
      exact unchanged filesystem bytes, Config, imports, and outside-root
      sentinel content.
- [ ] Cross-kind tests cover successful mixed writes/removals/cleanup and
      repeated runs, verifying exact results and operation reporting rather than
      private planner structure.
- [ ] Packaged CLI smoke tests run outside the checkout with bundled catalog
      and Blueprint assets, without a source-tree fallback, and demonstrate
      initialization/update behavior and managed import correctness.
- [ ] Complete the regression migration: remove remaining obsolete legacy
      discovery/layout/composition assertions and verify retained rendering,
      binary preservation, version handling, conflict behavior, and unrelated
      CLI workflows still work.
- [ ] Reconcile authoring guidance, glossary, architectural records, packaging
      expectations, and fixtures with the final behavior, preserving unrelated
      content and historical decision context. Do not silently change design
      approval records as a side effect of implementation.
- [ ] Run focused failure/packaging tests, type checking, and related CLI
      regression suites through project Just recipes; resolve integration
      regressions caused by the combined changes.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments
