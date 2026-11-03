# Ticket 02 implementation report

Status: `DONE`

## Snapshot

- Checkout: `/home/sincore/source/spindle`
- Starting revision: `e1623d6536cda346245fe86b4b5963ac8ea2612a`
- Final revision: `e1623d6536cda346245fe86b4b5963ac8ea2612a` (no commit authorized or created)
- Tested snapshot: the final working tree at that revision, including the implementation and test files listed below. The controller-owned ticket-02 `Execution: implementing` and comment-log update was present before work and preserved.
- Existing dirty/untracked changes at entry: only the controller's ticket-02 tracker update; no other pre-existing changes. At hand-back, the implementation/test/doc changes below and this report are added to that snapshot. The tracker file was not edited by the implementer.

## Criterion-to-change/test summary

- `src/blueprints/catalog.ts` now produces separate selections and deletion records for `removed` entries and active entries with no selected-Stack match. Removed entries do not require a source; active entries remain validated even when inapplicable. Matching continues to use any-match semantics.
- `src/blueprints/lifecycle.ts` creates and validates exact target-level deletion plans, rejects unsafe symlink/type targets before applying changes, deletes file targets non-recursively and directory targets recursively, treats missing targets as no-ops, and reports actual removals. A reusable exported `planBlueprintCatalogReconciliation(...)` exposes deletion paths, targets, reasons, and per-handler planning data for ticket 04.
- `src/blueprints/just.ts` deletes retired/inapplicable managed modules and removes their managed imports while preserving unrelated root content and unlisted modules/imports. Deletion/application failures are surfaced with actionable diagnostics and completed-change details.
- `src/index.ts` and `src/update.ts` report each actual removal explicitly. `docs/blueprints.md` documents unconditional removal, exact ownership, Just import cleanup, and the absence of inferred cleanup for missing entries or renamed paths.
- `tests/removals.test.ts` exercises real CLI init/update behavior across all four kinds, edited files/directories and nested additions, source-less/absent/repeated targets, skip/new-content options, Stack transitions and multi-Stack matching, explicit-vs-inferred cleanup, Just import preservation/removal, unsafe target validation, and generic/Just application failures.
- `tests/agents.test.ts` updates the previous inapplicable-symlink expectation to require an unsuccessful safe rejection.
- Behavior changes followed a verified RED→GREEN cycle. Initial `just test::test tests/removals.test.ts` failed in both init and update because the expected removed targets remained. The final focused suites pass.

## Changed files

- `docs/blueprints.md`
- `src/blueprints/catalog.ts`
- `src/blueprints/just.ts`
- `src/blueprints/lifecycle.ts`
- `src/blueprints/types.ts`
- `src/index.ts`
- `src/update.ts`
- `tests/agents.test.ts`
- `tests/removals.test.ts` (new)
- `tests/fail-removal.mjs` (new test failure injector)
- `.scratch/2026-11-03-blueprint-catalog-simplification/reports/02-implementation.md` (this report)

The changed issue tracker file `.scratch/2026-11-03-blueprint-catalog-simplification/issues/02-remove-inapplicable-blueprints.md` contains only the controller-owned entry-time state/comment update and was preserved unchanged by this worker.

## Verification

- RED: `just test::test tests/removals.test.ts` — 2 expected failures; init/update retained the explicit deletion targets.
- GREEN: `just test::test tests/removals.test.ts tests/agents.test.ts tests/instructions.test.ts tests/init.test.ts tests/update.test.ts tests/catalog.test.ts` — 116 tests passed, 0 failed.
- GREEN: `just test::types` — exited 0.
- No commit was made.

## Self-review and pending checks

- No remaining implementation findings identified in the assigned scope.
- Full test suite, formatting, lint, and ticket-wide regression/acceptance checks were not run; they remain with the controller as assigned. The controller may rerun type checking as part of its mechanical gate.
- Ticket 03 selected-directory membership cleanup and ticket 04 cross-kind atomic preparation/application were not implemented.
- No execution state, comments, design, or ADR approval labels were changed.

## Hand-back

Ticket 02 implementation and focused verification are complete on the shared checkout. The controller can review the deletion planning seam and run its post-handoff mechanical and ticket-wide checks.

## Controller verification

The initial controller formatting check flagged `src/blueprints/lifecycle.ts`,
`src/index.ts`, `src/update.ts`, and `tests/removals.test.ts`. The controller
applied the project formatter to those assigned files and reran the gate on
the resulting snapshot:

- `just test::test` — **passed, 182/182**, exit 0.
- `just test::types` — **passed**, exit 0.
- Scoped `just format::check` on ticket 02 code, tests, and docs — **passed**,
  exit 0.
- Scoped `just lint::check` on ticket 02 code and tests — **passed**, exit 0.

The exact reviewed source snapshot is commit
`e1623d6536cda346245fe86b4b5963ac8ea2612a` plus the uncommitted ticket 02
changes; the test report update is not an input to the CLI tests.

## Corrective round 1 — T02-R1-01

Status: `DONE`

- Checkout: `/home/sincore/source/spindle`
- Starting revision: `e1623d6536cda346245fe86b4b5963ac8ea2612a`
- Final revision: `e1623d6536cda346245fe86b4b5963ac8ea2612a` (no commit authorized or created)
- Tested snapshot: that revision plus the pre-existing uncommitted ticket 02 implementation/tests and this round's changes to `src/blueprints/just.ts` and `tests/removals.test.ts`.
- Existing dirty/untracked changes were preserved, including the controller's tracker update and the ticket 02 implementation and review reports. No tracker, design, spec, or ADR files were changed.

### Finding correction and evidence

- `T02-R1-01`: `reconcileJustfile` now associates a managed import with a deletion using its resolved target path under `.github/scripts/just-modules`, not the import identifier. The existing managed-path boundary check remains, so unrelated imports are preserved.
- The real CLI init/update removal test now imports `retired.just` as `retired-alias` and verifies both the module target and alias import disappear while unrelated root imports/configuration remain.
- RED: `just test::test tests/removals.test.ts` — 2 expected failures (init and update); each showed the deleted module's `retired-alias` import dangling in the root justfile.
- GREEN: `just test::test tests/removals.test.ts` — 7 passed, 0 failed, including both corrected CLI cases.

### Changed files and review

- `src/blueprints/just.ts`
- `tests/removals.test.ts`
- `.scratch/2026-11-03-blueprint-catalog-simplification/reports/02-implementation.md` (this appended round result)
- Self-review: no remaining finding identified in the assigned import/deletion matching scope. No unrelated ticket behavior was changed.

### Pending controller checks

No additional implementer checks were scheduled. Full tests, type checking, formatting, lint, and ticket-wide regression/acceptance checks remain pending with the controller; they were not run for this corrective round.

### Hand-back

The assigned round-1 finding is corrected and its real CLI regression has fresh RED/GREEN evidence. No commit was made.

## Controller verification after round 1

The controller reran the ticket gate on the fixed working-tree snapshot:

- `just test::test` — **passed, 182/182**, exit 0.
- `just test::types` — **passed**, exit 0.
- Scoped `just format::check` on ticket 02 code, tests, and docs — **passed**,
  exit 0.
- Scoped `just lint::check` on ticket 02 code and tests — **passed**, exit 0.
- `just tool::git diff --check HEAD` — **passed**, exit 0.

The fixed source snapshot is commit
`e1623d6536cda346245fe86b4b5963ac8ea2612a` plus the uncommitted ticket 02
delivery and round-1 alias cleanup; the report update is not a CLI test input.
The round-1 scoped re-review initially left `T02-R1-N01` open; the round-2
scoped re-review subsequently addressed it. See
`reports/02-round-2-review.md`.

## Final ticket verification

After both initial reviews and the scoped round-1 and round-2 re-reviews, the
controller reran the ticket gate against the accepted source snapshot:

- `just test::test` — **passed, 184/184**, exit 0.
- `just test::types` — **passed**, exit 0.
- Scoped `just format::check` on changed ticket 02 code, tests, and docs —
  **passed**, exit 0.
- Scoped `just lint::check` on changed ticket 02 code and tests — **passed**,
  exit 0.
- `just tool::git diff --check HEAD` — **passed**, exit 0.

No source or test files changed after this verification; only tracker/report
evidence changed. The accepted ticket 02 diff is ready for its integration
commit.

## Corrective round 2 — T02-R1-N01

Status: `DONE`

- Checkout: `/home/sincore/source/spindle`
- Starting revision: `e1623d6536cda346245fe86b4b5963ac8ea2612a`
- Final revision: `e1623d6536cda346245fe86b4b5963ac8ea2612a` (no commit authorized or created)
- Tested snapshot: the same HEAD plus the pre-existing ticket 02 implementation and round-1 changes, this round's changes to `src/blueprints/just.ts` and `tests/removals.test.ts`, and the controller-owned tracker update. The implementation report itself was not a CLI test input.
- Existing dirty/untracked ticket 02 files and reports were preserved. The tracker file was not edited. No design, ADR, ticket 03/04 behavior, or unrelated files were changed.

### Finding correction and evidence

- `T02-R1-N01`: `reconcileJustfile` now retains the resolved filesystem target for each removed managed import. During reporting, the target is matched back to the catalog deletion path, rather than reconstructing a filename from the import alias. Missing module files remain no-op filesystem deletions, while actual import removal reports the intended target path.
- Added real CLI init and update cases with a source-less `removed` record for `retired.just`, no installed `retired.just`, and root import alias `retired-alias`. Both assert that the import disappears, unrelated root content and a different managed module/import remain, and output reports `Removed just module 'retired.just'` (not an alias-derived filename).
- RED: after correcting CLI fixture setup (required `--stack` for init and a valid nonempty update Stack config), `just test::test tests/removals.test.ts` failed both new cases specifically because the output omitted `Removed just module 'retired.just'`; the import and unrelated-content assertions passed.
- GREEN: `just test::test tests/removals.test.ts` — 9 passed, 0 failed, including both new init/update cases and existing removal regressions.

### Changed files and self-review

- `src/blueprints/just.ts`
- `tests/removals.test.ts`
- `.scratch/2026-11-03-blueprint-catalog-simplification/reports/02-implementation.md` (this appended round result)
- Self-review confirmed reporting is tied to the resolved managed target and mapped to the catalog removal path; duplicate aliases targeting the same path remain deduplicated, while unrelated imports are unchanged. No remaining issue identified in the assigned scope.

### Pending controller checks

No additional implementer checks were scheduled. Formatting, lint, type checking, full tests, and ticket-wide regression/acceptance checks remain with the controller; they were not run in this corrective round. No commit was made.

### Hand-back

The assigned round-2 finding has fresh RED/GREEN real-CLI evidence. Return this report for scoped review and controller checks.

## Controller verification after round 2

The initial controller formatting check flagged only
`tests/removals.test.ts`; the controller applied the Just formatter to that
assigned test file and reran the gate on the exact fixed snapshot:

- `just test::test` — **passed, 184/184**, exit 0.
- `just test::types` — **passed**, exit 0.
- Scoped `just format::check` on ticket 02 code, tests, and docs — **passed**,
  exit 0.
- Scoped `just lint::check` on ticket 02 code and tests — **passed**, exit 0.
- `just tool::git diff --check HEAD` — **passed**, exit 0.

The source snapshot remains commit
`e1623d6536cda346245fe86b4b5963ac8ea2612a` plus the uncommitted ticket 02
delivery and round-2 changes. Scoped re-review is pending.
