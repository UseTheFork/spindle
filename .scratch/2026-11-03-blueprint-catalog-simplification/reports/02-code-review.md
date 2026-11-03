# Ticket 02 code review

## Strengths

- The catalog plan separates active selections from explicit removals and records why each deletion is planned (`src/blueprints/catalog.ts:205-294`); source-less `removed` entries do not require a source.
- Reconciliation validates deletion targets and their ownership roots before applying changes, rejects symlinks and target-type mismatches, treats absent paths as no-ops, and reports completed removals when application fails (`src/blueprints/lifecycle.ts:416-469, 483-517`).
- CLI removal reporting is connected to both init and update, and the documentation explains unconditional deletion, Just import cleanup, and the absence of inferred cleanup for missing entries or renamed paths (`src/index.ts:68-71`, `src/update.ts:128-131`, `docs/blueprints.md`).
- The real-CLI tests cover both commands and all four kinds, edited targets and nested additions, absent/repeated removals, Stack transitions and multi-Stack matches, skip/new-content options, unrelated Just content, unsafe targets, and injected deletion failures (`tests/removals.test.ts`).

## Issues

### Critical

None.

### Important

None.

### Minor

- `src/blueprints/just.ts:90-92` — Removal of a Just module import checks the parsed import alias (`name`) against the module filename stem in `removedNames`, rather than matching the import path to the deleted managed module. For example, `mod custom '.github/scripts/just-modules/retired.just'` remains in the root justfile when `retired.just` is deleted. This leaves a dangling import and can break later Just invocations. Match removed imports by their resolved managed module path (while preserving imports to unrelated/unlisted paths), and cover an aliased import in a CLI test.

## Recommendations

None beyond the fix above.

## Checks

- Reviewed snapshot: `HEAD` and assigned base/head `e1623d6536cda346245fe86b4b5963ac8ea2612a`, plus the ticket 02 dirty worktree. The assigned modified paths and all untracked paths were present, including `tests/removals.test.ts`, `tests/fail-removal.mjs`, and the implementation report. No snapshot mismatch observed.
- Reviewed requirements: `spec.md`, `issues/02-remove-inapplicable-blueprints.md` including comments, `design.md`, and `reports/02-implementation.md`.
- Inspected changes and surrounding code in catalog planning, lifecycle validation/application, Just import/removal handling, handlers/types, init/update CLI reporting, documentation, and removal/regression tests.
- Reviewer-run read-only check: `git diff --check HEAD` passed. Verified `HEAD` and worktree path list with `git rev-parse` and `git status --short --untracked-files=all`.
- Controller-reported checks on the reviewed snapshot: `just test::test` passed (182/182); `just test::types` passed; scoped `just format::check` and scoped `just lint::check` passed. These checks were inspected in the assignment/implementation evidence and not rerun by this reviewer.
- Coverage limits: full-repository formatting was not run (the assignment notes unrelated baseline formatting issues); no additional tests were run by this reviewer.

## Declined to judge

- Ticket 03 directory-membership cleanup for files removed from an otherwise selected directory, including behavior when Skills are current or skipped, is explicitly deferred and was not reviewed as ticket 02 implementation.
- Ticket 04 coordinated preparation of all selected writes before any installation changes is explicitly deferred and was not reviewed as ticket 02 implementation.
- Full transactional rollback after application begins is out of scope in the design; the review assessed the required unsuccessful status and completed-change diagnostics instead.

## Assessment

One Minor issue remains, so the delivery is **With fixes**.

Ready to merge? **With fixes** — remove managed Just imports by the removed module target path, including aliases, and add regression coverage. No Critical or Important findings. No unresolved declined-behavior decisions within ticket 02.
